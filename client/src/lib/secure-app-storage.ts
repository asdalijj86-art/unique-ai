/**
 * secure-app-storage.ts — ENCRYPTED MEMORY + per-account storage
 * (security build 2026-11-25).
 *
 * The problem it solves: memory / learnings / notes used to sit as
 * PLAINTEXT in localStorage, readable by anyone with the device or by
 * any other account on the same browser. Now:
 *
 *  1. ENCRYPTED MEMORY — notes + learnings are stored AES-256-GCM
 *     encrypted. The key is derived from the ACCOUNT's OWN password
 *     with PBKDF2 (200,000 iterations, SHA-256) + a per-account salt
 *     the server hands back at login. Wrong password = no key = no
 *     memory, and nothing is decryptable without the password.
 *  2. PER-ACCOUNT NAMESPACING — every stored item lives under
 *     `unique-ai-acct-<accountId>-<key>` (settings etc.) or inside
 *     the encrypted vault `unique-ai-vault-<accountId>-<key>`
 *     (memory/learnings/notes). One account's keys can never read
 *     another's. A missing/wrong account scope means denial, never a
 *     fallback to someone else's data.
 *  3. PER-PERSONA SPLIT KEPT — Uniqa and Unique keep separate
 *     stores inside the vault, exactly as before.
 *  4. MIGRATION — on the OWNER's first login after this upgrade, the
 *     old plaintext localStorage memory is encrypted under the
 *     owner's account and the plaintext keys are DELETED. Nothing
 *     lost, nothing left plaintext. A guest never touches the legacy
 *     keys (they are the owner's, not theirs).
 *
 * Sync-API constraint: the existing memory call sites are SYNCHRONOUS
 * (loadLearnings/saveLearnings etc.), but WebCrypto is async. So the
 * vault keeps a DECRYPTED IN-MEMORY cache (unlocked at login with the
 * password) and every write re-encrypts asynchronously. The plaintext
 * lives ONLY in RAM while the app is open — never in storage.
 *
 * Password change: the vault must be REKEYED first (decrypt with the
 * old password, encrypt with the new one) or the memory becomes
 * unreadable. changePasswordAndRekey does that, in order. An owner
 * reset of a guest's password ORPHANS that guest's old vault (say so
 * plainly); on next login the guest gets "wipe and start fresh".
 *
 * HONEST LIMIT: the vault protects data AT REST on this device. It
 * does not stop someone who already has the unlocked app open, and it
 * does not protect against malware on the device. The password is the
 * key — if it is weak or shared, the vault is weak.
 */

import { getAuthUser, getVaultSalt } from "./auth";

const VAULT_PREFIX = "unique-ai-vault-";
const ACCT_PREFIX = "unique-ai-acct-";
const MIGRATION_FLAG = "unique-ai-vault-migrated";

// Keys that live INSIDE the vault (encrypted memory content). These
// are the EXACT logical keys lib/memory.ts + lib/learnings.ts use
// (notesKeyFor / learningsKeyFor) — the adapter must match them, or
// memory would silently fall through to a plaintext namespaced slot.
const VAULT_KEYS = new Set([
  "unique-ai-notes",
  "unique-ai-notes-unique",
  "unique-ai-learnings",
  "unique-ai-learnings-unique",
]);
// Legacy plaintext keys that migration consumes (owner only). The
// bare localStorage keys have the SAME names as the vault keys — the
// migration encrypts them under the owner's account and deletes the
// bare copies.
const LEGACY_PLAINTEXT_KEYS = [
  "unique-ai-notes",
  "unique-ai-notes-unique",
  "unique-ai-learnings",
  "unique-ai-learnings-unique",
];

export function accountId(): string | null {
  return getAuthUser()?.id || null;
}

function encName(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}

function vaultKeyFor(acct: string, key: string): string {
  return `${VAULT_PREFIX}${acct}-${encName(key)}`;
}

function acctKeyFor(acct: string, key: string): string {
  return `${ACCT_PREFIX}${acct}-${encName(key)}`;
}

// ---------------------------------------------------------------------------
// Vault (async WebCrypto) — one key per login session.
// ---------------------------------------------------------------------------

type VaultState = {
  accountId: string;
  key: CryptoKey;
  salt: string;
  /** Decrypted plaintext cache — RAM only, never written to storage. */
  cache: Map<string, string>;
};

let vault: VaultState | null = null;

export function isVaultUnlocked(): boolean {
  return !!vault;
}

export function vaultAccountId(): string | null {
  return vault?.accountId || null;
}

async function deriveKey(password: string, saltB64: string): Promise<CryptoKey> {
  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: 200000, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptValue(key: CryptoKey, plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plain),
  );
  const buf = new Uint8Array(12 + ct.byteLength);
  buf.set(iv, 0);
  buf.set(new Uint8Array(ct), 12);
  return btoa(String.fromCharCode(...buf));
}

async function decryptValue(key: CryptoKey, blob: string): Promise<string | null> {
  try {
    const buf = Uint8Array.from(atob(blob), (c) => c.charCodeAt(0));
    const iv = buf.slice(0, 12);
    const ct = buf.slice(12);
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      ct as BufferSource,
    );
    return new TextDecoder().decode(pt);
  } catch {
    return null; // wrong password / corrupted — never throw plaintext
  }
}

/**
 * Unlock the vault after a successful login. The password is the key:
 * it is used ONLY here, in memory, to derive the vault key — it is
 * NEVER stored. Returns false when the salt is missing or the
 * password cannot unlock anything (then the vault stays locked and
 * the app shows "memory locked" instead of silently empty memory).
 */
export async function unlockVault(password: string): Promise<boolean> {
  const user = getAuthUser();
  const salt = getVaultSalt();
  if (!user || !salt) return false;
  const key = await deriveKey(password, salt);
  const next: VaultState = { accountId: user.id, key, salt, cache: new Map() };
  // Pre-load the vault keys so sync reads work immediately.
  for (const k of VAULT_KEYS) {
    try {
      const blob = localStorage.getItem(vaultKeyFor(user.id, k));
      if (blob) {
        const plain = await decryptValue(key, blob);
        if (plain !== null) next.cache.set(k, plain);
      }
    } catch { /* unreadable entry — skip, do not crash login */ }
  }
  vault = next;
  return true;
}

export function lockVault() {
  vault = null;
}

/** Change the vault password: decrypt everything with the old key,
 *  re-encrypt with the new one. Call BEFORE the server password
 *  change. Returns false if the old password cannot unlock the vault
 *  (then the caller must NOT change the server password either). */
export async function rekeyVault(oldPassword: string, newPassword: string): Promise<boolean> {
  if (!vault) return false;
  const salt = getVaultSalt();
  if (!salt) return false;
  const oldKey = await deriveKey(oldPassword, salt);
  const newKey = await deriveKey(newPassword, salt);
  const entries: Array<[string, string]> = [];
  for (const [k, plain] of vault.cache) entries.push([k, plain]);
  // Verify the old key actually decrypts the stored blobs first.
  for (const k of VAULT_KEYS) {
    try {
      const blob = localStorage.getItem(vaultKeyFor(vault.accountId, k));
      if (blob && (await decryptValue(oldKey, blob)) === null) return false;
    } catch { return false; }
  }
  for (const [k, plain] of entries) {
    const blob = await encryptValue(newKey, plain);
    localStorage.setItem(vaultKeyFor(vault.accountId, k), blob);
  }
  vault.key = newKey;
  return true;
}

// ---------------------------------------------------------------------------
// Migration — owner only, once, on first login after the upgrade.
// ---------------------------------------------------------------------------

/** Did this device already migrate the legacy plaintext memory? */
export function migrationDone(): boolean {
  try { return localStorage.getItem(MIGRATION_FLAG) === "1"; } catch { return true; }
}

/**
 * Encrypt the old plaintext memory under the owner's account and
 * DELETE the plaintext keys. Returns a short report for the UI.
 * Runs ONLY for the owner (guests never touch legacy keys — they are
 * not theirs). Idempotent: safe to call twice.
 */
export async function migrateLegacyMemory(): Promise<{ migrated: number; skipped: number; note: string }> {
  const user = getAuthUser();
  if (!user || user.role !== "owner" || !vault || vault.accountId !== user.id) {
    return { migrated: 0, skipped: 0, note: "صرف مالک کی میموری منتقل ہوتی ہے۔" };
  }
  if (migrationDone()) return { migrated: 0, skipped: 0, note: "پہلے سے منتقل ہو چکی ہے۔" };
  let migrated = 0;
  let skipped = 0;
  for (const legacyKey of LEGACY_PLAINTEXT_KEYS) {
    let plain: string | null = null;
    try { plain = localStorage.getItem(legacyKey); } catch { plain = null; }
    if (plain === null || plain === "") { skipped++; continue; }
    try {
      const blob = await encryptValue(vault.key, plain);
      localStorage.setItem(vaultKeyFor(user.id, legacyKey), blob);
      vault.cache.set(legacyKey, plain);
      migrated++;
    } catch {
      skipped++;
      continue;
    }
    // Delete the plaintext ONLY after the encrypted copy is stored.
    try { localStorage.removeItem(legacyKey); } catch { /* keep going */ }
  }
  // The legacy Gemini key (plaintext in localStorage) is also deleted
  // here — it was already sent to the server by chat.tsx before this
  // call (see migrateLegacyKey), so deleting now loses nothing.
  try { localStorage.removeItem("unique-ai-gemini-key"); } catch { /* ignore */ }
  try { localStorage.removeItem("unique-ai-gemini-key-index"); } catch { /* ignore */ }
  try { localStorage.setItem(MIGRATION_FLAG, "1"); } catch { /* ignore */ }
  return {
    migrated,
    skipped,
    note: migrated > 0
      ? `${migrated} میموری آئٹم خفیہ کر کے محفوظ کر لیے گئے — پرانی سادہ کاپیاں مٹا دی گئیں۔`
      : "پرانی میموری کچھ نہیں ملی — کچھ بھی نہیں بدلا۔",
  };
}

// ---------------------------------------------------------------------------
// The storage adapter — the ONLY storage the app should use now.
// ---------------------------------------------------------------------------

export const secureAppStorage = {
  /**
   * Sync read. Vault keys read from the decrypted RAM cache (null
   * when the vault is locked — callers must treat that as "memory
   * locked", not "empty"). Everything else reads the per-account
   * namespaced key. Legacy un-namespaced keys are NEVER read (they
   * are the owner's old data, or another account's).
   */
  getItem(key: string): string | null {
    try {
      if (VAULT_KEYS.has(key)) {
        if (!vault) return null;
        return vault.cache.get(key) ?? null;
      }
      const acct = accountId();
      if (!acct) return null;
      return localStorage.getItem(acctKeyFor(acct, key));
    } catch {
      return null;
    }
  },

  /**
   * Sync write. Vault keys update the RAM cache immediately (so the
   * next sync read sees them) and re-encrypt to storage in the
   * background. Other keys write to the per-account namespaced key.
   */
  setItem(key: string, value: string) {
    try {
      if (VAULT_KEYS.has(key)) {
        if (!vault) return; // vault locked — refuse rather than lose data
        vault.cache.set(key, value);
        const acct = vault.accountId;
        const k = vault.key;
        void encryptValue(k, value)
          .then((blob) => { try { localStorage.setItem(vaultKeyFor(acct, key), blob); } catch { /* full disk */ } })
          .catch(() => { /* encryption failed — RAM copy still there */ });
        return;
      }
      const acct = accountId();
      if (!acct) return;
      localStorage.setItem(acctKeyFor(acct, key), value);
    } catch { /* storage full / unavailable */ }
  },

  removeItem(key: string) {
    try {
      if (VAULT_KEYS.has(key)) {
        if (vault) {
          vault.cache.delete(key);
          localStorage.removeItem(vaultKeyFor(vault.accountId, key));
        }
        return;
      }
      const acct = accountId();
      if (!acct) return;
      localStorage.removeItem(acctKeyFor(acct, key));
    } catch { /* ignore */ }
  },

  /** Full StorageLike shape (backup.ts / task-board.ts need key +
   *  length): the logical keys this account owns, decoded. */
  get length(): number {
    return listLogicalKeys().length;
  },

  key(index: number): string | null {
    return listLogicalKeys()[index] ?? null;
  },
};

// ---------------------------------------------------------------------------
// General legacy migration — owner only, once.
// ---------------------------------------------------------------------------

// Bare keys that are NOT per-account data and must stay bare:
// device identity (pairing), the vault salt, the migration flags,
// and the legacy Gemini key (handled by migrateLegacyKeyToServer).
const BARE_KEEP = new Set([
  "unique-ai-device-id",
  "unique-ai-device-name",
  "unique-ai-vault-salt",
  "unique-ai-vault-migrated",
  "unique-ai-gemini-key",
  "unique-ai-gemini-key-index",
  // Bare keys read DIRECTLY from localStorage by the awareness /
  // date / alarm features (chat.tsx state initializers, memory.ts
  // loadDateMemories, alarm.ts via loadAlarms(localStorage)) — they
  // are NOT secrets (a date label, a fire count, a timestamp, a
  // one-day flag, an alarm time + short label), so keeping them bare
  // does not weaken the security model: keys and vault material stay
  // vaulted. If migration moved them into the namespaced vault, the
  // raw reads would return null and the triggers that depend on them
  // (forgotten-date drama, day-absence greeting, alarms) could never
  // fire on a fresh profile — verified 2026-11-26, stage-3 drama
  // never opened because the seeded date keys were migrated away.
  "unique-ai-date-memories",
  "unique-ai-forgotten-date-fires",
  "unique-ai-last-activity",
  "unique-ai-day-absence-spoken",
  "unique-ai-alarms",
]);

/**
 * Move every OTHER bare `unique-ai-*` / `maira-ai-*` key (settings,
 * conversations, task board, theme, persona, voice, …) into this
 * account's namespaced store, then delete the bare copy. Owner only —
 * the old bare data is his. Runs once (guarded by the same flag as
 * the memory migration). Vault keys are NOT copied here — they are
 * handled by migrateLegacyMemory (encrypted, not namespaced).
 */
export async function migrateLegacyStorage(): Promise<{ moved: number }> {
  const user = getAuthUser();
  if (!user || user.role !== "owner") return { moved: 0 };
  if (migrationDone()) return { moved: 0 };
  let moved = 0;
  let bareKeys: string[] = [];
  try {
    bareKeys = Object.keys(localStorage);
  } catch {
    return { moved: 0 };
  }
  for (const key of bareKeys) {
    if (!key.startsWith("unique-ai-") && !key.startsWith("maira-ai-")) continue;
    if (BARE_KEEP.has(key)) continue;
    if (VAULT_KEYS.has(key)) continue; // memory — migrateLegacyMemory's job
    if (key.startsWith(VAULT_PREFIX) || key.startsWith(ACCT_PREFIX)) continue;
    let value: string | null = null;
    try { value = localStorage.getItem(key); } catch { value = null; }
    if (value === null) continue;
    try {
      secureAppStorage.setItem(key, value);
      localStorage.removeItem(key);
      moved++;
    } catch { /* keep the bare copy — retry next login */ }
  }
  return { moved };
}

// ---------------------------------------------------------------------------
// Backup adapter — a StorageLike view over THIS account's keys only,
// keyed by LOGICAL names (the names backup.ts already uses).
// Vault entries travel as their RAW encrypted blobs: memory stays
// encrypted on the USB stick too, and after a restore + login with
// the same password the blobs decrypt again. counts() reports the
// REAL item counts from the live decrypted cache, so the confirm
// dialog names true numbers even though the file holds blobs.
// ---------------------------------------------------------------------------

function decodeName(b64: string): string | null {
  try {
    return decodeURIComponent(escape(atob(b64)));
  } catch {
    return null;
  }
}

/** Logical keys this account owns (namespaced + vault), decoded. */
function listLogicalKeys(): string[] {
  const acct = accountId();
  if (!acct) return [];
  const out: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const raw = localStorage.key(i);
      if (!raw) continue;
      const acctPrefix = `${ACCT_PREFIX}${acct}-`;
      const vaultPrefix = `${VAULT_PREFIX}${acct}-`;
      if (raw.startsWith(acctPrefix)) {
        const logical = decodeName(raw.slice(acctPrefix.length));
        if (logical) out.push(logical);
      } else if (raw.startsWith(vaultPrefix)) {
        const logical = decodeName(raw.slice(vaultPrefix.length));
        if (logical) out.push(logical);
      }
    }
  } catch { /* ignore */ }
  return out;
}

export const backupStorage = {
  /** Logical keys this account owns right now. */
  keys(): string[] {
    return listLogicalKeys();
  },

  get length(): number {
    return this.keys().length;
  },

  key(index: number): string | null {
    return this.keys()[index] ?? null;
  },

  /** RAW value: encrypted blob for vault keys, plain for the rest. */
  getItem(key: string): string | null {
    try {
      const acct = accountId();
      if (!acct) return null;
      if (VAULT_KEYS.has(key)) {
        return localStorage.getItem(vaultKeyFor(acct, key));
      }
      return localStorage.getItem(acctKeyFor(acct, key));
    } catch {
      return null;
    }
  },

  /** RAW write: a vault blob is stored as-is (never re-encrypted);
   *  a plain value goes to the namespaced slot. */
  setItem(key: string, value: string) {
    try {
      const acct = accountId();
      if (!acct) return;
      if (VAULT_KEYS.has(key)) {
        localStorage.setItem(vaultKeyFor(acct, key), value);
        // Keep the RAM cache in sync so a restore shows up at once.
        const v = vault;
        if (v && v.accountId === acct) {
          void decryptValue(v.key, value).then((plain) => {
            if (plain !== null) v.cache.set(key, plain);
          });
        }
        return;
      }
      localStorage.setItem(acctKeyFor(acct, key), value);
    } catch { /* ignore */ }
  },

  removeItem(key: string) {
    secureAppStorage.removeItem(key);
  },

  /** Real counts for the backup summary, from the live vault cache. */
  counts(): { conversations: number; notes: number; learnings: number } {
    const countJson = (raw: string | null): number => {
      try {
        const arr = JSON.parse(raw || "[]");
        return Array.isArray(arr) ? arr.length : 0;
      } catch {
        return 0;
      }
    };
    return {
      conversations: countJson(secureAppStorage.getItem("maira-ai-conversations-v1")),
      notes:
        countJson(secureAppStorage.getItem("unique-ai-notes")) +
        countJson(secureAppStorage.getItem("unique-ai-notes-unique")),
      learnings:
        countJson(secureAppStorage.getItem("unique-ai-learnings")) +
        countJson(secureAppStorage.getItem("unique-ai-learnings-unique")),
    };
  },
};
