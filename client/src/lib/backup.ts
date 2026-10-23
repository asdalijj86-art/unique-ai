/**
 * Brain backup / restore (Master Plan Phase 4 — «دماغ کا بیک اپ»).
 *
 * His spec: ONE file on a USB stick revives the AI — memory +
 * settings + persona, all of it. This module is the whole format:
 *
 *  - collect: every localStorage entry of the app (conversations,
 *    notes/memory, settings, persona, tone, task board, map home,
 *    last document, …) into one versioned JSON document.
 *  - EXCLUDED, always: the Gemini API keys. Secrets never travel in
 *    a file that gets copied onto USB sticks and shared around — the
 *    file itself and the Settings UI both say plainly that after a
 *    restore the keys must be entered once again. The key-rotation
 *    index goes with them (meaningless without the keys), and the
 *    per-device pairing identity is excluded for a different reason:
 *    it is THIS device's hardware identity — restoring it onto a
 *    second device would give two devices one identity and break
 *    pairing. Everything else is brain, and brain travels.
 *  - restore: validated BEFORE anything is touched (marker, version,
 *    shape). A bad file changes nothing. A good file replaces the
 *    app's state wholesale — except the excluded keys, which a
 *    restore never writes and never deletes, even if a hostile file
 *    smuggles them in (they are stripped at parse AND at apply).
 *
 * Pure module (storage injected, {getItem,setItem,removeItem,key,
 * length}-shaped) so the round-trip is unit-testable headlessly —
 * see scripts/test-backup.mjs.
 */

export const BACKUP_APP = 'unique-ai';
export const BACKUP_KIND = 'brain-backup';
export const BACKUP_VERSION = 1;

export const BACKUP_EXCLUDED_KEYS = [
  'unique-ai-gemini-key',
  'unique-ai-gemini-key-index',
  'unique-ai-device-id',
] as const;

const CONVERSATIONS_KEY = 'maira-ai-conversations-v1';
const NOTES_KEY = 'unique-ai-notes';
const LEARNINGS_KEY = 'unique-ai-learnings';

export type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  key: (index: number) => string | null;
  readonly length: number;
};

export type BrainBackup = {
  app: typeof BACKUP_APP;
  kind: typeof BACKUP_KIND;
  version: number;
  createdAt: string;
  entries: Record<string, string>;
};

function isExcluded(key: string): boolean {
  return (BACKUP_EXCLUDED_KEYS as readonly string[]).includes(key);
}

function allKeys(storage: StorageLike): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (typeof k === 'string') keys.push(k);
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Collect / serialize
// ---------------------------------------------------------------------------

export function collectBackup(storage: StorageLike, now: Date = new Date()): BrainBackup {
  const entries: Record<string, string> = {};
  for (const key of allKeys(storage)) {
    if (isExcluded(key)) continue;
    const value = storage.getItem(key);
    if (typeof value === 'string') entries[key] = value;
  }
  return {
    app: BACKUP_APP,
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    createdAt: now.toISOString(),
    entries,
  };
}

export function serializeBackup(data: BrainBackup): string {
  return JSON.stringify(data, null, 2);
}

export function backupFileName(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `unique-ai-brain-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

// ---------------------------------------------------------------------------
// Parse / validate — a bad file must change NOTHING, so validation is
// strict and total, and it runs before apply is ever called.
// ---------------------------------------------------------------------------

export type ParseResult =
  | { ok: true; data: BrainBackup }
  | { ok: false; error: string };

export function parseBackup(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(String(text ?? ''));
  } catch {
    return { ok: false, error: 'یہ فائل درست بیک اپ فائل نہیں لگتی — بحالی روک دی گئی ہے، آپ کا ڈیٹا ویسا کا ویسا ہے۔' };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'یہ فائل درست بیک اپ فائل نہیں لگتی — بحالی روک دی گئی ہے، آپ کا ڈیٹا ویسا کا ویسا ہے۔' };
  }
  const obj = raw as Record<string, unknown>;
  if (obj.app !== BACKUP_APP || obj.kind !== BACKUP_KIND) {
    return { ok: false, error: 'یہ Unique AI کی بیک اپ فائل نہیں ہے — بحالی روک دی گئی ہے، آپ کا ڈیٹا ویسا کا ویسا ہے۔' };
  }
  if (obj.version !== BACKUP_VERSION) {
    return { ok: false, error: 'اس بیک اپ فائل کا ورژن اس ایپ سے نہیں ملتا — بحالی روک دی گئی ہے، آپ کا ڈیٹا ویسا کا ویسا ہے۔' };
  }
  const entries = obj.entries;
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) {
    return { ok: false, error: 'فائل کا ڈیٹا خراب ہے — بحالی روک دی گئی ہے، آپ کا ڈیٹا ویسا کا ویسا ہے۔' };
  }
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(entries as Record<string, unknown>)) {
    if (typeof value !== 'string') {
      return { ok: false, error: 'فائل کا ڈیٹا خراب ہے — بحالی روک دی گئی ہے، آپ کا ڈیٹا ویسا کا ویسا ہے۔' };
    }
    // Defence in depth: even a hand-crafted file cannot smuggle the
    // excluded keys back in — they are dropped here, and again in
    // applyBackup.
    if (isExcluded(key)) continue;
    clean[key] = value;
  }
  return {
    ok: true,
    data: {
      app: BACKUP_APP,
      kind: BACKUP_KIND,
      version: BACKUP_VERSION,
      createdAt: typeof obj.createdAt === 'string' ? obj.createdAt : '',
      entries: clean,
    },
  };
}

// ---------------------------------------------------------------------------
// Summary (for the restore confirm dialog — it names what will be
// replaced BEFORE the user confirms).
// ---------------------------------------------------------------------------

export type BackupSummary = {
  conversations: number;
  notes: number;
  /** Learned facts about the person (Round 5 — lib/learnings). The
   *  learnings key rides the backup like every other brain key; only
   *  the summary counts it separately, for the confirm dialog/reply. */
  learnings: number;
  totalEntries: number;
  createdAt: string;
};

function countArrayEntry(entries: Record<string, string>, key: string): number {
  try {
    const parsed = JSON.parse(entries[key] || '[]');
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export function summarizeBackup(data: BrainBackup): BackupSummary {
  return {
    conversations: countArrayEntry(data.entries, CONVERSATIONS_KEY),
    notes: countArrayEntry(data.entries, NOTES_KEY),
    learnings: countArrayEntry(data.entries, LEARNINGS_KEY),
    totalEntries: Object.keys(data.entries).length,
    createdAt: data.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Apply — replace the app's state with the file's, wholesale, EXCEPT
// the excluded keys: a restore never writes them and never deletes
// the ones already on this device (keys stay device-local secrets).
// ---------------------------------------------------------------------------

export function applyBackup(storage: StorageLike, data: BrainBackup): { written: number; removed: number } {
  let removed = 0;
  for (const key of allKeys(storage)) {
    if (isExcluded(key)) continue;
    if (!(key in data.entries)) {
      storage.removeItem(key);
      removed++;
    }
  }
  let written = 0;
  for (const [key, value] of Object.entries(data.entries)) {
    if (isExcluded(key)) continue; // stripped at parse too — belt and braces
    storage.setItem(key, value);
    written++;
  }
  return { written, removed };
}

// ---------------------------------------------------------------------------
// Voice commands (command-shaped, hijack-safe — the same discipline
// as lib/memory and lib/persona):
//   «بیک اپ بنا دو» / «بیک اپ ڈاؤن لوڈ کرو»  → 'create' (download)
//   «بیک اپ واپس لاؤ» / «بیک اپ بحال کرو»    → 'restore' (opens the
//      file picker — the actual pick stays the user's own tap; that
//      is a browser rule, and the spoken reply says so)
// A long message merely TALKING about backups parses to null and
// reaches the brain untouched: the utterance must be ≤10 words and
// carry a backup word plus a make/restore verb.
// ---------------------------------------------------------------------------

export type BackupCommand = 'create' | 'restore';

const BACKUP_WORD_RE = /(بیک\s?اپ|backup|back\s?up)/i;
const CREATE_VERB_RE = /(بنا|بناؤ|ڈاؤن\s?لوڈ|download|سیو|save|نکال|محفوظ)/i;
const RESTORE_VERB_RE = /(واپس|بحال|restore|recover|لاؤ|لگاؤ|امپورٹ|import)/i;
const USB_WORD_RE = /(usb|یو\s?ایس\s?بی)/i;
const BRAIN_WORD_RE = /(میموری|دماغ|یادیں|باتیں)/;

function countWords(text: string): number {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

export function parseBackupCommand(rawText: string): BackupCommand | null {
  const text = String(rawText || '').trim();
  if (!text || countWords(text) > 10) return null;
  const hasBackupWord = BACKUP_WORD_RE.test(text)
    // His own phrasing from the plan: «اپنی میموری USB میں سیو کر دو» —
    // USB + brain-word also names a backup, without the word بیک اپ.
    || (USB_WORD_RE.test(text) && BRAIN_WORD_RE.test(text));
  if (!hasBackupWord) return null;
  // «بیک اپ ڈیلیٹ کر دو» is neither (restore-verbs don't include a
  // delete verb, create-verbs don't match it) → null → the memory
  // parser / brain handles it, never a surprise file action.
  if (RESTORE_VERB_RE.test(text)) return 'restore';
  if (CREATE_VERB_RE.test(text)) return 'create';
  return null;
}
