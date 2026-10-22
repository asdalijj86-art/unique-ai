/**
 * sim-pairing.mjs — two-client simulation of the device-pairing relay
 * (Task 6b) against the REAL server code: it boots an express app with
 * registerPairingRoutes (the same function server/index.js uses) on an
 * ephemeral port, then plays a phone and a laptop through:
 *   create code → wrong code rejected → join → creator discovers link
 *   via /check → conversation handover delivered on poll → open-tool
 *   command delivered → code reuse rejected (single-use) → leave →
 *   peer's next poll reports closed.
 *
 * Run from the SERVER directory so express/qrcode resolve:
 *   node server/sim-pairing.mjs   (from the repo root)
 * or: node sim-pairing.mjs (cwd: server/)
 * It lives in server/ so express/qrcode resolve from server/node_modules.
 */
import express from 'express';
import { registerPairingRoutes } from './pairing.js';

const app = express();
app.use(express.json({ limit: '1mb' }));
registerPairingRoutes(app);

const server = await new Promise((resolve) => {
  const s = app.listen(0, '127.0.0.1', () => resolve(s));
});
const base = `http://127.0.0.1:${server.address().port}`;

let failed = 0;
function check(label, condition, detail = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failed++;
}

async function post(path, body) {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

const phone = { deviceId: 'phone-1', name: 'میرا فون', type: 'phone' };
const laptop = { deviceId: 'laptop-1', name: 'میرا لیپ ٹاپ', type: 'laptop' };

// 1) Laptop creates a code.
const created = await post('/api/pair/create', laptop);
check('laptop creates a 6-digit code', created.status === 200 && /^\d{6}$/.test(created.data.code || ''), `code=${created.data.code}`);
const code = created.data.code;

// 2) Wrong code is rejected.
const wrong = await post('/api/pair/join', { code: '000000' === code ? '111111' : '000000', ...phone });
check('wrong code rejected with 404', wrong.status === 404, `status=${wrong.status}`);

// 3) Phone joins with the right code.
const joined = await post('/api/pair/join', { code, ...phone });
check('phone joins with the code', joined.status === 200 && !!joined.data.sessionId, `peer=${joined.data.peer?.name}`);
const sessionId = joined.data.sessionId;
check('join tells the phone its peer (laptop)', joined.data.peer?.name === laptop.name);

// 4) The code is single-use: a third device cannot reuse it.
const reuse = await post('/api/pair/join', { code, deviceId: 'tablet-9', name: 'ٹیب', type: 'tablet' });
check('code is single-use (reuse rejected)', reuse.status === 404, `status=${reuse.status}`);

// 5) Creator discovers the link via /check and gets the same session.
const discovered = await post('/api/pair/check', { code, deviceId: laptop.deviceId });
check('creator discovers link via /check', discovered.data.linked === true && discovered.data.sessionId === sessionId);
check('creator sees the phone as peer', discovered.data.peer?.name === phone.name);

// 6) Laptop sends the current conversation; phone receives it on poll.
const convo = {
  title: 'ٹیسٹ گفتگو',
  messages: [
    { role: 'user', content: 'السلام علیکم' },
    { role: 'assistant', content: 'وعلیکم السلام! کیسے ہیں آپ؟' },
  ],
};
const sent = await post('/api/pair/send', { sessionId, deviceId: laptop.deviceId, kind: 'conversation', payload: convo });
check('conversation send accepted', sent.status === 200 && sent.data.ok === true);
const phonePoll = await post('/api/pair/poll', { sessionId, deviceId: phone.deviceId });
const received = (phonePoll.data.messages || []).find((m) => m.kind === 'conversation');
check('phone poll delivers the conversation', !!received && received.payload.messages.length === 2 && received.payload.title === convo.title);
check('delivery names the sender', received?.from?.name === laptop.name);
check('poll reports the laptop peer as online', phonePoll.data.peer?.online === true && phonePoll.data.peer?.name === laptop.name);
const phonePoll2 = await post('/api/pair/poll', { sessionId, deviceId: phone.deviceId });
check('queue drains (second poll is empty)', (phonePoll2.data.messages || []).length === 0);

// 7) Phone sends an open-tool command; laptop receives it.
const cmdSent = await post('/api/pair/send', { sessionId, deviceId: phone.deviceId, kind: 'command', payload: { action: 'open_quran' } });
check('command send accepted', cmdSent.status === 200 && cmdSent.data.ok === true);
const laptopPoll = await post('/api/pair/poll', { sessionId, deviceId: laptop.deviceId });
const cmd = (laptopPoll.data.messages || []).find((m) => m.kind === 'command');
check('laptop poll delivers the open_quran command', cmd?.payload?.action === 'open_quran');

// 8) A bogus command action is rejected.
const bogus = await post('/api/pair/send', { sessionId, deviceId: phone.deviceId, kind: 'command', payload: { action: 'factory_reset' } });
check('unknown command action rejected', bogus.status === 400, `status=${bogus.status}`);

// 9) Self-join is refused (fresh code, same device tries to join it).
const created2 = await post('/api/pair/create', phone);
const selfJoin = await post('/api/pair/join', { code: created2.data.code, ...phone });
check('self-join refused', selfJoin.status === 400, `status=${selfJoin.status}`);

// 10) Phone leaves; laptop's next poll reports the session closed.
await post('/api/pair/leave', { sessionId, deviceId: phone.deviceId });
const afterLeave = await post('/api/pair/poll', { sessionId, deviceId: laptop.deviceId });
check('after leave, peer poll reports closed', afterLeave.data.closed === true);

// 11) QR endpoint returns a real PNG.
const qrRes = await fetch(`${base}/api/pair/qr?text=${encodeURIComponent('https://unique-ai-n4p3.onrender.com/?pair=123456')}`);
const qrBuf = Buffer.from(await qrRes.arrayBuffer());
check('QR endpoint returns a PNG', qrRes.status === 200 && qrBuf.length > 200 && qrBuf.subarray(0, 4).toString('hex') === '89504e47', `${qrBuf.length} bytes`);

server.close();
console.log(failed === 0 ? '\nALL PAIRING CHECKS PASS' : `\n${failed} PAIRING CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
