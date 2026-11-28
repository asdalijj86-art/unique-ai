/**
 * characters.ts — CUSTOM CHARACTERS (Phase 2, user order 2026-11-28,
 * Stonic site check: 9 preset roles + fully custom name/voice/
 * personality). Uniqa stays the DEFAULT front character; a custom
 * character is an extra identity the user can switch to, summon by
 * name, and give its own memory notes.
 *
 * HONEST VOICE SCOPE: a custom character speaks with one of the two
 * LOCKED voice chains — Uniqa's female voice (Sulafat) or Unique's
 * male voice (Salman) — chosen by the character's gender. There is
 * no third voice engine; the picker says so plainly. The character's
 * name, role and personality DO change what the brain says (the
 * server gets a character directive) and how the front names her/him.
 *
 * Own memory store: each custom character keeps its OWN notes
 * (unique-ai-char-notes-<id>) — separate from Uniqa's and Unique's
 * vault memory, in the same per-account namespaced store. The brain
 * recall block gains the active character's notes (chat.tsx).
 *
 * Pure + storage-passed (StorageLike), like lib/memory.ts — the same
 * standard as the other unit-tested libs.
 */

export type CharacterRole =
  | 'girlfriend' | 'partner' | 'bestfriend' | 'assistant' | 'listener'
  | 'boyfriend' | 'bro' | 'mentor' | 'butler';

export type CharacterGender = 'female' | 'male';

export interface CharacterDef {
  id: string;
  /** Display name — the user can rename any character. Ours, never Stonic's. */
  name: string;
  role: CharacterRole;
  gender: CharacterGender;
  /** Free-text personality, in the user's own words. */
  personality: string;
  /** Emoji shown on the character chip. */
  icon: string;
  /** Accent colour for the chip (hex). */
  color: string;
  createdAt: number;
  /** True for the two built-ins (Uniqa / Unique) — they are NOT
   *  deletable and NOT editable; they are the base voices. */
  builtin?: boolean;
}

export interface CharNote {
  id: string;
  text: string;
  createdAt: number;
}

export const CHARACTERS_KEY = 'unique-ai-characters';
export const ACTIVE_CHARACTER_KEY = 'unique-ai-active-character';

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

/** The 9 preset roles (Stonic's list, our own default names). */
export const CHARACTER_PRESETS: {
  role: CharacterRole;
  labelUrdu: string;
  labelEn: string;
  gender: CharacterGender;
  icon: string;
  color: string;
  defaultName: string;
  personality: string;
}[] = [
  { role: 'girlfriend', labelUrdu: 'گرل فرینڈ', labelEn: 'Girlfriend', gender: 'female', icon: '💛', color: '#fb7185', defaultName: 'ماہی', personality: 'پیار کرنے والی، خیال رکھنے والی ساتھی — گھر کی باتیں، دل کی باتیں، اور ہر وقت ساتھ۔' },
  { role: 'partner', labelUrdu: 'ساتھی', labelEn: 'Partner', gender: 'female', icon: '🤝', color: '#f472b6', defaultName: 'ہم سفر', personality: 'زندگی کا ساتھی — ہر فیصلے میں ساتھ، ہر مشکل میں حوصلہ، ہر خوشی میں شریک۔' },
  { role: 'bestfriend', labelUrdu: 'بہترین دوست', labelEn: 'Best Friend', gender: 'female', icon: '🌸', color: '#c084fc', defaultName: 'سہیلی', personality: 'بہترین دوست — کھل کر ہنسی، سچا مشورہ، اور کبھی بور نہیں ہونے دیتی۔' },
  { role: 'assistant', labelUrdu: 'معاون', labelEn: 'Assistant', gender: 'female', icon: '✨', color: '#22d3ee', defaultName: 'یونیکا', personality: 'آپ کی ساتھی معاون — کام پہلے، پھر دل کی باتیں۔ گرم، گھریلو، توجہ سے سننے والی۔' },
  { role: 'listener', labelUrdu: 'سننے والا', labelEn: 'Listener', gender: 'male', icon: '👂', color: '#60a5fa', defaultName: 'ہمدرد', personality: 'صرف سننے والا — بغیر فیصلے کے، پوری توجہ سے سنتا ہے، اور دل ہلکا کر دیتا ہے۔' },
  { role: 'boyfriend', labelUrdu: 'بوائے فرینڈ', labelEn: 'Boyfriend', gender: 'male', icon: '💙', color: '#38bdf8', defaultName: 'ساجن', personality: 'خیال رکھنے والا ساتھی — حوصلہ، مزاح، اور ہر وقت ساتھ کھڑا۔' },
  { role: 'bro', labelUrdu: 'بھائی', labelEn: 'Bro', gender: 'male', icon: '🤜', color: '#34d399', defaultName: 'یار', personality: 'بھائی جیسا دوست — سیدھی بات، کھلا مزاح، اور مشکل وقت میں پہلے حاضر۔' },
  { role: 'mentor', labelUrdu: 'استاد', labelEn: 'Mentor', gender: 'male', icon: '🎓', color: '#fbbf24', defaultName: 'استاد جی', personality: 'رہنما استاد — صبر سے سمجھاتا ہے، قدم بہ قدم، اور ہمیشہ آگے بڑھنے کی ترغیب دیتا ہے۔' },
  { role: 'butler', labelUrdu: 'خادم (سائنس فکشن)', labelEn: 'Butler', gender: 'male', icon: '🤖', color: '#94a3b8', defaultName: 'جارویس', personality: 'سائنس فکشن خادم — شائستہ، تیز، اور ہر حکم فوراً بجا لانے والا۔' },
];

export function presetFor(role: CharacterRole) {
  return CHARACTER_PRESETS.find((p) => p.role === role) ?? CHARACTER_PRESETS[3];
}

export function roleLabelUrdu(role: CharacterRole): string {
  return presetFor(role).labelUrdu;
}

/** Built-in base characters — the two voices the app already has.
 *  They live in the same list so the picker shows ONE list, but they
 *  are flagged builtin (never deletable, never renamed). */
export function builtinCharacters(): CharacterDef[] {
  return [
    {
      id: 'builtin-uniqa', name: 'یونیکا', role: 'assistant', gender: 'female',
      personality: 'آپ کی ساتھی — گرم، گھریلو، توجہ سے سننے والی، ہر وقت ساتھ۔',
      icon: '💛', color: '#22d3ee', createdAt: 0, builtin: true,
    },
    {
      id: 'builtin-unique', name: 'یونیک', role: 'assistant', gender: 'male',
      personality: 'آپ کا معاون — سمجھاتا ہے، رہنمائی کرتا ہے، قدم بہ قدم۔',
      icon: '🤖', color: '#60a5fa', createdAt: 0, builtin: true,
    },
  ];
}

function newId(): string {
  try {
    return `char-${crypto.randomUUID().slice(0, 8)}`;
  } catch {
    return `char-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }
}

export function loadCharacters(storage: StorageLike): CharacterDef[] {
  try {
    const raw = storage.getItem(CHARACTERS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (c): c is CharacterDef =>
        !!c && typeof c === 'object' && typeof (c as CharacterDef).id === 'string'
        && typeof (c as CharacterDef).name === 'string' && (c as CharacterDef).name.trim().length > 0,
    );
  } catch {
    return [];
  }
}

export function saveCharacters(storage: StorageLike, list: CharacterDef[]): void {
  try {
    storage.setItem(CHARACTERS_KEY, JSON.stringify(list));
  } catch { /* storage full — list stays in memory only */ }
}

/** All characters the picker shows: the two built-ins first, then the user's own. */
export function allCharacters(storage: StorageLike): CharacterDef[] {
  return [...builtinCharacters(), ...loadCharacters(storage)];
}

export function createCharacterFromPreset(
  role: CharacterRole,
  overrides?: Partial<Pick<CharacterDef, 'name' | 'gender' | 'personality' | 'icon' | 'color'>>,
): CharacterDef {
  const p = presetFor(role);
  return {
    id: newId(),
    name: (overrides?.name ?? p.defaultName).trim() || p.defaultName,
    role,
    gender: overrides?.gender ?? p.gender,
    personality: (overrides?.personality ?? p.personality).trim() || p.personality,
    icon: overrides?.icon ?? p.icon,
    color: overrides?.color ?? p.color,
    createdAt: Date.now(),
  };
}

export function createCustomCharacter(input: {
  name: string;
  role: CharacterRole;
  gender: CharacterGender;
  personality: string;
  icon?: string;
  color?: string;
}): CharacterDef | null {
  const name = String(input.name || '').trim();
  if (!name || name.length > 40) return null;
  const p = presetFor(input.role);
  return {
    id: newId(),
    name,
    role: input.role,
    gender: input.gender,
    personality: String(input.personality || '').trim().slice(0, 500) || p.personality,
    icon: input.icon || p.icon,
    color: input.color || p.color,
    createdAt: Date.now(),
  };
}

export function updateCharacter(list: CharacterDef[], id: string, patch: Partial<CharacterDef>): CharacterDef[] {
  return list.map((c) => {
    if (c.id !== id || c.builtin) return c;
    const next = { ...c, ...patch, id: c.id, builtin: false };
    if (typeof next.name === 'string') next.name = next.name.trim().slice(0, 40) || c.name;
    if (typeof next.personality === 'string') next.personality = next.personality.slice(0, 500);
    return next;
  });
}

export function deleteCharacter(list: CharacterDef[], id: string): CharacterDef[] {
  return list.filter((c) => c.id !== id || c.builtin);
}

export function loadActiveCharacterId(storage: StorageLike): string | null {
  try {
    const id = storage.getItem(ACTIVE_CHARACTER_KEY);
    return id && id.trim() ? id : null;
  } catch {
    return null;
  }
}

export function saveActiveCharacterId(storage: StorageLike, id: string | null): void {
  try {
    if (id) storage.setItem(ACTIVE_CHARACTER_KEY, id);
    else storage.removeItem(ACTIVE_CHARACTER_KEY);
  } catch { /* ignore */ }
}

/** The active character, or null when the user runs on the plain
 *  Uniqa/Unique default (no custom character picked). Built-ins count
 *  as "no custom character" — they ARE the default. */
export function getActiveCharacter(storage: StorageLike): CharacterDef | null {
  const id = loadActiveCharacterId(storage);
  if (!id) return null;
  if (id === 'builtin-uniqa' || id === 'builtin-unique') return null;
  return loadCharacters(storage).find((c) => c.id === id) ?? null;
}

/** Base persona a character runs on: its gender decides the locked
 *  voice chain (female → Uniqa's voice, male → Unique's voice). */
export function basePersonaFor(character: CharacterDef): 'uniqa' | 'unique' {
  return character.gender === 'female' ? 'uniqa' : 'unique';
}

/** Honest voice line for the picker — no third voice is promised. */
export function characterVoiceNote(character: CharacterDef): string {
  return character.gender === 'female'
    ? 'آواز: یونیکا والی (خواتین، لاک شدہ) — کردار کی اپنی آواز کا انجن نہیں ہے'
    : 'آواز: یونیک والی (مرد، لاک شدہ) — کردار کی اپنی آواز کا انجن نہیں ہے';
}

// ---------------------------------------------------------------------------
// Summon by name — calling a custom character by its name switches to
// it, exactly like «یونیکا کو بلاؤ» summons Uniqa. Pure: the name
// must lead the message (optionally with a summon verb) or be the
// whole message; a name merely mentioned inside a sentence does NOT
// summon.
// ---------------------------------------------------------------------------

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function detectCharacterSummon(rawText: string, character: CharacterDef): boolean {
  const text = String(rawText || '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').trim();
  if (!text || !character.name) return false;
  const name = escapeRegExp(character.name.trim());
  // Pure call: just the name (and maybe a summon verb).
  if (new RegExp(`^${name}\\s*(کو بلاؤ|کو بلا لو|سے بات کرو|بلاؤ|بلا لو|بات کرو|talk to|call)?\\s*[۔.!?؟،,]*$`, 'i').test(text)) return true;
  // Prefix call: the name leads, then a real request follows.
  if (new RegExp(`^${name}\\s*(کو بلاؤ|کو بلا لو|سے بات کرو|بلاؤ|بلا لو|بات کرو|talk to|call)?\\s*[،,:\\-—]?\\s+\\S`, 'i').test(text)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Server directive — what the brain is told about the active custom
// character. The client sends it as the `character` field; the server
// appends it to the prompt (ADD-ONLY entry). Grammar follows the
// character's gender; the name is the user's own word.
// ---------------------------------------------------------------------------

export function buildCharacterDirective(character: CharacterDef): string {
  const grammar = character.gender === 'female'
    ? 'Use FEMININE Urdu grammar throughout (میں کر سکتی ہوں، میں نے کہی تھی) and refer to yourself by this name.'
    : 'Use MASCULINE Urdu grammar throughout (میں کر سکتا ہوں، میں نے بتایا) and refer to yourself by this name.';
  return ` CUSTOM CHARACTER — THIS reply is spoken as the user's chosen character «${character.name}» (${roleLabelUrdu(character.role)}): ${character.personality} ${grammar} Never call yourself Unique or Uniqa in this reply, and never call the user «بھائی» when speaking as a female character.`;
}

// ---------------------------------------------------------------------------
// Per-character notes — the character's OWN memory store.
// ---------------------------------------------------------------------------

export function charNotesKeyFor(characterId: string): string {
  return `unique-ai-char-notes-${characterId}`;
}

export function loadCharNotes(storage: StorageLike, characterId: string): CharNote[] {
  try {
    const raw = storage.getItem(charNotesKeyFor(characterId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (n): n is CharNote => !!n && typeof n === 'object' && typeof (n as CharNote).text === 'string',
    );
  } catch {
    return [];
  }
}

export function saveCharNotes(storage: StorageLike, characterId: string, notes: CharNote[]): void {
  try {
    storage.setItem(charNotesKeyFor(characterId), JSON.stringify(notes));
  } catch { /* ignore */ }
}

export function makeCharNote(text: string): CharNote | null {
  const t = String(text || '').trim().slice(0, 500);
  if (!t) return null;
  return { id: `cn-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, text: t, createdAt: Date.now() };
}

/** Recall block for the brain: the active character's own notes. */
export function charNotesRecallText(storage: StorageLike, characterId: string): string {
  const notes = loadCharNotes(storage, characterId);
  if (!notes.length) return '';
  return `اس کردار کی اپنی یادیں:\n${notes.slice(-10).map((n) => `- ${n.text}`).join('\n')}`;
}
