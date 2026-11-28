/**
 * tour.ts — GUIDED TOUR + WHAT'S NEW (Phase 2, Stonic v3.1.22: full
 * guided tour + "after an update, Stonic shows you what is new").
 *
 * A ~3-minute first-run walkthrough (six short steps, replayable
 * from Settings) and a what's-new dialog that lists the real changes
 * since the version the user last saw (from lib/changelog — real
 * entries only, never invented features).
 */

import { CHANGELOG, CURRENT_CHANGELOG_ID, type ChangelogEntry } from './changelog';

export interface TourStep {
  id: string;
  title: string;
  text: string;
  /** data-testid of the UI the step points at (when present). */
  targetTestId?: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: '👋 خوش آمدید — یونیکا سے ملیں',
    text: 'یہ یونیکا ہے — آپ کی ساتھی۔ وہ بولتی ہے، یاد رکھتی ہے، اور خود پہلے بھی بولتی ہے۔ یہ سیر 3 منٹ کی ہے — ہر قدم پر «اگلا» دبائیں۔',
  },
  {
    id: 'face',
    title: '💛 چہرہ اور لائنیں',
    text: 'بیچ میں یونیکا کا چہرہ ہے — اس کے ساتھ چار لائنیں جڑی ہیں: میموری، مہارتیں، کردار، سیٹنگز۔ کسی بھی لائن پر دبائیں — وہ چیز کھل جائے گی۔',
    targetTestId: 'face-panel',
  },
  {
    id: 'chat',
    title: '💬 چیٹ — بس نام لیں',
    text: 'بائیں طرف چیٹ ہے۔ کچھ بھی کہیں — «سٹڈی کھولو»، «یوٹیوب کھولو»، «الارم لگا دو» — وہ خود کھول دے گی۔ آواز کے لیے مائیک دبائیں، یا «Hey Unique» کہیں۔',
  },
  {
    id: 'agents',
    title: '🏢 ایجنٹ ٹاؤن',
    text: 'دائیں طرف نقشے کے نیچے آپ کی ٹیم بیٹھی ہے — دانیال، حسن، عمر، علی، حمزہ، یوسف، احمد۔ کسی کو کام دیں تو وہ کام کرتا نظر آئے گا، اور اس کی اپنی اسکرین کھل جائے گی۔',
    targetTestId: 'agent-town',
  },
  {
    id: 'memory',
    title: '🧠 میموری — وہ سب یاد رکھتی ہے',
    text: '«یاد رکھو» کہیں تو وہ محفوظ کر لیتی ہے۔ تصویری یادیں بھی یہیں ہیں — تصویر + اس کی کہانی۔ «تمہیں کیا یاد ہے؟» پوچھیں تو وہ بتا دے گی۔',
    targetTestId: 'button-panel-memory',
  },
  {
    id: 'settings',
    title: '⚙️ سیٹنگز — سب کچھ ایک جگہ',
    text: 'سیٹنگز میں ہر چیز قطاروں میں ہے — آواز، کیمرہ، چہرے کا تالا، فون جوڑنا، گائیڈڈ ٹور، اور بہت کچھ۔ کچھ بھی بدلنا ہو تو یہیں سے۔ سیر مکمل — اب آپ تیار ہیں! 💛',
    targetTestId: 'button-panel-settings',
  },
];

export const TOUR_SEEN_KEY = 'unique-ai-tour-seen';
export const TOUR_VERSION_KEY = 'unique-ai-tour-version';
export const CHANGELOG_SEEN_KEY = 'unique-ai-changelog-seen';

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export function tourSeen(storage: StorageLike): boolean {
  try {
    return storage.getItem(TOUR_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function markTourSeen(storage: StorageLike): void {
  try {
    storage.setItem(TOUR_SEEN_KEY, '1');
  } catch { /* ignore */ }
}

export function lastSeenChangelogId(storage: StorageLike): string | null {
  try {
    return storage.getItem(CHANGELOG_SEEN_KEY);
  } catch {
    return null;
  }
}

export function markChangelogSeen(storage: StorageLike): void {
  try {
    storage.setItem(CHANGELOG_SEEN_KEY, CURRENT_CHANGELOG_ID);
  } catch { /* ignore */ }
}

/** Real entries newer than the one the user last saw (newest first).
 *  Empty when everything is already seen — the dialog stays shut. */
export function whatsNewSince(storage: StorageLike): ChangelogEntry[] {
  const seen = lastSeenChangelogId(storage);
  if (!seen) return CHANGELOG.slice(0, 2);
  const idx = CHANGELOG.findIndex((e) => e.id === seen);
  if (idx <= 0) return [];
  return CHANGELOG.slice(0, idx);
}
