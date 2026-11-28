/**
 * skills-toggle.ts — SKILLS ON / OFF (Phase 2, Stonic: "Open Skills
 * to search your skills and turn each one on or off").
 *
 * Every studio, focus view and custom skill can be turned off from
 * the SKILLS panel. Off means: the panel button is disabled with an
 * honest «بند ہے» label, and the chat's studio opener refuses with
 * one line («یہ مہارت بند ہے — Skills سے آن کریں»). Nothing is
 * deleted by turning a skill off — it comes back exactly as it was.
 * Default: everything ON.
 */

export const SKILLS_ENABLED_KEY = 'unique-ai-skills-enabled';

/** Studio keys (HomePanels) + focus views + the custom-skill bucket. */
export type SkillKey =
  | 'library' | 'document' | 'media' | 'islamic' | 'game'
  | 'quran' | 'map' | 'whatsapp'
  | 'custom';

export const ALL_SKILL_KEYS: SkillKey[] = [
  'library', 'document', 'media', 'islamic', 'game', 'quran', 'map', 'whatsapp', 'custom',
];

export const SKILL_LABELS: Record<SkillKey, string> = {
  library: 'لائبریری',
  document: 'ڈاکومنٹ اسٹوڈیو',
  media: 'میڈیا اسٹوڈیو',
  islamic: 'اسلامی اسٹوڈیو',
  game: 'گیم اسٹوڈیو',
  quran: 'قرآن پاک',
  map: 'نقشہ',
  whatsapp: 'WhatsApp',
  custom: 'میری بنائی مہارتیں',
};

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type SkillsEnabledMap = Record<string, boolean>;

export function loadSkillsEnabled(storage: StorageLike): SkillsEnabledMap {
  try {
    const raw = storage.getItem(SKILLS_ENABLED_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: SkillsEnabledMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'boolean') out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveSkillsEnabled(storage: StorageLike, map: SkillsEnabledMap): void {
  try {
    storage.setItem(SKILLS_ENABLED_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
}

/** Missing = ON (everything works until the user turns it off). */
export function isSkillEnabled(map: SkillsEnabledMap, key: SkillKey): boolean {
  return map[key] !== false;
}

export function setSkillEnabled(map: SkillsEnabledMap, key: SkillKey, on: boolean): SkillsEnabledMap {
  return { ...map, [key]: on };
}
