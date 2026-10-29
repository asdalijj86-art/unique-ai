// Video Maker — pure logic for the in-app rendered-video maker.
//
// HONEST SCOPE, printed in the UI too: this maker does NOT do
// phoneme-accurate lip-sync. There is no free phoneme-accurate animal
// lip-sync engine in this stack. What it does is DIALOGUE-FIRST
// audio-driven animation: dialogue audio is generated FIRST, then a
// clearly VISIBLE mouth (jaw + head bob) is driven by that finished
// audio's RMS envelope — the mouth moves only while its character is
// actually speaking and closes in pauses. It is NOT syllable shapes,
// and it must never be described as such.
//
// Everything here is pure (no React, no canvas, no MediaRecorder) so
// it is headlessly testable: scripts can import the parsers, the
// lock store (with an injected storage) and the envelope math.
//
// Character locks live in localStorage, like the learning memory
// (lib/learnings): the same image + voice is reused for every scene
// of that character, across videos, until the user changes it.

export type VideoVoice = 'male' | 'female';

export interface CharacterLock {
  name: string;
  voice: VideoVoice;
  /** Data-URL of the locked reference image, or null if not locked yet. */
  imageDataUrl: string | null;
}

export interface VideoScene {
  index: number;
  speaker: string;
  text: string;
  /** True for the narrator: no face is required, a text scene is used. */
  isNarrator: boolean;
}

export type VideoJobStatus = 'building' | 'rendering' | 'done' | 'failed';

export interface VideoJobState {
  id: string;
  title: string;
  status: VideoJobStatus;
  sceneIndex: number;
  sceneTotal: number;
  stage: string;
  error: string;
  /** Export format, always honest: the browser recorder's format. */
  format: string;
  updatedAt: string;
}

export const VIDEO_CHARACTERS_KEY = 'unique-ai-video-characters';
export const VIDEO_JOB_KEY = 'unique-ai-video-maker-job';
export const VIDEO_SCENE_SECONDS = 10;
export const VIDEO_MAX_SCENES = 6;
export const NARRATOR_NAME = 'راوی';

export interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

// ---------------------------------------------------------------------------
// Dialogue parsing
// ---------------------------------------------------------------------------

/** Split a sentence run into scenes: 1–2 sentences per scene, max 6. */
function splitProseIntoScenes(text: string): VideoScene[] {
  const sentences = (text.match(/[^۔.!?\n]+[۔.!?\n]*/g) || [text])
    .map((s) => s.trim())
    .filter(Boolean);
  const scenes: VideoScene[] = [];
  for (let i = 0; i < sentences.length && scenes.length < VIDEO_MAX_SCENES; i += 2) {
    const chunk = sentences.slice(i, i + 2).join(' ').trim();
    if (chunk) scenes.push({ index: scenes.length, speaker: NARRATOR_NAME, text: chunk, isNarrator: true });
  }
  return scenes;
}

/**
 * Parse the maker's input into scenes.
 * - A line «نام: مکالمہ» becomes one speaking scene for that character.
 * - A line with no speaker becomes a narrator scene.
 * - If NO line has a speaker at all, the whole input is treated as a
 *   story prompt and split into narrator scenes (up to 6).
 * Dialogue is never edited here: text is kept exactly as typed.
 *
 * LIVE-TEST FIX (2026-10-29): the prompt box is a textarea, but a
 * browser/voice input can arrive with newlines collapsed into spaces
 * («راوی: …۔ شاہ: …» on one line). Splitting on line breaks alone
 * then merges two speakers into ONE narrator scene — exactly what
 * the live test showed (1 scene instead of 2, no speaking face at
 * all). So speaker labels are ALSO recognised mid-text: a label is
 * 1–2 words (letters only, no punctuation, no digits) followed by a
 * colon, at the start of the input or right after a sentence end
 * (۔ . ! ?) or a newline. Text before the first label, if any,
 * becomes a narrator scene. A colon inside ordinary dialogue (no
 * sentence end before the label, e.g. «کہا: …» mid-sentence) is
 * deliberately NOT split, to avoid cutting a line in half.
 */
const SPEAKER_LABEL = /([\p{L}\p{M}]+(?:\s+[\p{L}\p{M}]+)?)\s*[:：]\s*/gu;

export function parseDialogue(input: string): VideoScene[] {
  const raw = String(input || '').trim();
  if (!raw) return [];
  // Find every speaker label with its position.
  const labels: { speaker: string; matchIndex: number; textStart: number }[] = [];
  let m: RegExpExecArray | null;
  SPEAKER_LABEL.lastIndex = 0;
  while ((m = SPEAKER_LABEL.exec(raw)) !== null) {
    const atStart = m.index === 0;
    const before = raw.slice(0, m.index);
    const afterSentenceEnd = /[۔.!?]\s*$/.test(before) || /\n\s*$/.test(before);
    if (atStart || afterSentenceEnd) {
      labels.push({ speaker: m[1].trim(), matchIndex: m.index, textStart: m.index + m[0].length });
    }
  }
  if (labels.length === 0) {
    // No speaker labels at all: fall back to the old behaviour —
    // lines as narrator scenes, or prose split if it is one block.
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length > 1) {
      return lines.map((line, i) => ({ index: i, speaker: NARRATOR_NAME, text: line, isNarrator: true })).slice(0, VIDEO_MAX_SCENES);
    }
    return splitProseIntoScenes(raw);
  }
  const scenes: VideoScene[] = [];
  const preface = raw.slice(0, labels[0].matchIndex).trim();
  if (preface) {
    scenes.push({ index: 0, speaker: NARRATOR_NAME, text: preface, isNarrator: true });
  }
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    const nextStart = i + 1 < labels.length ? labels[i + 1].matchIndex : raw.length;
    const text = raw.slice(label.textStart, nextStart).trim();
    if (!text) continue;
    scenes.push({
      index: scenes.length,
      speaker: label.speaker,
      text,
      isNarrator: label.speaker === NARRATOR_NAME,
    });
  }
  return scenes.slice(0, VIDEO_MAX_SCENES);
}

/** Unique speaking characters (narrator excluded) in first-appearance order. */
export function speakingCharacters(scenes: VideoScene[]): string[] {
  const out: string[] = [];
  for (const s of scenes) {
    if (!s.isNarrator && !out.includes(s.speaker)) out.push(s.speaker);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Character locks (localStorage)
// ---------------------------------------------------------------------------

export function loadCharacterLocks(storage: StorageLike): CharacterLock[] {
  try {
    const arr = JSON.parse(storage.getItem(VIDEO_CHARACTERS_KEY) || '[]');
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((c) => c && typeof c.name === 'string')
      .map((c) => ({
        name: c.name,
        voice: c.voice === 'female' ? 'female' : 'male',
        imageDataUrl: typeof c.imageDataUrl === 'string' ? c.imageDataUrl : null,
      }));
  } catch {
    return [];
  }
}

export function saveCharacterLocks(storage: StorageLike, locks: CharacterLock[]): void {
  try {
    storage.setItem(VIDEO_CHARACTERS_KEY, JSON.stringify(locks));
  } catch {
    // storage unavailable — locks just won't persist this session
  }
}

/** Upsert one lock by name; voice/image are never swapped by accident. */
export function upsertCharacterLock(
  storage: StorageLike,
  lock: CharacterLock,
): CharacterLock[] {
  const locks = loadCharacterLocks(storage);
  const i = locks.findIndex((c) => c.name === lock.name);
  if (i >= 0) locks[i] = lock;
  else locks.push(lock);
  saveCharacterLocks(storage, locks);
  return locks;
}

// ---------------------------------------------------------------------------
// Job state (localStorage) — the ONLY source the status answer reads.
// ---------------------------------------------------------------------------

export function loadVideoMakerJob(storage: StorageLike): VideoJobState | null {
  try {
    const raw = storage.getItem(VIDEO_JOB_KEY);
    if (!raw) return null;
    const job = JSON.parse(raw) as VideoJobState;
    if (!job || typeof job.status !== 'string') return null;
    return job;
  } catch {
    return null;
  }
}

export function saveVideoMakerJob(storage: StorageLike, job: VideoJobState): void {
  try {
    storage.setItem(VIDEO_JOB_KEY, JSON.stringify(job));
  } catch {
    // storage unavailable — status answers fall back to the live card
  }
}

/** Plain-words status from the REAL job — never a chat-only promise. */
export function videoMakerStatusText(job: VideoJobState | null): string {
  if (!job) return 'ویڈیو میکر میں ابھی کوئی کام شروع نہیں ہوا ہے۔';
  if (job.status === 'building') {
    return `آپ کی ویڈیو ابھی بن رہی ہے — ${job.stage} (سین ${job.sceneIndex + 1} از ${job.sceneTotal})۔ یہ چیٹ کا وعدہ نہیں، ویڈیو میکر کی اصل حالت ہے۔`;
  }
  if (job.status === 'rendering') {
    return `آپ کی ویڈیو کی آوازیں تیار ہیں، اب ویڈیو رینڈر ہو رہی ہے — سین ${job.sceneIndex + 1} از ${job.sceneTotal}۔`;
  }
  if (job.status === 'done') {
    return `آپ کی ویڈیو بن چکی ہے — «${job.title}»۔ ویڈیو میکر کھولیں: اگر یہی سیشن چل رہا ہے تو وہیں ڈاؤن لوڈ بٹن ہوگا۔ فائل صرف اس سیشن میں رہتی ہے، اس لیے فوراً ڈاؤن لوڈ کر لیں۔`;
  }
  return `آپ کی ویڈیو نہیں بن سکی${job.error ? ` — وجہ: ${job.error}` : '۔'} کوئی جھوٹا لنک نہیں دیا جا رہا — ویڈیو میکر سے دوبارہ بنائیں۔`;
}

/** Same shape as the server's status question, plus a video context. */
export function isVideoMakerStatusQuery(text: string): boolean {
  const t = String(text || '').trim();
  if (!t || t.length > 160) return false;
  const progress = /(کہاں تک پہنچ|کتنا ہو گیا|کتنا بن گیا|بن گیا|بن گئی|تیار ہو گیا|ہو گیا کیا|status|progress|ready|کب تک|ہو رہا ہے|بن رہی ہے)/i.test(t);
  const context = /(میرا کام|میری چیز|کام|ویڈیو|چیز|video)/i.test(t);
  return progress && context;
}

/**
 * LIVE-TEST FIX (2026-10-29) — who answers a work-status question.
 * Old rule: a terminal (done/failed) video job only intercepted when
 * the question named a video, so the generic «میرا کام کہاں تک
 * پہنچا؟» fell through to Gemini, which errored (no key in the test
 * browser) and gave NO status at all. New rule, testable here:
 * - No video job → do not intercept (server builder path runs).
 * - Question clearly names an app/game/software/website AND does
 *   not name a video → do not intercept (server builder path runs).
 * - Otherwise, when a video job exists (building, rendering, done
 *   or failed) → intercept and answer from the real job store.
 * A question naming BOTH a video and an app/game is treated as a
 * video question, because the video job is the one with a local store.
 */
export function shouldInterceptVideoMakerStatus(
  text: string,
  job: VideoJobState | null,
): boolean {
  if (!job) return false;
  if (!isVideoMakerStatusQuery(text)) return false;
  const t = String(text || '');
  if (/(ویڈیو|video)/i.test(t)) return true;
  if (/(ایپ|گیم|سافٹ ویئر|ویب سائٹ|app|game|software|website)/i.test(t)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Automatic mode — no per-scene questions, no permission re-asks.
// A prompt alone must produce a video: characters the user has never
// locked get a DETERMINISTIC auto identity (same voice + same colour
// + same drawn face every time, saved as a lock), so a later video
// reuses them exactly. An uploaded reference image, when present,
// always wins over the drawn face — the lock is the authority.
// ---------------------------------------------------------------------------

export type AutoSpecies = 'lion' | 'fox' | 'deer' | 'wolf' | 'elephant' | 'generic';

export function autoVoiceFor(name: string): VideoVoice {
  const n = String(name || '');
  // Female names in this app's stories (Urdu + Roman). Everything else
  // defaults to the male voice — the user can change a lock afterwards,
  // but the automatic path never stops to ask.
  return /(لالی|زویا|یونیکا|uniqa|laali|zoya|لڑکی|عورت|بہن|ماں|امی|دادی|نانی)/i.test(n) ? 'female' : 'male';
}

export function autoSpeciesFor(name: string): AutoSpecies {
  const n = String(name || '');
  if (/(شیر|lion|شاہ|shah)/i.test(n)) return 'lion';
  if (/(لومڑی|fox|لالی|laali)/i.test(n)) return 'fox';
  if (/(ہرن|deer|چنّو|channu)/i.test(n)) return 'deer';
  if (/(بھیڑیا|wolf|زال|zaal)/i.test(n)) return 'wolf';
  if (/(ہاتھی|elephant|گج|gaj)/i.test(n)) return 'elephant';
  return 'generic';
}

/** Deterministic hue (0–359) from a name, so the auto face never changes. */
export function autoHueFor(name: string): number {
  let h = 0;
  for (const ch of String(name || '')) h = (h * 31 + ch.codePointAt(0)!) % 360;
  return h;
}

/** Ensure every speaking character (and the narrator) has a lock. */
export function ensureCharacterLocks(
  storage: StorageLike,
  scenes: VideoScene[],
): CharacterLock[] {
  const locks = loadCharacterLocks(storage);
  const names = [NARRATOR_NAME, ...speakingCharacters(scenes)];
  let changed = false;
  for (const name of names) {
    if (!locks.find((c) => c.name === name)) {
      locks.push({ name, voice: autoVoiceFor(name), imageDataUrl: null });
      changed = true;
    }
  }
  if (changed) saveCharacterLocks(storage, locks);
  return locks;
}

// ---------------------------------------------------------------------------
// Audio envelope → visible jaw
// ---------------------------------------------------------------------------

/**
 * Per-frame RMS envelope of decoded audio, normalised 0..1 and smoothed.
 * Frames past the audio's end are 0, so the mouth CLOSES in pauses —
 * the Day 1 v2 failure (mouth closed mid-line / open in silence) is
 * caught by construction, not by luck.
 */
export function computeEnvelope(
  channelData: ArrayLike<number>,
  sampleRate: number,
  fps: number,
  sceneSeconds: number,
): number[] {
  const totalFrames = Math.max(1, Math.round(fps * sceneSeconds));
  const perFrame = Math.max(1, Math.floor(sampleRate / fps));
  const raw: number[] = [];
  let peak = 0;
  for (let f = 0; f < totalFrames; f++) {
    const start = f * perFrame;
    if (start >= channelData.length) {
      raw.push(0);
      continue;
    }
    let sum = 0;
    let n = 0;
    for (let i = start; i < Math.min(start + perFrame, channelData.length); i++) {
      sum += channelData[i] * channelData[i];
      n++;
    }
    const rms = n > 0 ? Math.sqrt(sum / n) : 0;
    raw.push(rms);
    if (rms > peak) peak = rms;
  }
  // Smooth (3-frame moving average) so the jaw does not jitter.
  const out: number[] = [];
  for (let f = 0; f < raw.length; f++) {
    const v = (raw[Math.max(0, f - 1)] + raw[f] + raw[Math.min(raw.length - 1, f + 1)]) / 3;
    out.push(peak > 0 ? Math.min(1, v / peak) : 0);
  }
  return out;
}

/**
 * Envelope value → mouth openness 0..1. A dead zone below 0.08 keeps
 * the mouth SHUT on background noise; above it the jaw opens FAST so
 * the movement is clearly VISIBLE on a phone screen (the ~22px warp
 * that nobody could see in Day 1 v2 is exactly what this avoids).
 */
export function mouthOpen(envelopeValue: number): number {
  if (envelopeValue < 0.08) return 0;
  return Math.min(1, (envelopeValue - 0.08) * 1.8);
}

/** Word-wrap for canvas subtitles (measured in characters, not pixels). */
export function wrapLines(text: string, maxChars: number): string[] {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if (cur.length + 1 + w.length <= maxChars) cur += ` ${w}`;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}
