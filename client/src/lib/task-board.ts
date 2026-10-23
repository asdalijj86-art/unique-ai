/**
 * Task board — «آج کا بورڈ» (Master Plan Phase 4, office scene item 6).
 *
 * The office wall board: every task an agent REALLY completed today
 * (a weather answer حسن actually returned, a search دانیال actually
 * ran, a build احمد actually finished) is pinned here with its time.
 * The office scene's board and the per-agent close-up both read this
 * one store, so they can never disagree.
 *
 * Honesty rule (same as the agent strip): only REAL completions are
 * recorded — chat.tsx calls recordBoardCompletion only with actions
 * the server actually returned (see RECORDABLE_ACTION_TYPES), and a
 * build only when its card watched the job reach «done». Plain chat
 * replies record nothing: no agent worked, so the board stays empty.
 *
 * Storage: localStorage 'unique-ai-task-board' = { day, entries } —
 * a new day starts a fresh board (yesterday's pins are not carried).
 * Pure module (storage injected) like lib/memory / lib/backup.
 */

import type { StorageLike } from './backup';

export const BOARD_KEY = 'unique-ai-task-board';
const MAX_ENTRIES_PER_DAY = 80;

export type BoardEntry = {
  agentKey: string;
  person: string;
  icon: string;
  /** What the task was — the user's request, or the built thing's title. */
  label: string;
  /** ISO timestamp of completion. */
  at: string;
};

export function dayKeyOf(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

type BoardData = { day: string; entries: BoardEntry[] };

function readBoard(storage: StorageLike): BoardData | null {
  try {
    const raw = storage.getItem(BOARD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.day !== 'string' || !Array.isArray(parsed.entries)) return null;
    return {
      day: parsed.day,
      entries: parsed.entries.filter(
        (e: any) => e && typeof e.agentKey === 'string' && typeof e.label === 'string' && typeof e.at === 'string',
      ),
    };
  } catch {
    return null;
  }
}

/** Today's entries (oldest → newest). A stored board from a previous
 *  day reads as empty — the new day's board starts blank. */
export function loadBoardEntries(storage: StorageLike, now: Date = new Date()): BoardEntry[] {
  const board = readBoard(storage);
  if (!board || board.day !== dayKeyOf(now)) return [];
  return board.entries;
}

/** Pin a REAL completion and return today's full list. */
export function recordBoardCompletion(
  storage: StorageLike,
  entry: { agentKey: string; person: string; icon: string; label: string },
  now: Date = new Date(),
): BoardEntry[] {
  const today = dayKeyOf(now);
  const board = readBoard(storage);
  const entries = board && board.day === today ? board.entries : [];
  const next: BoardEntry[] = [
    ...entries,
    { ...entry, label: entry.label.slice(0, 90), at: now.toISOString() },
  ].slice(-MAX_ENTRIES_PER_DAY);
  try {
    storage.setItem(BOARD_KEY, JSON.stringify({ day: today, entries: next }));
  } catch {
    // storage unavailable — the board just won't persist
  }
  return next;
}

/**
 * Action types that mean an agent genuinely FINISHED a piece of work
 * (data came back). Deliberately excluded:
 *  - build_app — async; recorded only when the job truly completes
 *    (handleBuildReady), never at order time.
 *  - android_app / open_tool — they OPEN a screen; opening is not a
 *    completed task.
 *  - open_url — superseded by open_link cards (دانیال's).
 */
export const RECORDABLE_ACTION_TYPES = new Set([
  'search_results', 'youtube_results', 'page_summary', 'open_link',
  'news_results', 'weather',
  'calc_result', 'currency_result', 'unit_convert', 'set_timer', 'world_clock',
  'translate_result', 'doc_download', 'save_note', 'list_notes',
  'qr_code', 'video_ideas',
  'prayer_times',
]);

export function isRecordableAction(type: string): boolean {
  return RECORDABLE_ACTION_TYPES.has(type);
}

/** «14:32» from an ISO timestamp, for board rows. */
export function formatBoardTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
