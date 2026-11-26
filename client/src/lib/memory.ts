/**
 * Memory voice commands (Master Plan Phase 2 — his explicit spec):
 *
 *  «یہ یاد رکھو: …»        → save a note, confirm naming it
 *  «… بھول جاؤ / ڈیلیٹ کر دو» → delete the matching note(s), confirm
 *  «یہ بھول جاؤ» (no content) → forget the MOST RECENT note
 *  «ساری میموری ڈیلیٹ کر دو»  → clear everything, confirm the count
 *  «تم نے کیا سیکھا؟»        → list the LEARNED facts (Round 5)
 *
 * Round 5 (learning memory): these commands govern BOTH stores — the
 * notes here and the learnings in lib/learnings (one brain PER
 * PERSONA since 2026-11-25: Uniqa's original keys, Unique's
 * '-unique' keys — see notesKeyFor / learningsKeyFor).
 * A taught note is also mined for learnings; a forget clears matching
 * entries from both; the full wipe clears both; the show command
 * lists what the team has learned about the person.
 *
 * Storage is the app's EXISTING notes store — localStorage key
 * 'unique-ai-notes' for Uniqa (the default persona) and
 * 'unique-ai-notes-unique' for Unique, the same ones ToolResults'
 * NotesView reads and writes (shape {id, text, createdAt}, newest
 * first). The brain's save_note / list_notes actions keep working
 * on the same store — the ACTIVE persona's store.
 *
 * Anti-hijack discipline (same as the router gate): these commands
 * fire ONLY on command-shaped utterances. A long message that merely
 * mentions remembering/forgetting is conversation for the brain and
 * parses to null here — word budgets are enforced inside the parser
 * (save carries content, so its budget is larger; forget is short).
 *
 * Pure module: storage is injected ({getItem,setItem}-shaped), so the
 * real command logic is unit-testable headlessly.
 */

import {
  learnFromText,
  loadLearnings,
  findLearningsToForget,
  removeLearnings,
  clearLearnings,
  formatLearning,
  type Learning,
  type MemoryPersona,
} from './learnings';

export type Note = { id: string; text: string; createdAt: string };

export const NOTES_KEY = 'unique-ai-notes';
/** Unique's own notes store (2026-11-25, per-persona memory).
 *  Uniqa keeps the ORIGINAL key exactly as it was — all existing
 *  memory stays hers, the default persona. No migration code is
 *  needed: Unique's key simply starts empty. */
export const NOTES_KEY_UNIQUE = 'unique-ai-notes-unique';

export type { MemoryPersona };

/** Which localStorage key holds this persona's notes. */
export function notesKeyFor(persona: MemoryPersona = 'uniqa'): string {
  return persona === 'unique' ? NOTES_KEY_UNIQUE : NOTES_KEY;
}

export type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export function loadNotes(storage: StorageLike, persona: MemoryPersona = 'uniqa'): Note[] {
  try {
    const raw = storage.getItem(notesKeyFor(persona));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr)
      ? arr.filter((n) => n && typeof n.text === 'string')
      : [];
  } catch {
    return [];
  }
}

export function saveNotes(storage: StorageLike, notes: Note[], persona: MemoryPersona = 'uniqa'): void {
  try {
    storage.setItem(notesKeyFor(persona), JSON.stringify(notes));
  } catch {
    // storage unavailable — memory just won't persist
  }
}

export function makeNote(text: string): Note {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    text,
    createdAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Command parsing
// ---------------------------------------------------------------------------

export type MemoryCommand =
  | { type: 'save'; note: string }
  | { type: 'forget'; query: string | null }
  | { type: 'forget_all' }
  | { type: 'show' };

function countWords(text: string): number {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

const SAVE_VERB_RE = /(یاد رکھو|یاد کر لو|یاد کرلیں|یاد کر لیں|یاد رکھیں|یاد رکھنا|نوٹ کر لو|نوٹ کرلو|نوٹ کرو|نوٹ لکھو|نوٹ لکھ لو)/;
const FORGET_VERB_RE = /(بھول جاؤ|بھول جاو|بھول جا|بھولا دو|ڈیلیٹ کر دو|ڈیلیٹ کرو|ڈیلیٹ کر|مٹا دو|مٹا دیں|حذف کر دو|حذف کرو|delete kar do|bhool jao|bhool ja)/i;
const FORGET_FILLER_RE = /(یہ|وہ|اسے|اس کو|میرا|میری|میرے|نوٹ|یاد|بات|والی|والا|کو|جی)/g;

export function parseMemoryCommand(rawText: string): MemoryCommand | null {
  const text = String(rawText || '').trim();
  if (!text) return null;
  const words = countWords(text);

  // --- forget EVERYTHING -------------------------------------------------
  // Checked first: «ساری میموری ڈیلیٹ کر دو» must never degrade into
  // "forget the note whose text is ساری میموری".
  if (words <= 12) {
    const allScope = /(ساری|تمام|سب|پوری|کلی)/.test(text);
    const memoryWord = /(میموری|یاد|یادیں|نوٹ|notes|memory)/i.test(text);
    const wipeVerb = /(ڈیلیٹ|بھول|مٹا|حذف|صاف|ختم|delete|clear|forget)/i.test(text);
    if ((allScope && wipeVerb) || (memoryWord && wipeVerb && allScope)) {
      return { type: 'forget_all' };
    }
    if (/(میموری|memory).{0,14}(ڈیلیٹ کر دو|ڈیلیٹ کرو|صاف کر دو|ختم کر دو)/i.test(text)) {
      return { type: 'forget_all' };
    }
  }

  // --- show what was learned ----------------------------------------------
  // «تم نے کیا سیکھا؟» / «میری یادداشت دکھاؤ» / «میرے بارے میں کیا یاد
  // ہے» — the transparency command for the LEARNING store (Round 5).
  // Fully anchored to the whole utterance (trailing punctuation
  // stripped): a question ABOUT a story («اس کہانی سے تم نے کیا سیکھا؟»)
  // or any longer sentence parses to null and reaches the brain.
  if (words <= 12) {
    const bare = text.replace(/[۔.!?؟\s]+$/u, '').trim();
    const SHOW_RES = [
      /^(?:تم|آپ) نے (?:میرے بارے میں )?کیا (?:سیکھا|سیکھ لیا|یاد کیا|یاد رکھا)(?: ہے)?$/,
      /^کیا (?:سیکھا|یاد رکھا)(?: ہے)?$/,
      /^(?:میری |اپنی )?یادداشت (?:دکھاؤ|دکھا دو|بتاؤ|بتا دو|سناؤ)$/,
      /^جو (?:کچھ )?سیکھا(?: ہے)?(?: وہ)? (?:دکھاؤ|بتاؤ|بتا دو|سناؤ)$/,
      /^میرے بارے میں (?:تمہیں |آپ کو )?کیا یاد ہے$/,
      /^what have you (?:learned|learnt)(?: about me)?$/i,
      /^what do you (?:know|remember) about me$/i,
      /^show (?:me )?(?:what you (?:have )?(?:learned|remember)|your memory|my memory)$/i,
    ];
    if (SHOW_RES.some((re) => re.test(bare))) return { type: 'show' };
  }

  // --- forget (specific or most-recent) -----------------------------------
  if (words <= 12 && FORGET_VERB_RE.test(text)) {
    const query = text
      .replace(FORGET_VERB_RE, ' ')
      .replace(FORGET_FILLER_RE, ' ')
      .replace(/[،,۔.!?؟:\s]+/g, ' ')
      .trim();
    return { type: 'forget', query: query || null };
  }

  // --- save ----------------------------------------------------------------
  // Content-bearing, so the budget is larger than a pure order — but
  // still bounded: a 40-word story that quotes «یاد رکھو» mid-way is
  // conversation, not a save order (the verb must also lead the
  // utterance, modulo a leading «یہ»).
  if (words <= 24) {
    const m = SAVE_VERB_RE.exec(text);
    if (m) {
      const before = text.slice(0, m.index).replace(/[،,۔!\s]+/g, ' ').trim();
      const beforeOk = before === '' || /^(یہ|اچھا|ٹھیک ہے|جی)$/.test(before);
      if (beforeOk) {
        const note = text
          .slice(m.index + m[0].length)
          .replace(/^[\s،,:؛\-—]+/, '')
          .replace(/^(کہ|keh)\s+/, '')
          .trim();
        if (note) return { type: 'save', note };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Matching + application
// ---------------------------------------------------------------------------

function normalizeForMatch(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[ً-ٰٟ]/g, '') // Arabic diacritics
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Which notes a forget-order targets. query === null («یہ بھول جاؤ»)
 * means the most recent note. Otherwise: notes whose text contains
 * the query win; failing that, notes sharing a distinctive token
 * (≥3 chars) with the query.
 */
export function findNotesToForget(notes: Note[], query: string | null): Note[] {
  if (!notes.length) return [];
  if (query === null) return [notes[0]];
  const q = normalizeForMatch(query);
  if (!q) return [notes[0]];
  const exact = notes.filter((n) => normalizeForMatch(n.text).includes(q));
  if (exact.length) return exact;
  const tokens = q.split(' ').filter((t) => t.length >= 3);
  if (!tokens.length) return [];
  return notes.filter((n) => {
    const nt = normalizeForMatch(n.text);
    return tokens.some((t) => nt.includes(t));
  });
}

export type MemoryOutcome = {
  /** Notes affected (saved note, or the notes that were deleted). */
  affected: Note[];
  /** Total notes cleared (forget_all only). */
  clearedCount?: number;
  /** Learnings (lib/learnings) added by a save, or deleted by a forget. */
  learningsAffected?: Learning[];
  /** Total learnings cleared (forget_all only). */
  learningsCleared?: number;
};

export function applyMemoryCommand(
  storage: StorageLike,
  cmd: MemoryCommand,
  persona: MemoryPersona = 'uniqa',
): MemoryOutcome {
  const notes = loadNotes(storage, persona);
  if (cmd.type === 'show') {
    // Display is the caller's job (it loads the learnings and formats
    // them); applying a show changes nothing.
    return { affected: [] };
  }
  if (cmd.type === 'save') {
    const note = makeNote(cmd.note);
    saveNotes(storage, [note, ...notes], persona);
    // A taught note ALSO feeds the learning brain (Round 5): «یاد رکھو
    // میرا نام احمد ہے» teaches the team the name, not just the note.
    const learned = learnFromText(storage, cmd.note, 'told', persona);
    return { affected: [note], learningsAffected: learned };
  }
  if (cmd.type === 'forget_all') {
    saveNotes(storage, [], persona);
    // The wipe covers BOTH stores — notes and everything learned —
    // of THIS persona only. The other persona's memory is untouched.
    const learningsCleared = clearLearnings(storage, persona);
    return { affected: [], clearedCount: notes.length, learningsCleared };
  }
  const targets = findNotesToForget(notes, cmd.query);
  if (targets.length) {
    const ids = new Set(targets.map((n) => n.id));
    saveNotes(storage, notes.filter((n) => !ids.has(n.id)), persona);
  }
  // Learnings forget with the same order: a topic-named forget clears
  // it everywhere; a bare «یہ بھول جاؤ» touches a learning ONLY when
  // no note was deleted (one utterance, one deletion).
  let learningTargets: Learning[] = [];
  if (cmd.query !== null || !targets.length) {
    learningTargets = findLearningsToForget(loadLearnings(storage, persona), cmd.query);
    if (learningTargets.length) removeLearnings(storage, learningTargets, persona);
  }
  return { affected: targets, learningsAffected: learningTargets };
}

// ---------------------------------------------------------------------------
// Spoken confirmations — they NAME what was saved/forgotten, in the
// speaking persona's grammar (feminine = Uniqa).
// ---------------------------------------------------------------------------

function shortText(text: string, max = 60): string {
  const t = String(text || '').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export function memoryConfirmation(
  cmd: MemoryCommand,
  outcome: MemoryOutcome,
  feminine: boolean,
): string {
  const ga = feminine ? 'گئی' : 'گیا';
  const gi = feminine ? 'گی' : 'گا';
  if (cmd.type === 'show') {
    // Unreachable in the app (chat.tsx formats the learnings list
    // itself); kept so the function is total over the command union.
    return 'جو کچھ میں نے آپ کے بارے میں سیکھا ہے، وہ اوپر دکھایا ہے۔';
  }
  if (cmd.type === 'save') {
    return `یاد کر لیا 💛 «${shortText(outcome.affected[0]?.text || cmd.note)}» — جب پوچھیں گے تو بتا دوں ${gi}۔`;
  }
  if (cmd.type === 'forget_all') {
    const n = outcome.clearedCount || 0;
    const lc = outcome.learningsCleared || 0;
    // The pinned sentence stays EXACT when only notes were cleared;
    // the learning clause is appended only when learnings truly went.
    if (n > 0 && lc === 0) {
      return `ساری میموری صاف کر دی — ${n} باتیں بھول ${ga}۔ اب کچھ یاد نہیں۔`;
    }
    if (n > 0) {
      return `ساری میموری صاف کر دی — ${n} باتیں بھول ${ga}، اور جو کچھ سیکھا تھا وہ بھی بھول ${ga}۔ اب کچھ یاد نہیں۔`;
    }
    if (lc > 0) {
      return `ساری میموری صاف کر دی — جو کچھ سیکھا تھا وہ بھی بھول ${ga}۔ اب کچھ یاد نہیں۔`;
    }
    return 'میموری پہلے ہی خالی تھی — بھولنے کو کچھ تھا ہی نہیں۔';
  }
  // forget
  const learnedGone = outcome.learningsAffected || [];
  if (!outcome.affected.length) {
    if (learnedGone.length) {
      const firstLearned = shortText(formatLearning(learnedGone[0]));
      return learnedGone.length > 1
        ? `بھول ${ga} — سیکھی ہوئی بات «${firstLearned}» اور ${learnedGone.length - 1} مزید باتیں مٹا دیں۔`
        : `بھول ${ga} — سیکھی ہوئی بات «${firstLearned}» مٹا دی۔`;
    }
    return 'ایسی کوئی یاد نہیں ملی جو مٹائی جا سکے — میموری میں وہ بات ہے ہی نہیں۔';
  }
  const first = shortText(outcome.affected[0].text);
  const extra = outcome.affected.length - 1;
  const base = extra > 0
    ? `بھول ${ga} — «${first}» اور ${extra} مزید باتیں میموری سے مٹا دیں۔`
    : `بھول ${ga} — «${first}» میموری سے مٹا دیا۔`;
  return learnedGone.length
    ? `${base} اور ${learnedGone.length} سیکھی ہوئی باتیں بھی مٹا دیں۔`
    : base;
}

// ---------------------------------------------------------------------------
// Unified memory + date memories + cross-character memory
// (Stonic full study 2026-11-26 — checklist items:
//  «old conversations unified into ONE memory»,
//  tile 2.6M cross-character inference — Jarvis reads Khushbo's chat
//  and volunteers that she likes the man,
//  tile 144K — she remembers HER OWN birthday as a memory date.)
//
// ADDITIVE ONLY, by design:
//  - The per-persona stores above are NEVER moved, merged-away or
//    re-saved here. Uniqa keeps 'unique-ai-notes', Unique keeps
//    'unique-ai-notes-unique', learnings stay split. Unified recall
//    is a READ-TIME merge for the prompt only.
//  - Date memories live in ONE shared key (dates belong to the
//    person, not to a persona) and ride the brain backup like every
//    other key — collectBackup in lib/backup.ts sweeps all keys, so
//    no backup.ts change was needed.
//  - Cross-character recall NEVER exposes the other persona's raw
//    notes — only one short inferred line, in our own Urdu words.
//
// Every function below takes an OPTIONAL storage argument (second
// param, or first for the loaders) so the headless test suite can
// inject a fake store; when omitted, the real localStorage is used
// (and in a headless environment with no localStorage the functions
// degrade gracefully to '' / [] / null instead of throwing).
// ---------------------------------------------------------------------------

export const CONVERSATIONS_KEY = 'maira-ai-conversations-v1';
/** Date memories — ONE shared key (not per-persona): a birthday or
 *  anniversary belongs to the person, whichever character is
 *  speaking. Rides the brain backup automatically. */
export const DATE_MEMORIES_KEY = 'unique-ai-date-memories';

/** Cap for the merged recall text sent to the server prompt. */
export const UNIFIED_RECALL_CAP = 1200;

function defaultStorage(): StorageLike | null {
  try {
    const ls = (globalThis as unknown as { localStorage?: StorageLike }).localStorage;
    return ls && typeof ls.getItem === 'function' ? ls : null;
  } catch {
    return null;
  }
}

function resolveStorage(storage?: StorageLike | null): StorageLike | null {
  return storage ?? defaultStorage();
}

// ---------------------------------------------------------------------------
// 1. UNIFIED RECALL — read-time merge, nothing re-saved
// ---------------------------------------------------------------------------

export type UnifiedNote = Note & { persona: MemoryPersona };

/**
 * Merged notes of BOTH personas, most recent first, de-duplicated
 * by normalized text (the newest copy wins). Read-only — the two
 * underlying stores are untouched.
 */
export function loadUnifiedNotes(
  persona: MemoryPersona = 'uniqa',
  storage?: StorageLike | null,
): UnifiedNote[] {
  const s = resolveStorage(storage);
  if (!s) return [];
  const other: MemoryPersona = persona === 'unique' ? 'uniqa' : 'unique';
  const merged: UnifiedNote[] = [
    ...loadNotes(s, persona).map((n) => ({ ...n, persona })),
    ...loadNotes(s, other).map((n) => ({ ...n, persona: other })),
  ].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const seen = new Set<string>();
  return merged.filter((n) => {
    const k = normalizeForMatch(n.text);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

type ConversationExcerpt = { text: string; createdAt: string };

/**
 * His own words from the old conversation history
 * ('maira-ai-conversations-v1': [{id, title, updatedAt, messages:
 * [{role, content, createdAt}]}]). Only USER messages count as
 * memory — the assistant's own replies are not facts about him —
 * and command-shaped utterances are skipped (the saved note already
 * covers them) as are very long messages (stories, not facts).
 */
function loadConversationExcerpts(storage: StorageLike): ConversationExcerpt[] {
  try {
    const raw = storage.getItem(CONVERSATIONS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    const out: ConversationExcerpt[] = [];
    for (const conv of arr) {
      if (!conv || !Array.isArray(conv.messages)) continue;
      for (const m of conv.messages) {
        if (!m || m.role !== 'user' || typeof m.content !== 'string') continue;
        const text = m.content.trim();
        if (!text || text.length > 200) continue;
        if (parseMemoryCommand(text) !== null) continue;
        out.push({
          text,
          createdAt: typeof m.createdAt === 'string' ? m.createdAt : String(conv.updatedAt || ''),
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * ONE recall text for the server prompt: the active persona's notes
 * + the other persona's notes + his own words from old conversations,
 * de-duplicated, most recent first, capped at UNIFIED_RECALL_CAP
 * (~1200 chars). The other persona's lines are tagged with her/his
 * name and conversation lines with «گفتگو» so the prompt can tell
 * where each memory came from. Read-time only — nothing is re-saved
 * or moved.
 */
export function getUnifiedMemoryText(persona: string, storage?: StorageLike | null): string {
  const p: MemoryPersona = persona === 'unique' ? 'unique' : 'uniqa';
  const s = resolveStorage(storage);
  if (!s) return '';
  const notes = loadUnifiedNotes(p, s);
  const excerpts = loadConversationExcerpts(s);
  const items: Array<{ text: string; createdAt: string; tag: string }> = [
    ...notes.map((n) => ({
      text: n.text,
      createdAt: n.createdAt,
      tag: n.persona === p ? '' : n.persona === 'uniqa' ? 'یونیکا' : 'یونیک',
    })),
    ...excerpts.map((e) => ({ text: e.text, createdAt: e.createdAt, tag: 'گفتگو' })),
  ];
  items.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const seen = new Set<string>();
  const lines: string[] = [];
  let len = 0;
  for (const it of items) {
    const key = normalizeForMatch(it.text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const flat = it.text.replace(/\s+/g, ' ').trim();
    const short = flat.length > 140 ? `${flat.slice(0, 140)}…` : flat;
    const line = it.tag ? `• [${it.tag}] ${short}` : `• ${short}`;
    if (len + line.length + 1 > UNIFIED_RECALL_CAP) break;
    lines.push(line);
    len += line.length + 1;
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 2. DATE MEMORIES — birthdays / anniversaries she must never forget
//    (tile 144K: she remembers her own birthday as a memory date and
//    holds him to it). One shared store, key DATE_MEMORIES_KEY.
// ---------------------------------------------------------------------------

export type DateMemoryKind = 'birthday' | 'anniversary' | 'other';

export type DateMemory = {
  id: string;
  label: string;
  month: number; // 1–12
  day: number; // 1–31 (validated against the month)
  kind: DateMemoryKind;
  person?: string;
};

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function validDateMemory(m: unknown): m is DateMemory {
  if (!m || typeof m !== 'object') return false;
  const d = m as Partial<DateMemory>;
  return (
    typeof d.id === 'string' && !!d.id
    && typeof d.label === 'string' && !!d.label.trim()
    && typeof d.month === 'number' && Number.isInteger(d.month) && d.month >= 1 && d.month <= 12
    && typeof d.day === 'number' && Number.isInteger(d.day) && d.day >= 1
    && d.day <= DAYS_IN_MONTH[d.month - 1]
    && (d.kind === 'birthday' || d.kind === 'anniversary' || d.kind === 'other')
    && (d.person === undefined || typeof d.person === 'string')
  );
}

export function loadDateMemories(storage?: StorageLike | null): DateMemory[] {
  const s = resolveStorage(storage);
  if (!s) return [];
  try {
    const raw = s.getItem(DATE_MEMORIES_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter(validDateMemory) : [];
  } catch {
    return [];
  }
}

export function saveDateMemories(mems: DateMemory[], storage?: StorageLike | null): void {
  const s = resolveStorage(storage);
  if (!s) return;
  try {
    s.setItem(DATE_MEMORIES_KEY, JSON.stringify((mems || []).filter(validDateMemory)));
  } catch {
    // storage unavailable — dates just won't persist
  }
}

export function makeDateMemory(
  label: string,
  month: number,
  day: number,
  kind: DateMemoryKind,
  person?: string,
): DateMemory {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    label,
    month,
    day,
    kind,
    ...(person ? { person } : {}),
  };
}

/** The date memories that fall on today (local date; `today` is
 *  injectable for tests). */
export function getTodaysDates(mems: DateMemory[], today: Date = new Date()): DateMemory[] {
  const month = today.getMonth() + 1;
  const day = today.getDate();
  return (mems || []).filter((m) => m && m.month === month && m.day === day);
}

// --- extraction: spot a birthday/anniversary in his message -----------

const URDU_DIGITS: Record<string, string> = {
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
};

function toLatinDigits(s: string): string {
  return String(s || '').replace(/[۰-۹]/g, (d) => URDU_DIGITS[d] || d);
}

/** Month names in Urdu, English and common Roman-Urdu spellings. */
const MONTH_TABLE: Array<{ month: number; names: string[] }> = [
  { month: 1, names: ['جنوری', 'january', 'januari', 'jan'] },
  { month: 2, names: ['فروری', 'february', 'farwari', 'feb'] },
  { month: 3, names: ['مارچ', 'march', 'mar'] },
  { month: 4, names: ['اپریل', 'april', 'apr'] },
  { month: 5, names: ['مئی', 'may'] },
  { month: 6, names: ['جون', 'june', 'jun'] },
  { month: 7, names: ['جولائی', 'july', 'jul'] },
  { month: 8, names: ['اگست', 'august', 'agast', 'aug'] },
  { month: 9, names: ['ستمبر', 'september', 'satambar', 'sep', 'sept'] },
  { month: 10, names: ['اکتوبر', 'october', 'aktubar', 'oct'] },
  { month: 11, names: ['نومبر', 'november', 'navambar', 'nov'] },
  { month: 12, names: ['دسمبر', 'december', 'disambar', 'dec'] },
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Find a (month, day) pair in the text. Accepts «14 اگست», «اگست 14»,
 * «14 August», «August 14», «اگست کی 14 تاریخ», and numeric «14/8»
 * — but ONLY when it sits near a date-kind word (checked by the
 * caller via the returned match position), so a stray «14 اگست» in
 * a story about something else is not claimed as a memory.
 */
function findMonthDay(text: string): { month: number; day: number; index: number } | null {
  const t = toLatinDigits(text);
  // Numeric «14/8» or «14-8» (day first, as he writes it).
  const numeric = /(\d{1,2})\s*[/\-.]\s*(\d{1,2})(?:\s*[/\-.]\s*\d{2,4})?/.exec(t);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= DAYS_IN_MONTH[month - 1]) {
      return { month, day, index: numeric.index };
    }
  }
  for (const { month, names } of MONTH_TABLE) {
    // Longest name first so «sept» never shadows «september», and
    // «mar» never shadows «march» mid-word.
    const ordered = [...names].sort((a, b) => b.length - a.length);
    const nameAlt = ordered.map(escapeRegExp).join('|');
    // Day before month: «14 اگست», «14th August», «14 August».
    // NOTE: no ASCII \b after the month name — \b only sees Latin
    // word characters, so it FAILS after Urdu letters (اگست + space
    // has no \b between two non-word chars). The Unicode lookahead
    // (?![\p{L}]) blocks partial matches («mar» inside «march»)
    // in every script instead.
    const dm = new RegExp(`(\\d{1,2})\\s*(?:st|nd|rd|th)?\\s*(?:of\\s+)?(${nameAlt})(?![\\p{L}])`, 'iu').exec(t);
    if (dm) {
      const day = Number(dm[1]);
      if (day >= 1 && day <= DAYS_IN_MONTH[month - 1]) return { month, day, index: dm.index };
    }
    // Month before day: «اگست 14», «August 14», «اگست کی 14 تاریخ».
    const md = new RegExp(`(${nameAlt})(?![\\p{L}])[^0-9]{0,12}(\\d{1,2})\\s*(?:st|nd|rd|th|تاریخ)?`, 'iu').exec(t);
    if (md) {
      const day = Number(md[2]);
      if (day >= 1 && day <= DAYS_IN_MONTH[month - 1]) return { month, day, index: md.index };
    }
  }
  return null;
}

const ANNIVERSARY_RE = /(anniversary|wedding|برسی|شادی کی سالگرہ|شادی کی تاریخ)/i;
const BIRTHDAY_RE = /(سالگرہ|birthday|bday|جنم دن|یوم پیدائش|salgirh?a?|salgira)/i;
// A bare date only counts as a memory when a date-marker word sits
// near it — «14 اگست کو ایک خاص دن ہے», «تاریخ 14 اگست یاد رکھو».
const DATE_MARKER_RE = /(تاریخ|خاص دن|یادگار|date|special day)/i;

/**
 * Spot a birthday/anniversary mention in his message (Urdu, Roman
 * Urdu, English) and return the date memory — or null when nothing
 * is clear. The kind word and the date must sit close together
 * (within ~60 characters) so a long message that merely mentions a
 * birthday somewhere and a date somewhere else is not misread.
 * «میری سالگرہ کب ہے؟» (no date) → null. «سالگرہ مبارک» (no date)
 * → null. A bare «14 اگست» with no birthday/anniversary/date word
 * → null.
 */
export function extractDateMemory(text: string): DateMemory | null {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const found = findMonthDay(raw);
  if (!found) return null;
  const near = (re: RegExp): boolean => {
    const m = re.exec(raw);
    if (!m) return false;
    // Distance in characters between the kind word and the date.
    const kindAt = m.index;
    const dateAt = found.index;
    const gap = kindAt < dateAt
      ? dateAt - (kindAt + m[0].length)
      : kindAt - (dateAt + 12);
    return gap >= -12 && gap <= 60;
  };
  const isUrdu = /[\u0600-\u06FF]/.test(raw);
  let kind: DateMemoryKind | null = null;
  if (near(ANNIVERSARY_RE)) kind = 'anniversary';
  else if (near(BIRTHDAY_RE)) kind = 'birthday';
  else if (near(DATE_MARKER_RE)) kind = 'other';
  if (!kind) return null;

  // Whose date is it? «بھابھی کی سالگرہ 5 مئی» → person بھابھی.
  // «میری سالگرہ» / «my birthday» → his own (person left unset).
  let person: string | undefined;
  const personUr = /([^\s،,۔!؟]{1,20}(?:\s+[^\s،,۔!؟]{1,20}){0,2})\s+کی\s+(?:سالگرہ|شادی)/.exec(raw);
  if (personUr) {
    const p = personUr[1].trim().replace(/^(میری|میرا|میرے)\s+/, '');
    if (p && !/^(میری|میرا|میرے)$/.test(personUr[1].trim())) person = p;
  }
  if (!person) {
    // Roman Urdu: «sara ki salgirah 5 may» → person sara.
    const personRoman = /(\w+(?:\s+\w+)?)\s+ki\s+(?:salgirh?a?|birthday|anniversary)/i.exec(raw);
    if (personRoman && !/^(meri|mera|mere|my)$/i.test(personRoman[1].trim())) {
      person = personRoman[1].trim();
    }
  }
  if (!person) {
    const personEn = /(\w+(?:\s+\w+)?)'s\s+(?:birthday|anniversary|wedding)/i.exec(raw);
    if (personEn && !/^(my|his|her|their)$/i.test(personEn[1].trim())) person = personEn[1].trim();
  }

  const label = kind === 'birthday'
    ? person
      ? isUrdu ? `${person} کی سالگرہ` : `${person}'s birthday`
      : isUrdu ? 'میری سالگرہ' : 'Birthday'
    : kind === 'anniversary'
      ? person
        ? isUrdu ? `${person} کی شادی کی سالگرہ` : `${person}'s wedding anniversary`
        : isUrdu ? 'شادی کی سالگرہ' : 'Wedding anniversary'
      : isUrdu ? 'خاص تاریخ' : 'Special date';
  return makeDateMemory(label, found.month, found.day, kind, person);
}

// ---------------------------------------------------------------------------
// 3. CROSS-CHARACTER MEMORY — one character reads the other's chat and
//    volunteers what it infers (tile 2.6M: Jarvis, unasked — «from the
//    female character's chat it seems she likes you a lot»).
//    NEVER the other persona's raw notes — only one short inferred
//    line, in our own Urdu words. Null when there is nothing to infer.
// ---------------------------------------------------------------------------

/** Signals in the OTHER persona's notes/learnings that she/he is
 *  fond of him. Deliberately narrow: a bare «پسند» about tea, or a
 *  bare «انتظار» about a doctor, must NOT trigger a line about him.
 *  Only talk/missing/waiting-for-HIM patterns count. */
const MISS_RE = /(یاد آتی|یاد آتا|یاد کرتی|یاد کرتا|یاد آ رہی|یاد آ رہا|miss(es)? you|misses you)/i;
const WAIT_RE = /(آپ کا انتظار|انتظار کرتی|انتظار کرتا|waiting for you)/i;
const FOND_RE = /(محبت|پیار ہے|پیار کر|میری جان|love you)/i;
const TALK_FOND_RE = /(بات|گفتگو|بات چیت).{0,25}(اچھا|اچھی|پسند|مزہ)|(like|love|enjoy) talking/i;

export function otherPersonaRecallLine(persona: string, storage?: StorageLike | null): string | null {
  const p: MemoryPersona = persona === 'unique' ? 'unique' : 'uniqa';
  const other: MemoryPersona = p === 'unique' ? 'uniqa' : 'unique';
  const s = resolveStorage(storage);
  if (!s) return null;
  const texts: string[] = [
    ...loadNotes(s, other).map((n) => n.text),
    ...loadLearnings(s, other).map((l) => formatLearning(l)),
  ];
  if (!texts.length) return null;
  const joined = texts.join('\n');
  const otherName = other === 'uniqa' ? 'یونیکا' : 'یونیک';
  // Feminine verb endings when the OTHER persona is Uniqa.
  const ti = other === 'uniqa' ? 'کرتی' : 'کرتا';
  const ta = other === 'uniqa' ? 'چاہتی' : 'چاہتا';
  if (MISS_RE.test(joined)) {
    return `${otherName} کی باتوں سے لگتا ہے وہ آپ کو بہت یاد ${ti} ہے — آپ سے بات کیے بغیر اس کا دل نہیں لگتا۔`;
  }
  if (WAIT_RE.test(joined)) {
    return `${otherName} کی باتوں سے لگتا ہے وہ آپ کا انتظار ${ti} ہے — آپ کے آنے کا اسے بے چینی سے انتظار رہتا ہے۔`;
  }
  if (FOND_RE.test(joined)) {
    return `${otherName} کی باتوں سے لگتا ہے وہ آپ کو بہت ${ta} ہے — آپ اس کے لیے خاص ہیں۔`;
  }
  if (TALK_FOND_RE.test(joined)) {
    return `${otherName} کی باتوں سے لگتا ہے آپ سے بات کرنا اسے بہت اچھا لگتا ہے — آپ کی باتیں اسے یاد رہتی ہیں۔`;
  }
  return null;
}
