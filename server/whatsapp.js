/**
 * WhatsApp connection manager using Baileys (unofficial WhatsApp Web API).
 *
 * WARNING: This uses an unofficial client. WhatsApp may ban numbers that use
 * unofficial clients. The user has been warned and accepted this risk.
 *
 * Flow:
 * 1. GET /api/whatsapp/status → { connected: false, qr: "data:image/png;base64,..." }
 *    User scans QR with their phone (WhatsApp → Linked Devices → Link a Device)
 * 2. Once linked: { connected: true }
 * 3. POST /api/whatsapp/send { to: "923001234567", text: "hello" } → sends message
 *
 * Auth state is persisted to server/whatsapp-auth/ so reconnections don't
 * need a new QR scan (until WhatsApp invalidates the session).
 */
import { EventEmitter } from 'events';

let baileys = null;
let sock = null;
let qrDataUrl = null;
let connectionState = 'disconnected'; // disconnected | qr_pending | connected | connecting
const events = new EventEmitter();

async function loadBaileys() {
  if (!baileys) {
    baileys = await import('@whiskeysockets/baileys');
  }
  return baileys;
}

export function getStatus() {
  return {
    connected: connectionState === 'connected',
    state: connectionState,
    qr: qrDataUrl,
  };
}

export async function ensureConnection() {
  if (connectionState === 'connected' && sock) return sock;
  if (connectionState === 'connecting' || connectionState === 'qr_pending') {
    // Wait for existing attempt (up to 60s)
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(sock), 60000);
      events.once('connected', () => { clearTimeout(timer); resolve(sock); });
      events.once('failed', () => { clearTimeout(timer); resolve(null); });
    });
  }
  return connect();
}

async function connect() {
  const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = await loadBaileys();
  const { state, saveCreds } = await useMultiFileAuthState('./whatsapp-auth');

  connectionState = 'connecting';
  qrDataUrl = null;

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    browser: ['Unique AI', 'Chrome', '1.0'],
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      // Convert QR string to data URL for the client to display
      try {
        const QRCode = (await import('qrcode')).default;
        qrDataUrl = await QRCode.toDataURL(qr);
      } catch {
        qrDataUrl = null;
      }
      connectionState = 'qr_pending';
      events.emit('qr', qrDataUrl);
    }

    if (connection === 'open') {
      connectionState = 'connected';
      qrDataUrl = null;
      events.emit('connected');
      console.log('[whatsapp] connected');
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log('[whatsapp] closed, reconnecting:', shouldReconnect);
      connectionState = 'disconnected';
      sock = null;
      if (shouldReconnect) {
        setTimeout(() => { connect().catch(console.error); }, 5000);
      } else {
        events.emit('failed');
      }
    }
  });

  return sock;
}

export async function sendMessage(to, text) {
  const client = await ensureConnection();
  if (!client || connectionState !== 'connected') {
    throw new Error('WhatsApp connected نہیں ہے۔ پہلے QR scan کریں۔');
  }
  // Normalize to WhatsApp JID: country code + number + @s.whatsapp.net
  let digits = to.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = '92' + digits.slice(1);
  if (!digits.startsWith('92') && digits.length === 10) digits = '92' + digits;
  const jid = `${digits}@s.whatsapp.net`;

  await client.sendMessage(jid, { text });
  return { to: digits, sent: true };
}

// Auto-connect on server start (will wait for QR scan)
connect().catch((e) => console.error('[whatsapp] initial connect failed:', e.message));
