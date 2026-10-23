/**
 * pairing.js — device-pairing relay (Task 6b).
 *
 * Links the Unique AI app running on two of the user's own devices
 * (e.g. phone + laptop) so they can hand over the current conversation
 * and send simple "open this" commands to each other.
 *
 * Design constraints (honest scope): this is an APP-TO-APP link while
 * the app is open on both devices — NOT remote control of the phone.
 * No accounts, no database: pending codes and sessions live in RAM
 * only, codes are random + single-use + expire in 10 minutes, and a
 * session dies on disconnect or after 30 minutes idle (or on server
 * restart — acceptable on the free tier and stated in the UI).
 */
import { randomInt, randomUUID } from "node:crypto";
import QRCode from "qrcode";

const CODE_TTL_MS = 10 * 60 * 1000; // pairing code lifetime
const SESSION_IDLE_MS = 30 * 60 * 1000; // linked session idle timeout
const TOMBSTONE_MS = 60 * 1000; // how long a closed session is remembered
const ONLINE_MS = 15 * 1000; // peer counts as online if polled within 15s
const MAX_MESSAGE_BYTES = 200 * 1024;

const COMMAND_ACTIONS = new Set(["open_quran", "open_map", "open_tools", "open_tool"]);

// Call signalling (Phase 4 — «کال»): a TURN-BASED voice link between
// the two linked app instances (phone = remote mic+speaker for the
// laptop's Unique). The relay stays a dumb, honest pipe: it validates
// the call message shapes and delivers them in order; the call state
// machine (ringing, the ~30s no-answer timeout, accept/reject) lives
// in the clients. call_utterance / call_reply carry one spoken turn's
// TEXT each — no audio crosses the relay, ever.
const CALL_TYPES = new Set(["call_invite", "call_accept", "call_reject", "call_end", "call_utterance", "call_reply"]);
const CALL_TEXT_TYPES = new Set(["call_utterance", "call_reply"]);
const MAX_CALL_TEXT_CHARS = 8000;

function cleanDevice(input) {
  const name = String(input?.name || "").trim().slice(0, 40) || "ڈیوائس";
  const type = String(input?.type || "").trim().slice(0, 20) || "device";
  const id = String(input?.deviceId || "").trim().slice(0, 64);
  return { id, name, type, lastSeen: Date.now() };
}

export function createPairingRelay(now = () => Date.now()) {
  const codes = new Map(); // code -> { device, expiresAt }
  const codeSessions = new Map(); // consumed code -> sessionId (creator discovers the link by checking its code)
  const sessions = new Map(); // sessionId -> { devices: Map<id, device>, queues: Map<id, msg[]>, lastActivity }
  const tombstones = new Map(); // sessionId -> expiresAt

  function sweep() {
    const t = now();
    for (const [code, entry] of codes) if (entry.expiresAt <= t) codes.delete(code);
    for (const [sid, s] of sessions) if (t - s.lastActivity > SESSION_IDLE_MS) sessions.delete(sid);
    for (const [code, sid] of codeSessions) if (!sessions.has(sid)) codeSessions.delete(code);
    for (const [sid, exp] of tombstones) if (exp <= t) tombstones.delete(sid);
  }

  function newCode() {
    for (let attempt = 0; attempt < 20; attempt++) {
      const code = String(randomInt(0, 1000000)).padStart(6, "0");
      if (!codes.has(code)) return code;
    }
    return String(randomInt(0, 1000000)).padStart(6, "0");
  }

  function createCode(deviceInput) {
    sweep();
    const device = cleanDevice(deviceInput);
    if (!device.id) return { ok: false, error: "device_required" };
    // One live code per device: re-asking replaces the old code.
    for (const [code, entry] of codes) if (entry.device.id === device.id) codes.delete(code);
    const code = newCode();
    codes.set(code, { device, expiresAt: now() + CODE_TTL_MS });
    return { ok: true, code, expiresInSec: Math.round(CODE_TTL_MS / 1000) };
  }

  function join(codeInput, deviceInput) {
    sweep();
    const code = String(codeInput || "").trim();
    const entry = codes.get(code);
    if (!entry) return { ok: false, error: "code_not_found" };
    const device = cleanDevice(deviceInput);
    if (!device.id) return { ok: false, error: "device_required" };
    if (entry.device.id === device.id) return { ok: false, error: "self_join" };
    codes.delete(code); // single-use: consumed whether or not it succeeds below
    const sessionId = randomUUID();
    codeSessions.set(code, sessionId);
    const devices = new Map([
      [entry.device.id, { ...entry.device, lastSeen: now() }],
      [device.id, device],
    ]);
    sessions.set(sessionId, {
      devices,
      queues: new Map([
        [entry.device.id, []],
        [device.id, []],
      ]),
      lastActivity: now(),
    });
    const peer = entry.device;
    return { ok: true, sessionId, peer: { name: peer.name, type: peer.type } };
  }

  // The code's creator polls this to learn that the link happened and
  // which session it became.
  function checkCode(codeInput, deviceId) {
    sweep();
    const code = String(codeInput || "").trim();
    const sessionId = codeSessions.get(code);
    if (!sessionId) return { ok: true, linked: false };
    const session = sessions.get(sessionId);
    if (!session || !session.devices.has(String(deviceId || ""))) return { ok: true, linked: false };
    const peer = peerOf(session, String(deviceId || ""));
    return { ok: true, linked: true, sessionId, peer: peer ? { name: peer.name, type: peer.type } : null };
  }

  function getSession(sessionId, deviceId) {
    const session = sessions.get(String(sessionId || ""));
    if (!session) return null;
    if (!session.devices.has(String(deviceId || ""))) return null;
    return session;
  }

  function peerOf(session, deviceId) {
    for (const [id, device] of session.devices) {
      if (id !== deviceId) return device;
    }
    return null;
  }

  function poll(sessionId, deviceId) {
    sweep();
    const id = String(deviceId || "");
    if (tombstones.has(String(sessionId || ""))) return { ok: true, closed: true, messages: [] };
    const session = getSession(sessionId, id);
    if (!session) return { ok: true, closed: true, messages: [] };
    const me = session.devices.get(id);
    me.lastSeen = now();
    session.lastActivity = now();
    const peer = peerOf(session, id);
    const queue = session.queues.get(id) || [];
    session.queues.set(id, []);
    return {
      ok: true,
      closed: false,
      peer: peer
        ? { name: peer.name, type: peer.type, online: now() - peer.lastSeen < ONLINE_MS }
        : null,
      messages: queue,
    };
  }

  function send(sessionId, deviceId, kind, payload) {
    sweep();
    const id = String(deviceId || "");
    const session = getSession(sessionId, id);
    if (!session) return { ok: false, error: "session_closed" };
    if (kind !== "conversation" && kind !== "command" && kind !== "call") return { ok: false, error: "bad_kind" };
    if (kind === "command" && !COMMAND_ACTIONS.has(String(payload?.action || ""))) {
      return { ok: false, error: "bad_action" };
    }
    if (kind === "call") {
      const callType = String(payload?.type || "");
      if (!CALL_TYPES.has(callType)) return { ok: false, error: "bad_call_type" };
      if (CALL_TEXT_TYPES.has(callType)) {
        if (typeof payload?.text !== "string" || payload.text.length > MAX_CALL_TEXT_CHARS) {
          return { ok: false, error: "bad_payload" };
        }
      }
    }
    let serialized;
    try {
      serialized = JSON.stringify(payload ?? {});
    } catch {
      return { ok: false, error: "bad_payload" };
    }
    if (serialized.length > MAX_MESSAGE_BYTES) return { ok: false, error: "too_large" };
    const peer = peerOf(session, id);
    if (!peer) return { ok: false, error: "no_peer" };
    const queue = session.queues.get(peer.id) || [];
    const me = session.devices.get(id);
    queue.push({
      kind,
      payload: JSON.parse(serialized),
      from: { name: me?.name || "", type: me?.type || "" },
      at: now(),
    });
    session.queues.set(peer.id, queue);
    session.lastActivity = now();
    return { ok: true, peerOnline: now() - peer.lastSeen < ONLINE_MS };
  }

  function leave(sessionId, deviceId) {
    const sid = String(sessionId || "");
    const session = sessions.get(sid);
    if (session && session.devices.has(String(deviceId || ""))) {
      sessions.delete(sid);
      tombstones.set(sid, now() + TOMBSTONE_MS);
    }
    return { ok: true };
  }

  return { createCode, join, checkCode, poll, send, leave, _sizes: () => ({ codes: codes.size, sessions: sessions.size }) };
}

export function registerPairingRoutes(app, relay = createPairingRelay()) {
  const fail = (res, status, error, message) => res.status(status).json({ error, message });

  app.post("/api/pair/create", (req, res) => {
    const result = relay.createCode(req.body ?? {});
    if (!result.ok) return fail(res, 400, result.error, "ڈیوائس کی شناخت نہیں ملی۔");
    res.json({ code: result.code, expiresInSec: result.expiresInSec });
  });

  app.post("/api/pair/join", (req, res) => {
    const { code, ...device } = req.body ?? {};
    const result = relay.join(code, device);
    if (!result.ok) {
      if (result.error === "code_not_found")
        return fail(res, 404, result.error, "یہ کوڈ درست نہیں یا ختم ہو چکا ہے — نیا کوڈ بنائیں۔");
      if (result.error === "self_join")
        return fail(res, 400, result.error, "اپنے ہی کوڈ سے نہیں جُڑ سکتے — کوڈ دوسری ڈیوائس پر ڈالیں۔");
      return fail(res, 400, result.error, "جوڑنے میں مسئلہ ہوا۔");
    }
    res.json({ sessionId: result.sessionId, peer: result.peer });
  });

  app.post("/api/pair/check", (req, res) => {
    const { code, deviceId } = req.body ?? {};
    res.json(relay.checkCode(code, deviceId));
  });

  app.post("/api/pair/poll", (req, res) => {
    const { sessionId, deviceId } = req.body ?? {};
    res.json(relay.poll(sessionId, deviceId));
  });

  app.post("/api/pair/send", (req, res) => {
    const { sessionId, deviceId, kind, payload } = req.body ?? {};
    const result = relay.send(sessionId, deviceId, kind, payload);
    if (!result.ok) {
      if (result.error === "too_large")
        return fail(res, 413, result.error, "گفتگو بہت لمبی ہے — بھیجی نہیں جا سکی۔");
      if (result.error === "session_closed")
        return fail(res, 410, result.error, "رابطہ ختم ہو چکا ہے — دوبارہ جوڑیں۔");
      return fail(res, 400, result.error, "بھیجنے میں مسئلہ ہوا۔");
    }
    res.json(result);
  });

  app.post("/api/pair/leave", (req, res) => {
    const { sessionId, deviceId } = req.body ?? {};
    res.json(relay.leave(sessionId, deviceId));
  });

  // QR of a pairing link (the app URL with ?pair=CODE) so the second
  // device's camera opens the app with the code pre-filled.
  app.get("/api/pair/qr", async (req, res) => {
    const text = String(req.query.text || "").slice(0, 300);
    if (!text) return fail(res, 400, "text_required", "متن درکار ہے۔");
    try {
      const png = await QRCode.toBuffer(text, { type: "png", width: 220, margin: 1 });
      res.type("png").send(png);
    } catch {
      fail(res, 500, "qr_failed", "QR نہیں بن سکا۔");
    }
  });

  return relay;
}
