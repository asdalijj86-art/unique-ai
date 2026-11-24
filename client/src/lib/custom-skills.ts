/**
 * Custom skills (2026-11-24, Stonic-video build): skills the user
 * creates himself from the SKILLS node — SKILL NAME, DESCRIPTION,
 * INSTRUCTIONS — stored on this device only (localStorage key
 * 'unique-ai-custom-skills', same StorageLike convention as
 * lib/memory). The brain genuinely receives them: chat.tsx appends
 * them to the team context block sent with every message, so Unique /
 * Uniqa answer with those skills in mind. Nothing is invented — a
 * skill only exists after the user saves it here.
 */

export type CustomSkill = {
  id: string;
  name: string;
  description: string;
  instructions: string;
  createdAt: string;
};

export const CUSTOM_SKILLS_KEY = 'unique-ai-custom-skills';

export type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export function loadCustomSkills(storage: StorageLike): CustomSkill[] {
  try {
    const raw = storage.getItem(CUSTOM_SKILLS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr)
      ? arr.filter(
          (s): s is CustomSkill =>
            Boolean(s && typeof s.id === 'string' && typeof s.name === 'string'),
        )
      : [];
  } catch {
    return [];
  }
}

export function saveCustomSkills(storage: StorageLike, skills: CustomSkill[]): void {
  try {
    storage.setItem(CUSTOM_SKILLS_KEY, JSON.stringify(skills));
  } catch {
    /* storage full/unavailable — the panel shows the in-memory list */
  }
}

export function addCustomSkill(
  storage: StorageLike,
  skill: Omit<CustomSkill, 'id' | 'createdAt'>,
): CustomSkill[] {
  const next: CustomSkill = {
    ...skill,
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  const list = [next, ...loadCustomSkills(storage)];
  saveCustomSkills(storage, list);
  return list;
}

export function deleteCustomSkill(storage: StorageLike, id: string): CustomSkill[] {
  const list = loadCustomSkills(storage).filter((s) => s.id !== id);
  saveCustomSkills(storage, list);
  return list;
}

/** One compact line per skill for the team context block. */
export function formatCustomSkills(skills: CustomSkill[]): string {
  return skills
    .map((s) => `${s.name}: ${s.description}${s.instructions ? ` — ${s.instructions}` : ''}`)
    .join(' | ');
}
