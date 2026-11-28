/**
 * your-world.ts — "YOUR WORLD" DAILY BRIEFING (Phase 2, Stonic:
 * "once a day, Stonic reads what it remembers about you, searches
 * the web for the things you care about, and leaves you three short
 * picks with a summary").
 *
 * Exactly three picks, once a day, from REAL inputs only — the latest
 * learning, the latest note / today's work, and the top live news
 * headline the app actually fetched. A pick with no real input is
 * left out (never invented); the briefing is cached by date so it
 * does not change under the user during the day.
 */

export interface WorldBriefingPick {
  title: string;
  detail: string;
  source: 'memory' | 'work' | 'news';
}

export interface WorldBriefing {
  date: string; // YYYY-MM-DD (local)
  picks: WorldBriefingPick[];
}

export const WORLD_BRIEFING_KEY = 'unique-ai-world-briefing';

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export function briefingDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function buildDailyBriefing(input: {
  latestLearning?: string | null;
  latestNote?: string | null;
  todayWork?: { title: string; detail: string } | null;
  topNews?: { title: string; link: string } | null;
  messageCount?: number;
}): WorldBriefingPick[] {
  const picks: WorldBriefingPick[] = [];
  if (input.latestLearning) {
    picks.push({ title: 'آپ نے مجھے یہ سکھایا', detail: input.latestLearning, source: 'memory' });
  }
  if (input.todayWork) {
    picks.push({ title: input.todayWork.title, detail: input.todayWork.detail, source: 'work' });
  } else if (input.latestNote) {
    picks.push({ title: 'تازہ یادداشت', detail: input.latestNote, source: 'memory' });
  }
  if (input.topNews) {
    picks.push({ title: 'آج کی خبر', detail: input.topNews.title, source: 'news' });
  }
  return picks.slice(0, 3);
}

export function loadBriefing(storage: StorageLike, date: Date = new Date()): WorldBriefing | null {
  try {
    const raw = storage.getItem(WORLD_BRIEFING_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const b = parsed as WorldBriefing;
    if (b.date !== briefingDateKey(date)) return null;
    if (!Array.isArray(b.picks)) return null;
    return b;
  } catch {
    return null;
  }
}

export function saveBriefing(storage: StorageLike, briefing: WorldBriefing): void {
  try {
    storage.setItem(WORLD_BRIEFING_KEY, JSON.stringify(briefing));
  } catch { /* ignore */ }
}

/** One-line summary of the day's briefing — for the collapsed digest. */
export function briefingSummary(briefing: WorldBriefing | null): string {
  if (!briefing || briefing.picks.length === 0) {
    return 'آج کے لیے ابھی تین چیزیں تیار نہیں — جیسے ہی کچھ سیکھوں گی، یہاں آ جائے گا۔';
  }
  return `آج کی 3 چیزیں: ${briefing.picks.map((p) => p.title).join(' • ')}`;
}
