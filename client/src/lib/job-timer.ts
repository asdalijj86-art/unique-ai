/**
 * job-timer — the REAL job timer (no-lie rule, 2026-11-26).
 *
 * The user's standing rule: when Uniqa takes a job she must state
 * the minutes, start a visible timer, show the real work happening,
 * and deliver the ready file/link when done — never say
 * «میں کر دیتی ہوں» while nothing runs behind.
 *
 * This module is the timer's single source of truth. It is PURE
 * (no React, no DOM): chat.tsx owns the state, JobTimerBar renders
 * it and ticks every second.
 *
 * HONESTY RULES (absolute):
 *  - A timer starts ONLY when a real job starts (agent prediction,
 *    builder action, video job, USB save) and ends ONLY when that
 *    job reaches a terminal state. Nothing else ever starts one.
 *  - Fast jobs (< 1 minute — agent data calls) get NO minute
 *    estimate at all: the bar shows live «کام جاری ہے» + ticking
 *    seconds. Claiming minutes for a 5-second search would be a lie.
 *  - Long-job estimates come from the JOB TYPE, never a hardcoded
 *    promise: video = per-scene TTS + real-time render time;
 *    builder = one whole-app Gemini generation. Every estimate is
 *    shown as «تقریباً» (approximately), and when the elapsed time
 *    passes the estimate the bar says so plainly and keeps counting
 *    — it NEVER fakes completion at 100%.
 *  - On completion the bar names what was actually delivered (or
 *    the real failure reason), and the delivery itself lands in
 *    chat — the bar is the sign, never the delivery.
 */

export type JobTimerKind = 'agent' | 'video' | 'builder' | 'usb';

export type JobTimerStatus = 'running' | 'done' | 'failed';

export type JobTimerState = {
  id: string;
  kind: JobTimerKind;
  /** What is being done, e.g. «حسن — خبر و موسم ایجنٹ». */
  title: string;
  /** The user's own request, shortened (shown under the title). */
  detail?: string;
  startedAt: number;
  /** Seconds. null = fast job: show ticking seconds, claim NO minutes. */
  estimateSeconds: number | null;
  /** Live phase text while running («USB فولڈر چن رہے ہیں…»). */
  stage?: string;
  status: JobTimerStatus;
  /** What was actually delivered, e.g. «موسم بتا دیا — نتائج چیٹ میں ہیں». */
  resultText?: string;
  /** Real failure reason, when status is 'failed'. */
  errorText?: string;
  finishedAt?: number;
};

/** Agent data calls (search / weather / news / calc / translate /
 *  QR / prayer) are seconds-long — no minutes are ever claimed. */
export const AGENT_ESTIMATE_SECONDS: number | null = null;

/**
 * Builder estimate — one whole-app Gemini generation. An app build
 * is a single model call that writes a full PWA (HTML + manifest +
 * service worker); on this stack that normally lands inside two
 * minutes. Shown as «تقریباً 2 منٹ», and the bar keeps counting
 * honestly past it.
 */
export const BUILDER_ESTIMATE_SECONDS = 120;

/**
 * Video estimate — per scene: one dialogue-audio generation (up to
 * 3 TTS legs, each with its own ~10s connect timeout, plus decode)
 * plus the real-time render (each scene IS 10 seconds of video).
 * 40s per scene is the planning figure, shown as «تقریباً».
 */
export const VIDEO_ESTIMATE_SECONDS_PER_SCENE = 40;

export function estimateVideoJobSeconds(sceneTotal: number): number {
  const scenes = Math.max(1, sceneTotal || 1);
  return scenes * VIDEO_ESTIMATE_SECONDS_PER_SCENE;
}

export function createJobTimer(
  kind: JobTimerKind,
  title: string,
  estimateSeconds: number | null,
  detail?: string,
): JobTimerState {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    title,
    detail,
    startedAt: Date.now(),
    estimateSeconds,
    status: 'running',
  };
}

/** Whole elapsed seconds between two timestamps. */
export function elapsedSeconds(startedAt: number, now: number): number {
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}

/** «45 سیکنڈ» / «1 منٹ 20 سیکنڈ» / «3 منٹ 5 سیکنڈ». */
export function formatJobElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  if (s < 60) return `${s} سیکنڈ`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return rest > 0 ? `${m} منٹ ${rest} سیکنڈ` : `${m} منٹ`;
}

/** «تقریباً 2 منٹ» — the estimate as it is shown on the bar. */
export function formatJobEstimate(estimateSeconds: number): string {
  return `تقریباً ${formatJobElapsed(estimateSeconds)}`;
}
