/**
 * auth.js — STRONG security for Unique AI (2026-11-25, user order:
 * «مضبوط سے پاورفل طریقے سے بنانا ہے تاکہ کوئی میرا یہ یوز کرے اور
 * مجھے بھی نقصان نہ ہو اسے بھی کوئی نقصان نہ ہو»).
 *
 * What this module owns, all free (Node built-in crypto only):
 *  1. LOGIN PER PERSON — real accounts. Passwords stored ONLY as
 *     scrypt hashes (salt + timing-safe compare). Never plaintext,
 *     never reversible. First account created = OWNER (admin); the
 *     owner creates/disables guest accounts. No account = no access.
 *     Sessions are random 32-byte tokens with 24h expiry. A wrong
 *     password NEVER reveals whether the name exists (one generic
 *     error, same timing path).
 *  2. OWN API KEY PER PERSON — each account's Gemini key is stored
 *     AES-256-GCM encrypted at rest (server master secret), never
 *     shown in full (masked …last4 only), never sent to the client.
 *     The server uses ONLY the logged-in user's key; a guest with no
 *     key gets an honest 402 and no AI — the owner's key is NEVER
 *     used for guests. (Owner falls back to the server env key,
 *     which IS the owner's own key on his machine.)
 *  3. ISOLATION — every read/write is scoped by the logged-in
 *     account id. A missing or wrong scope means DENIAL, never a
 *     fallback to someone else's data. No shared pool, no shared
 *     key, no cross-account path anywhere.
 *  4. RATE LIMITS — per-user daily buckets (chat / tts / api).
 *  5. INTRUSION ALERTS — a server-side security-events log (JSONL)
 *     + owner-only alerts API. Alert on: 5+ failed logins in 10 min,
 *     login from a new device, token reuse / expired-token abuse,
 *     rate-limit violations, pairing-code brute force, bad/missing
 *     tokens on /api, sudden key-use spikes. Each event names the
 *     account, the event, the time, and what was blocked.
 *
 * HONEST LIMIT (stated to the user, not hidden): the app can only
 * alert on attacks it can SEE — its own logins, API calls and
 * pairing. It CANNOT detect malware or hacking elsewhere on a
 * device outside the app. There is NO push channel into Muse chat
 * or to his phone — the in-app owner panel + this log IS the alert
 * delivery.
 *
 * Storage: server/data/ (gitignored — see .gitignore):
 *   users.json     — accounts (hashes + encrypted keys + devices)
 *   sessions.json  — live session tokens (24h expiry)
 *   .server-secret — master secret for key encryption (0600)
 *   security.log   — append-only JSONL security events
 *   alerts-read.json — owner's read watermark for the badge
 */

import crypto from "node:crypto";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");
const SECRET_FILE = path.join(DATA_DIR, ".server-secret");
const SECURITY_LOG = path.join(DATA_DIR, "security.log");
const READ_FILE = path.join(DATA_DIR, "alerts-read.json");

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_FAILED_LOGIN_WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILED_LOGINS = 5;
const MAX_ALERT_EVENTS_KEPT = 500;
const MAX_REQUEST_LOG_KEPT = 200;

// Daily per-user limits (free Gemini quotas are the real ceiling;
// these stop ONE account from draining a key in a day).
export const RATE_LIMITS = {
  owner: { chat: 300, tts: 300, api: 1000, keyHour: 300 },
  guest: { chat: 60, tts: 60, api: 200, keyHour: 100 },
};

// ---------------------------------------------------------------------------
// File helpers (0600/0700 — secrets never world-readable)
// ---------------------------------------------------------------------------

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(DATA_DIR, 0o700); } catch { /* best effort */ }
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  ensureDataDir();
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
  try { fs.chmodSync(file, 0o600); } catch { /* best effort */ }
}

function appendLine(file, line) {
  ensureDataDir();
  fs.appendFileSync(file, `${line}\n`, { mode: 0o600 });
}

// ---------------------------------------------------------------------------
// Master secret — encrypts per-user Gemini keys at rest.
// Env wins (Render / deployment); otherwise a generated file secret.
// ---------------------------------------------------------------------------

function getMasterKey() {
  const envSecret = (process.env.UNIQUE_SERVER_SECRET || "").trim();
  if (envSecret) return crypto.createHash("sha256").update(envSecret).digest();
  ensureDataDir();
  try {
    const saved = fs.readFileSync(SECRET_FILE, "utf8").trim();
    if (/^[0-9a-f]{64}$/.test(saved)) return Buffer.from(saved, "hex");
  } catch { /* fall through to generate */ }
  const generated = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(SECRET_FILE, generated, { mode: 0o600 });
  return Buffer.from(generated, "hex");
}

export function encryptSecret(plain) {
  const key = getMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64")}.${tag.toString("base64")}.${ct.toString("base64")}`;
}

export function decryptSecret(blob) {
  try {
    const parts = String(blob || "").split(".");
    if (parts.length !== 4 || parts[0] !== "v1") return null;
    const key = getMasterKey();
    const iv = Buffer.from(parts[1], "base64");
    const tag = Buffer.from(parts[2], "base64");
    const ct = Buffer.from(parts[3], "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Passwords — scrypt only. Never plaintext, never reversible.
// ---------------------------------------------------------------------------

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$v1$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password, stored) {
  try {
    const parts = String(stored || "").split("$");
    if (parts.length !== 4 || parts[0] !== "scrypt" || parts[1] !== "v1") return false;
    const salt = Buffer.from(parts[2], "hex");
    const expected = Buffer.from(parts[3], "hex");
    const actual = crypto.scryptSync(String(password), salt, 64, { N: 16384, r: 8, p: 1 });
    if (actual.length !== expected.length) return false;
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Users + sessions (in-memory caches over the JSON files)
// ---------------------------------------------------------------------------

let usersCache = null; // { users: [...] }
let sessionsCache = null; // { token: {...} }

function loadUsers() {
  if (!usersCache) {
    const data = readJson(USERS_FILE, { users: [] });
    usersCache = { users: Array.isArray(data.users) ? data.users : [] };
  }
  return usersCache;
}

function saveUsers() {
  writeJson(USERS_FILE, loadUsers());
}

function loadSessions() {
  if (!sessionsCache) {
    const data = readJson(SESSIONS_FILE, { sessions: {} });
    sessionsCache = { sessions: data.sessions && typeof data.sessions === "object" ? data.sessions : {} };
    // Drop expired on load.
    const now = Date.now();
    let changed = false;
    for (const [t, s] of Object.entries(sessionsCache.sessions)) {
      if (!s || s.expiresAt <= now) { delete sessionsCache.sessions[t]; changed = true; }
    }
    if (changed) saveSessions();
  }
  return sessionsCache;
}

function saveSessions() {
  writeJson(SESSIONS_FILE, loadSessions());
}

export function getUserById(id) {
  return loadUsers().users.find((u) => u.id === id) || null;
}

export function getUserByName(name) {
  const needle = String(name || "").trim().toLowerCase();
  return loadUsers().users.find((u) => String(u.name || "").toLowerCase() === needle) || null;
}

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    role: u.role,
    enabled: !!u.enabled,
    hasKey: !!u.keyEnc,
    keyLast4: u.keyLast4 || null,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt || null,
  };
}

function newVaultSalt() {
  return crypto.randomBytes(16).toString("base64");
}

function createUser({ name, password, role }) {
  const users = loadUsers().users;
  const user = {
    id: crypto.randomUUID(),
    name: String(name).trim(),
    passwordHash: hashPassword(password),
    role,
    enabled: true,
    keyEnc: null,
    keyLast4: null,
    vaultSalt: newVaultSalt(),
    devices: [],
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
  };
  users.push(user);
  saveUsers();
  return user;
}

function createSession(user, deviceId, deviceName) {
  const token = crypto.randomBytes(32).toString("hex");
  const now = Date.now();
  loadSessions().sessions[token] = {
    userId: user.id,
    deviceId: String(deviceId || "").slice(0, 64),
    deviceName: String(deviceName || "").slice(0, 40),
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
    lastSeen: now,
  };
  saveSessions();
  return token;
}

function invalidateUserSessions(userId) {
  const sessions = loadSessions().sessions;
  let changed = false;
  for (const [t, s] of Object.entries(sessions)) {
    if (s && s.userId === userId) { delete sessions[t]; changed = true; }
  }
  if (changed) saveSessions();
}

// ---------------------------------------------------------------------------
// Security events — JSONL log + in-memory ring for the owner panel.
// Every event names the account, the event, the time, and what was
// blocked. Noisy types are coalesced (1 log per key per window) so a
// stuck client cannot flood the log.
// ---------------------------------------------------------------------------

const alertRing = []; // newest last, capped
const coalesceLast = new Map(); // key -> timestamp

function coalesce(key, windowMs) {
  const now = Date.now();
  const last = coalesceLast.get(key) || 0;
  if (now - last < windowMs) return true;
  coalesceLast.set(key, now);
  return false;
}

export function securityEvent(type, fields = {}) {
  const event = {
    id: crypto.randomUUID().slice(0, 12),
    t: new Date().toISOString(),
    type,
    severity: fields.severity || "medium",
    accountId: fields.accountId || null,
    accountName: fields.accountName || null,
    deviceId: fields.deviceId || null,
    ip: fields.ip || null,
    detail: fields.detail || "",
    blocked: fields.blocked || "",
  };
  alertRing.push(event);
  if (alertRing.length > MAX_ALERT_EVENTS_KEPT) alertRing.splice(0, alertRing.length - MAX_ALERT_EVENTS_KEPT);
  try { appendLine(SECURITY_LOG, JSON.stringify(event)); } catch { /* log must never break a request */ }
  return event;
}

function readSecurityLogTail(limit) {
  try {
    const raw = fs.readFileSync(SECURITY_LOG, "utf8");
    const lines = raw.split("\n").filter(Boolean).slice(-limit);
    return lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch {
    return [];
  }
}

export function getAlertEvents(limit = 200) {
  // Ring buffer first (this process), backfilled from the file so a
  // restart does not wipe the owner's view.
  const fromFile = readSecurityLogTail(limit);
  const byId = new Map();
  for (const e of fromFile) byId.set(e.id, e);
  for (const e of alertRing) byId.set(e.id, e);
  return [...byId.values()].sort((a, b) => (a.t < b.t ? 1 : -1)).slice(0, limit);
}

function getReadWatermark() {
  const data = readJson(READ_FILE, { readThrough: null });
  return data.readThrough || null;
}

function setReadWatermark(iso) {
  writeJson(READ_FILE, { readThrough: iso });
}

export function getUnreadCount() {
  const mark = getReadWatermark();
  return getAlertEvents(MAX_ALERT_EVENTS_KEPT).filter((e) => !mark || e.t > mark).length;
}

// Request log (who called what, when) — owner-visible, ring only.
const requestLog = [];
export function logRequest(entry) {
  requestLog.push(entry);
  if (requestLog.length > MAX_REQUEST_LOG_KEPT) requestLog.shift();
}
export function getRequestLog(limit = 200) {
  return requestLog.slice(-limit).reverse();
}

// ---------------------------------------------------------------------------
// Failed-login tracking + token-reuse tracking
// ---------------------------------------------------------------------------

const failedLogins = new Map(); // `${name}|${ip}` -> timestamps[]
const expiredTokenHits = new Map(); // token -> count

function recordFailedLogin(name, ip) {
  const key = `${String(name || "").toLowerCase()}|${ip || "?"}`;
  const now = Date.now();
  const arr = (failedLogins.get(key) || []).filter((t) => now - t < MAX_FAILED_LOGIN_WINDOW_MS);
  arr.push(now);
  failedLogins.set(key, arr);
  if (arr.length >= MAX_FAILED_LOGINS) {
    securityEvent("auth.bruteforce", {
      severity: "high",
      accountName: String(name || ""),
      ip,
      detail: `${arr.length} غلط لاگ اِن کوششیں 10 منٹ میں`,
      blocked: "اس نام + IP سے لاگ اِن 10 منٹ کے لیے بند کر دیا گیا",
    });
    return true; // locked
  }
  return false;
}

function isLoginLocked(name, ip) {
  const key = `${String(name || "").toLowerCase()}|${ip || "?"}`;
  const now = Date.now();
  const arr = (failedLogins.get(key) || []).filter((t) => now - t < MAX_FAILED_LOGIN_WINDOW_MS);
  return arr.length >= MAX_FAILED_LOGINS;
}

// ---------------------------------------------------------------------------
// Rate limits — per-user, per-day buckets (+ rolling 1h key-use watch)
// ---------------------------------------------------------------------------

const rateCounters = new Map(); // `${userId}:${bucket}:${YYYY-MM-DD}` -> count
const keyHourUse = new Map(); // userId -> { windowStart, count }
const keySpikeAlerted = new Map(); // userId -> windowStart (one alert per hour)

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function checkRateLimit(user, bucket) {
  const limits = RATE_LIMITS[user.role === "owner" ? "owner" : "guest"];
  const limit = limits[bucket] ?? limits.api;
  const key = `${user.id}:${bucket}:${todayStr()}`;
  const used = rateCounters.get(key) || 0;
  if (used >= limit) {
    if (!coalesce(`ratelimit:${user.id}:${bucket}`, 60 * 60 * 1000)) {
      securityEvent("rate.limit", {
        severity: "high",
        accountId: user.id,
        accountName: user.name,
        detail: `روزانہ حد پار — ${bucket}: ${used}/${limit}`,
        blocked: `اس اکاؤنٹ کی ${bucket} درخواستیں آج کے لیے روک دی گئیں`,
      });
    }
    return { ok: false, limit, used };
  }
  rateCounters.set(key, used + 1);
  return { ok: true, limit, used: used + 1 };
}

function noteKeyUse(user) {
  const now = Date.now();
  const rec = keyHourUse.get(user.id) || { windowStart: now, count: 0 };
  if (now - rec.windowStart > 60 * 60 * 1000) { rec.windowStart = now; rec.count = 0; }
  rec.count += 1;
  keyHourUse.set(user.id, rec);
  const limits = RATE_LIMITS[user.role === "owner" ? "owner" : "guest"];
  if (rec.count >= limits.keyHour && keySpikeAlerted.get(user.id) !== rec.windowStart) {
    keySpikeAlerted.set(user.id, rec.windowStart);
    securityEvent("key.spike", {
      severity: "high",
      accountId: user.id,
      accountName: user.name,
      detail: `ایک گھنٹے میں ${rec.count} key استعمال — معمول سے اچانک زیادہ`,
      blocked: "key روکی نہیں گئی، مگر مالک کو خبردار کر دیا گیا — اگر یہ آپ نہیں ہیں تو key بدل دیں",
    });
  }
}

// ---------------------------------------------------------------------------
// Gemini key resolution — ISOLATION RULE: the server uses ONLY the
// logged-in user's own stored key. A guest with no key gets null (the
// caller answers honestly). The owner's fallback is the server env
// key — which IS the owner's own key on his machine. The owner's key
// is NEVER used for a guest, ever.
// ---------------------------------------------------------------------------

export function resolveGeminiKey(req) {
  const user = req.user;
  if (!user) return null;
  if (user.keyEnc) {
    const plain = decryptSecret(user.keyEnc);
    if (plain) {
      noteKeyUse(user);
      return plain;
    }
  }
  if (user.role === "owner") {
    const envKey = (process.env.GEMINI_API_KEY || "").trim();
    if (envKey) { noteKeyUse(user); return envKey; }
  }
  return null;
}

export function noKeyResponse(res) {
  res.status(402).json({
    error: "آپ کی اپنی Gemini key محفوظ نہیں ہے — سیٹنگز میں اپنی key لگائیں۔ مالک کی key کبھی استعمال نہیں ہوتی۔",
    errorType: "no_key",
  });
}

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd) return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress || req.ip || "?";
}

function resolveToken(req) {
  const h = req.headers.authorization || "";
  if (typeof h === "string" && h.toLowerCase().startsWith("bearer ")) {
    return h.slice(7).trim();
  }
  // Download links (plain <a href>) cannot carry a header — the token
  // may ride ?t= for GET /apps/* only. Everywhere else it is ignored.
  if (req.method === "GET" && typeof req.query?.t === "string") return req.query.t.trim();
  return null;
}

export function resolveUserFromToken(token) {
  if (!token) return null;
  const sessions = loadSessions().sessions;
  const s = sessions[token];
  if (!s) return null;
  if (s.expiresAt <= Date.now()) {
    // Expired token presented again and again = abuse signal.
    const n = (expiredTokenHits.get(token) || 0) + 1;
    expiredTokenHits.set(token, n);
    if (n === 3) {
      securityEvent("auth.token_reuse", {
        severity: "high",
        accountId: s.userId,
        detail: "ختم شدہ سیشن ٹوکن بار بار استعمال ہوا",
        blocked: "پرانا ٹوکن قبول نہیں ہوا",
      });
    }
    delete sessions[token];
    saveSessions();
    return null;
  }
  const user = getUserById(s.userId);
  if (!user || !user.enabled) return null;
  s.lastSeen = Date.now();
  return { user, session: s, token };
}

export function requireAuth(req, res, next) {
  const token = resolveToken(req);
  if (!token) {
    if (!coalesce(`badtoken:${clientIp(req)}`, 5 * 60 * 1000)) {
      securityEvent("auth.bad_token", {
        severity: "medium",
        ip: clientIp(req),
        detail: `${req.method} ${req.path} — بغیر ٹوکن کے API کال`,
        blocked: "بغیر لاگ اِن کے درخواست مسترد کر دی گئی",
      });
    }
    res.status(401).json({ error: "پہلے لاگ اِن کریں۔" });
    return;
  }
  const resolved = resolveUserFromToken(token);
  if (!resolved) {
    if (!coalesce(`badtoken:${clientIp(req)}`, 5 * 60 * 1000)) {
      securityEvent("auth.bad_token", {
        severity: "medium",
        ip: clientIp(req),
        detail: `${req.method} ${req.path} — غلط یا ختم شدہ ٹوکن`,
        blocked: "غلط ٹوکن والی درخواست مسترد کر دی گئی",
      });
    }
    res.status(401).json({ error: "سیشن ختم ہو گیا — دوبارہ لاگ اِن کریں۔" });
    return;
  }
  req.user = resolved.user;
  req.session = resolved.session;
  req.sessionToken = token;
  // Per-user daily API cap (chat/tts have their own tighter buckets).
  const limit = checkRateLimit(resolved.user, "api");
  if (!limit.ok) {
    res.status(429).json({ error: "آج کی حد ختم — کل دوبارہ کوشش کریں۔" });
    return;
  }
  res.on("finish", () => {
    logRequest({
      t: new Date().toISOString(),
      userId: resolved.user.id,
      userName: resolved.user.name,
      method: req.method,
      path: req.path,
      status: res.statusCode,
    });
  });
  next();
}

export function requireOwner(req, res, next) {
  if (!req.user || req.user.role !== "owner") {
    securityEvent("auth.forbidden", {
      severity: "medium",
      accountId: req.user?.id || null,
      accountName: req.user?.name || null,
      ip: clientIp(req),
      detail: `${req.method} ${req.path} — مالک کا حصہ کھولنے کی کوشش`,
      blocked: "غیر مالک کی درخواست مسترد کر دی گئی",
    });
    res.status(403).json({ error: "یہ حصہ صرف مالک کے لیے ہے۔" });
    return;
  }
  next();
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validName(name) {
  const n = String(name || "").trim();
  return n.length >= 2 && n.length <= 40 && !/[\s<>/"\\]/.test(n);
}

function validPassword(pw) {
  return typeof pw === "string" && pw.length >= 8;
}

const GENERIC_LOGIN_ERROR = "نام یا پاسورڈ غلط ہے۔";

// ---------------------------------------------------------------------------
// Router — /api/auth/*
// ---------------------------------------------------------------------------

export const authRouter = express.Router();

authRouter.get("/status", (_req, res) => {
  res.json({ setupNeeded: loadUsers().users.length === 0 });
});

authRouter.post("/setup", (req, res) => {
  if (loadUsers().users.length > 0) {
    res.status(403).json({ error: "مالک اکاؤنٹ پہلے سے موجود ہے۔" });
    return;
  }
  const { name, password } = req.body ?? {};
  if (!validName(name)) {
    res.status(400).json({ error: "نام 2 سے 40 حرف کا ہو، بغیر خالی جگہ کے۔" });
    return;
  }
  if (!validPassword(password)) {
    res.status(400).json({ error: "پاسورڈ کم از کم 8 حرف کا ہو۔" });
    return;
  }
  const user = createUser({ name, password, role: "owner" });
  const token = createSession(user, req.body?.deviceId, req.body?.deviceName);
  securityEvent("auth.setup", {
    severity: "info",
    accountId: user.id,
    accountName: user.name,
    ip: clientIp(req),
    detail: "مالک اکاؤنٹ بنایا گیا",
    blocked: "",
  });
  res.json({ token, user: publicUser(user), vaultSalt: user.vaultSalt });
});

authRouter.post("/login", (req, res) => {
  const { name, password, deviceId, deviceName } = req.body ?? {};
  const ip = clientIp(req);
  // Same generic error + same timing for every failure: a wrong
  // password never reveals whether the name exists.
  if (isLoginLocked(name, ip)) {
    res.status(429).json({ error: "بہت کوششیں ہو گئیں — تھوڑی دیر بعد کوشش کریں۔" });
    return;
  }
  const user = getUserByName(name);
  const ok = !!user && !!user.enabled && verifyPassword(password, user?.passwordHash || "");
  if (!ok) {
    securityEvent("auth.login_fail", {
      severity: "medium",
      accountName: String(name || ""),
      ip,
      detail: "غلط لاگ اِن کوشش",
      blocked: "لاگ اِن نہیں ہوا",
    });
    recordFailedLogin(name, ip);
    res.status(401).json({ error: GENERIC_LOGIN_ERROR });
    return;
  }
  const devId = String(deviceId || "").slice(0, 64);
  const isNewDevice = devId && !user.devices.some((d) => d.id === devId);
  if (devId) {
    const known = user.devices.find((d) => d.id === devId);
    if (known) known.lastSeen = new Date().toISOString();
    else user.devices.push({ id: devId, name: String(deviceName || "").slice(0, 40), firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString() });
    if (user.devices.length > 10) user.devices = user.devices.slice(-10);
  }
  user.lastLoginAt = new Date().toISOString();
  saveUsers();
  const token = createSession(user, devId, deviceName);
  securityEvent("auth.login", {
    severity: "info",
    accountId: user.id,
    accountName: user.name,
    deviceId: devId || null,
    ip,
    detail: isNewDevice ? "نئی ڈیوائس سے لاگ اِن" : "لاگ اِن کامیاب",
    blocked: "",
  });
  if (isNewDevice) {
    securityEvent("auth.new_device", {
      severity: "high",
      accountId: user.id,
      accountName: user.name,
      deviceId: devId,
      ip,
      detail: `نئی ڈیوائس سے لاگ اِن — ${String(deviceName || "نامعلوم ڈیوائس")}`,
      blocked: "لاگ اِن ہوا مگر مالک کو خبردار کر دیا گیا — اگر یہ آپ نہیں ہیں تو پاسورڈ بدل دیں",
    });
  }
  res.json({ token, user: publicUser(user), vaultSalt: user.vaultSalt });
});

authRouter.post("/logout", requireAuth, (req, res) => {
  const sessions = loadSessions().sessions;
  if (req.sessionToken && sessions[req.sessionToken]) {
    delete sessions[req.sessionToken];
    saveSessions();
  }
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

authRouter.post("/password", requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body ?? {};
  if (!verifyPassword(currentPassword, req.user.passwordHash)) {
    res.status(401).json({ error: GENERIC_LOGIN_ERROR });
    return;
  }
  if (!validPassword(newPassword)) {
    res.status(400).json({ error: "نیا پاسورڈ کم از کم 8 حرف کا ہو۔" });
    return;
  }
  req.user.passwordHash = hashPassword(newPassword);
  saveUsers();
  securityEvent("auth.password_change", {
    severity: "info",
    accountId: req.user.id,
    accountName: req.user.name,
    ip: clientIp(req),
    detail: "اپنا پاسورڈ بدلا گیا",
    blocked: "",
  });
  res.json({ ok: true });
});

// --- Forgot password (unauthenticated reset for a locked-out user) -------
// HONESTY RULE: the password IS the memory-encryption key (AES-GCM,
// password-derived). Resetting it can NEVER unlock the old encrypted
// memory — the UI must say this plainly BEFORE the reset. The reset
// therefore:
//   1. keeps the old vault salt in user.vaultArchives (never deleted),
//      so the archived vault can be opened again if the old password
//      is ever remembered;
//   2. invalidates EVERY session of the account;
//   3. issues a fresh session under the new password + a fresh salt;
//   4. logs a HIGH severity event (owner alerts panel).
// The client archives the old vault blobs in localStorage before the
// new session is used. Rate discipline mirrors login: 5 failures in
// 10 minutes per name+IP lock the name for 10 minutes, and failures
// never reveal whether the name exists (same generic error as login).

authRouter.post("/forgot-password", (req, res) => {
  const { name } = req.body ?? {};
  const ip = clientIp(req);
  if (isLoginLocked(name, ip)) {
    res.status(429).json({ error: "بہت کوششیں ہو گئیں — تھوڑی دیر بعد کوشش کریں۔" });
    return;
  }
  // Deliberately always ok: the answer never reveals whether the
  // account exists. The reset step validates the name.
  res.json({ ok: true });
});

authRouter.post("/reset-password", (req, res) => {
  const { name, newPassword, confirmed, deviceId, deviceName } = req.body ?? {};
  const ip = clientIp(req);
  if (isLoginLocked(name, ip)) {
    res.status(429).json({ error: "بہت کوششیں ہو گئیں — تھوڑی دیر بعد کوشش کریں۔" });
    return;
  }
  if (confirmed !== true) {
    res.status(400).json({ error: "پہلے انتباہ پڑھ کر تصدیق کریں۔" });
    return;
  }
  if (!validPassword(newPassword)) {
    recordFailedLogin(name, ip);
    res.status(400).json({ error: "نیا پاسورڈ کم از کم 8 حرف کا ہو۔" });
    return;
  }
  const user = getUserByName(name);
  if (!user || !user.enabled) {
    recordFailedLogin(name, ip);
    securityEvent("auth.login_fail", {
      severity: "medium",
      accountName: String(name || ""),
      ip,
      detail: "غلط نام سے پاسورڈ ری سیٹ کی کوشش",
      blocked: "ری سیٹ نہیں ہوا",
    });
    res.status(401).json({ error: GENERIC_LOGIN_ERROR });
    return;
  }
  // Preserve the old vault salt: the old encrypted vault stays
  // openable if the old password is ever remembered. NEVER delete.
  const oldSalt = user.vaultSalt;
  const archives = Array.isArray(user.vaultArchives) ? user.vaultArchives : [];
  archives.push({ salt: oldSalt, at: new Date().toISOString(), reason: "forgot-password" });
  user.vaultArchives = archives;
  user.vaultSalt = newVaultSalt();
  user.passwordHash = hashPassword(newPassword);
  // The resetting device becomes the only known device; every other
  // session + device trust is dropped.
  const devId = String(deviceId || "").slice(0, 64);
  user.devices = devId
    ? [{ id: devId, name: String(deviceName || "").slice(0, 40), firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString() }]
    : [];
  user.lastLoginAt = new Date().toISOString();
  invalidateUserSessions(user.id);
  saveUsers();
  const token = createSession(user, devId, deviceName);
  securityEvent("auth.password_reset_forgot", {
    severity: "high",
    accountId: user.id,
    accountName: user.name,
    deviceId: devId || null,
    ip,
    detail: "پاس ورڈ بھول جانے پر ری سیٹ — پرانی خفیہ میموری نئے پاسورڈ سے نہیں کھلے گی، پرانا ڈیٹا محفوظ ہے",
    blocked: "اس اکاؤنٹ کے سارے پرانے سیشن ختم کر دیے گئے",
  });
  res.json({ token, user: publicUser(user), vaultSalt: user.vaultSalt, archived: true });
});

// --- Own Gemini key (encrypted at rest, masked on read) -------------------

async function validateGeminiKey(key) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    let res;
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
        { signal: ctrl.signal },
      );
    } finally {
      clearTimeout(timer);
    }
    return res.ok;
  } catch {
    return false;
  }
}

authRouter.post("/key", requireAuth, async (req, res) => {
  const key = String(req.body?.key || "").trim();
  if (!key || key.length < 10) {
    res.status(400).json({ error: "درست key لکھیں۔" });
    return;
  }
  const valid = await validateGeminiKey(key);
  if (!valid) {
    res.status(400).json({ error: "یہ key کام نہیں کر رہی — چیک کر کے دوبارہ لکھیں۔" });
    return;
  }
  req.user.keyEnc = encryptSecret(key);
  req.user.keyLast4 = key.slice(-4);
  saveUsers();
  securityEvent("auth.key_saved", {
    severity: "info",
    accountId: req.user.id,
    accountName: req.user.name,
    detail: "اپنی Gemini key محفوظ کی گئی",
    blocked: "",
  });
  res.json({ ok: true, hasKey: true, keyLast4: req.user.keyLast4 });
});

authRouter.get("/key", requireAuth, (req, res) => {
  res.json({ hasKey: !!req.user.keyEnc, keyLast4: req.user.keyLast4 || null });
});

authRouter.delete("/key", requireAuth, (req, res) => {
  req.user.keyEnc = null;
  req.user.keyLast4 = null;
  saveUsers();
  res.json({ ok: true });
});

// --- Owner-only admin ------------------------------------------------------

authRouter.get("/admin/users", requireAuth, requireOwner, (_req, res) => {
  res.json({ users: loadUsers().users.map(publicUser) });
});

authRouter.post("/admin/users", requireAuth, requireOwner, (req, res) => {
  const { name, password } = req.body ?? {};
  if (!validName(name)) {
    res.status(400).json({ error: "نام 2 سے 40 حرف کا ہو، بغیر خالی جگہ کے۔" });
    return;
  }
  if (!validPassword(password)) {
    res.status(400).json({ error: "پاسورڈ کم از کم 8 حرف کا ہو۔" });
    return;
  }
  if (getUserByName(name)) {
    res.status(400).json({ error: "اس نام کا اکاؤنٹ پہلے سے ہے۔" });
    return;
  }
  const user = createUser({ name, password, role: "guest" });
  securityEvent("auth.account_created", {
    severity: "info",
    accountId: user.id,
    accountName: user.name,
    detail: `مالک نے مہمان اکاؤنٹ بنایا — ${user.name}`,
    blocked: "",
  });
  res.json({ user: publicUser(user) });
});

authRouter.post("/admin/users/:id/disable", requireAuth, requireOwner, (req, res) => {
  const target = getUserById(req.params.id);
  if (!target || target.role === "owner") {
    res.status(404).json({ error: "اکاؤنٹ نہیں ملا۔" });
    return;
  }
  target.enabled = false;
  saveUsers();
  invalidateUserSessions(target.id);
  res.json({ ok: true });
});

authRouter.post("/admin/users/:id/enable", requireAuth, requireOwner, (req, res) => {
  const target = getUserById(req.params.id);
  if (!target) {
    res.status(404).json({ error: "اکاؤنٹ نہیں ملا۔" });
    return;
  }
  target.enabled = true;
  saveUsers();
  res.json({ ok: true });
});

authRouter.post("/admin/users/:id/reset-password", requireAuth, requireOwner, (req, res) => {
  const target = getUserById(req.params.id);
  if (!target || target.role === "owner") {
    res.status(404).json({ error: "اکاؤنٹ نہیں ملا۔" });
    return;
  }
  const { password } = req.body ?? {};
  if (!validPassword(password)) {
    res.status(400).json({ error: "نیا پاسورڈ کم از کم 8 حرف کا ہو۔" });
    return;
  }
  target.passwordHash = hashPassword(password);
  saveUsers();
  invalidateUserSessions(target.id);
  securityEvent("auth.password_reset", {
    severity: "medium",
    accountId: target.id,
    accountName: target.name,
    detail: "مالک نے اس اکاؤنٹ کا پاسورڈ بدلا — پرانی خفیہ میموری نئے پاسورڈ سے نہیں کھلے گی",
    blocked: "اس اکاؤنٹ کے سارے سیشن ختم کر دیے گئے",
  });
  res.json({ ok: true });
});

authRouter.get("/admin/alerts", requireAuth, requireOwner, (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 200)));
  res.json({ events: getAlertEvents(limit), unread: getUnreadCount() });
});

authRouter.post("/admin/alerts/read", requireAuth, requireOwner, (_req, res) => {
  setReadWatermark(new Date().toISOString());
  res.json({ ok: true, unread: 0 });
});

authRouter.get("/admin/logins", requireAuth, requireOwner, (req, res) => {
  const events = getAlertEvents(500).filter((e) =>
    ["auth.login", "auth.login_fail", "auth.bruteforce", "auth.new_device"].includes(e.type),
  );
  res.json({ events: events.slice(0, 100) });
});

authRouter.get("/admin/requests", requireAuth, requireOwner, (req, res) => {
  res.json({ entries: getRequestLog(200) });
});

// ---------------------------------------------------------------------------
// Pairing hooks — the relay calls back here so pairing abuse also lands
// in the same security log. Wired from index.js.
// ---------------------------------------------------------------------------

export const pairingSecurity = {
  bruteForce(ip, detail) {
    securityEvent("pair.bruteforce", {
      severity: "high",
      ip,
      detail,
      blocked: "غلط کوڈ کی کوششیں روک دی گئیں — نیا کوڈ بنائیں",
    });
  },
};
