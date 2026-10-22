/**
 * pairing-client — API + device identity for the device-pairing
 * feature (Task 6b). The relay (server/pairing.js) is in-memory only:
 * random single-use 6-digit codes (10 min), no accounts, nothing
 * persisted server-side. Locally we only remember this device's id +
 * display name so the user doesn't retype them.
 */

export type PairDevice = { deviceId: string; name: string; type: string };
export type PairPeer = { name: string; type: string; online?: boolean };
export type PairMessage = {
  kind: 'conversation' | 'command';
  payload: any;
  from: { name: string; type: string };
  at: number;
};

const DEVICE_ID_KEY = 'unique-ai-device-id';
const DEVICE_NAME_KEY = 'unique-ai-device-name';

function randomId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `dev-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  }
}

export function guessDeviceName(): string {
  const ua = navigator.userAgent || '';
  if (/Android/i.test(ua)) return 'میرا فون (Android)';
  if (/iPhone/i.test(ua)) return 'میرا آئی فون';
  if (/iPad/i.test(ua)) return 'میرا آئی پیڈ';
  if (/CrOS/i.test(ua)) return 'میرا لیپ ٹاپ (Chromebook)';
  return 'میرا کمپیوٹر';
}

export function guessDeviceType(): string {
  const ua = navigator.userAgent || '';
  if (/iPad|Tablet/i.test(ua)) return 'tablet';
  if (/Android|iPhone|Mobile/i.test(ua)) return 'phone';
  return 'laptop';
}

export function getDeviceIdentity(): PairDevice {
  let deviceId = '';
  try {
    deviceId = localStorage.getItem(DEVICE_ID_KEY) || '';
    if (!deviceId) {
      deviceId = randomId();
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
  } catch {
    deviceId = randomId();
  }
  let name = '';
  try {
    name = localStorage.getItem(DEVICE_NAME_KEY) || '';
  } catch { /* ignore */ }
  if (!name) name = guessDeviceName();
  return { deviceId, name, type: guessDeviceType() };
}

export function saveDeviceName(name: string) {
  try {
    localStorage.setItem(DEVICE_NAME_KEY, name);
  } catch { /* ignore */ }
}

async function postJson(path: string, body: unknown): Promise<any> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error(data?.message || 'سرور سے رابطہ نہیں ہو سکا۔');
    err.data = data;
    throw err;
  }
  return data;
}

export const pairApi = {
  create: (device: PairDevice) => postJson('/api/pair/create', device) as Promise<{ code: string; expiresInSec: number }>,
  join: (code: string, device: PairDevice) => postJson('/api/pair/join', { code, ...device }) as Promise<{ sessionId: string; peer: PairPeer }>,
  check: (code: string, deviceId: string) => postJson('/api/pair/check', { code, deviceId }) as Promise<{ linked: boolean; sessionId?: string; peer?: PairPeer }>,
  poll: (sessionId: string, deviceId: string) => postJson('/api/pair/poll', { sessionId, deviceId }) as Promise<{ closed: boolean; peer: PairPeer | null; messages: PairMessage[] }>,
  send: (sessionId: string, deviceId: string, kind: string, payload: unknown) =>
    postJson('/api/pair/send', { sessionId, deviceId, kind, payload }) as Promise<{ ok: boolean; peerOnline: boolean }>,
  leave: (sessionId: string, deviceId: string) => postJson('/api/pair/leave', { sessionId, deviceId }).catch(() => ({})),
};
