/**
 * face-lock.ts — FACE LOCK (Phase 2, Stonic v3.1.11: face unlock with
 * a 6-digit passcode as the backup). OFF by default. The app stays
 * locked until it sees the OWNER's face — checked entirely on this
 * device — or the 6-digit passcode is entered.
 *
 * SECURITY:
 *  - The face descriptor (128 numbers) + the passcode hash live in
 *    the ENCRYPTED vault (FACE_LOCK_KEY is a VAULT_KEYS entry in
 *    lib/secure-app-storage) — the password is the key, same as the
 *    memory. Nothing is ever sent anywhere.
 *  - The passcode is stored ONLY as a SHA-256 hash — never plaintext.
 *  - The descriptor is a one-way embedding: it cannot be turned back
 *    into a photo. No photo is ever saved.
 *  - NEVER lock the user out: the passcode ALWAYS unlocks, and
 *    turning Face Lock off needs the passcode (or a face match).
 *    If both face and passcode are lost, the login screen's
 *    forgot-password makes a fresh vault — Face Lock is off there
 *    (the old vault is archived, never deleted).
 *
 * Pure helpers here (hash, distance, match, state). The camera +
 * embedding work lives in lib/face-recognition.ts (lazy face-api).
 */

export const FACE_LOCK_KEY = 'unique-ai-face-lock';
/** Standard face-recognition match threshold (Euclidean distance
 *  between 128-d descriptors; < 0.6 = same person). */
export const FACE_MATCH_THRESHOLD = 0.6;
export const FACE_DESCRIPTOR_LEN = 128;

export interface FaceLockState {
  enabled: boolean;
  /** SHA-256 hex of the 6-digit passcode, or null when not set. */
  passcodeHash: string | null;
  /** Enrolled 128-d face descriptor, or null when not enrolled. */
  descriptor: number[] | null;
  enrolledAt: number | null;
}

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export function emptyFaceLockState(): FaceLockState {
  return { enabled: false, passcodeHash: null, descriptor: null, enrolledAt: null };
}

export function loadFaceLock(storage: StorageLike): FaceLockState {
  try {
    const raw = storage.getItem(FACE_LOCK_KEY);
    if (!raw) return emptyFaceLockState();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return emptyFaceLockState();
    const p = parsed as Partial<FaceLockState>;
    const descriptor = Array.isArray(p.descriptor)
      && p.descriptor.length === FACE_DESCRIPTOR_LEN
      && p.descriptor.every((n) => typeof n === 'number' && Number.isFinite(n))
      ? (p.descriptor as number[])
      : null;
    return {
      enabled: p.enabled === true,
      passcodeHash: typeof p.passcodeHash === 'string' && /^[0-9a-f]{64}$/.test(p.passcodeHash) ? p.passcodeHash : null,
      descriptor,
      enrolledAt: typeof p.enrolledAt === 'number' ? p.enrolledAt : null,
    };
  } catch {
    return emptyFaceLockState();
  }
}

export function saveFaceLock(storage: StorageLike, state: FaceLockState): void {
  try {
    storage.setItem(FACE_LOCK_KEY, JSON.stringify(state));
  } catch { /* vault locked — refuse silently, caller reports */ }
}

/** A passcode is exactly 6 digits. */
export function isValidPasscode(passcode: string): boolean {
  return /^\d{6}$/.test(String(passcode || '').trim());
}

/** SHA-256 hex (crypto.subtle — secure contexts, incl. localhost). */
export async function hashPasscode(passcode: string): Promise<string> {
  const data = new TextEncoder().encode(String(passcode).trim());
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function passcodeMatches(passcode: string, hash: string | null): Promise<boolean> {
  if (!hash || !isValidPasscode(passcode)) return false;
  try {
    return (await hashPasscode(passcode)) === hash;
  } catch {
    return false;
  }
}

/** Euclidean distance between two 128-d descriptors. */
export function descriptorDistance(a: readonly number[], b: readonly number[]): number {
  if (a.length !== FACE_DESCRIPTOR_LEN || b.length !== FACE_DESCRIPTOR_LEN) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (let i = 0; i < FACE_DESCRIPTOR_LEN; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

export function isFaceMatch(
  probe: readonly number[] | null,
  enrolled: readonly number[] | null,
  threshold = FACE_MATCH_THRESHOLD,
): boolean {
  if (!probe || !enrolled) return false;
  return descriptorDistance(probe, enrolled) < threshold;
}

/** Can Face Lock actually guard anything? Needs a passcode AND an
 *  enrolled face (the face is the key, the passcode is the backup). */
export function faceLockReady(state: FaceLockState): boolean {
  return !!state.passcodeHash && !!state.descriptor;
}

/** The lock screen's verdict for one unlock attempt. */
export type FaceUnlockResult = 'face' | 'passcode' | 'no-match' | 'no-face' | 'error';

export function describeUnlockResult(result: FaceUnlockResult, feminine: boolean): string {
  switch (result) {
    case 'face':
      return feminine ? 'چہرہ پہچان لیا — خوش آمدید! 💛' : 'چہرہ پہچان لیا — خوش آمدید!';
    case 'passcode':
      return 'کوڈ درست ہے — خوش آمدید!';
    case 'no-match':
      return 'یہ چہرہ میرا مالک نہیں لگتا — 6 ہندسوں کا کوڈ لکھیں۔';
    case 'no-face':
      return 'کیمرے میں کوئی چہرہ نظر نہیں آیا — 6 ہندسوں کا کوڈ لکھیں۔';
    default:
      return 'چہرہ چیک نہیں ہو سکا — 6 ہندسوں کا کوڈ لکھیں۔';
  }
}
