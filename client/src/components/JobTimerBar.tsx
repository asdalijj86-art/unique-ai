// JobTimerBar — the visible job timer (no-lie rule, 2026-11-26).
//
// Renders ONE JobTimerState (lib/job-timer) and ticks every second
// from the real clock — the elapsed time is computed from the job's
// real startedAt, never from a guess. It is rendered ONLY while a
// job is running or its just-finished result is still on screen
// (front-simple rule: nothing new is visible on the front except
// while a job is actually running or just delivered).
//
// - running + estimate: progress bar (elapsed / estimate, capped at
//   100%) + «تقریباً X» + live elapsed; past the estimate it says
//   «تخمینہ سے زیادہ وقت لگ رہا ہے» and keeps counting — never a
//   fake finish.
// - running + no estimate (fast agent job): «کام جاری ہے…» + live
//   elapsed seconds. No minutes are claimed for a seconds-long job.
// - done: ✅ + what was actually delivered + how long it took.
// - failed: ❌ + the real failure reason + how long it ran.
// A finished bar dismisses itself after 20 seconds (or on ✕).

import { useEffect, useState } from 'react';
import { elapsedSeconds, formatJobElapsed, formatJobEstimate, type JobTimerState } from '@/lib/job-timer';

const AUTO_DISMISS_MS = 20_000;

export default function JobTimerBar({
  timer,
  onDismiss,
}: {
  timer: JobTimerState | null;
  onDismiss: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // A finished result stays on screen long enough to be read (and
  // heard, via the chat delivery), then clears itself — it never
  // lingers as a stale "done" claim for the next job.
  useEffect(() => {
    if (!timer || timer.status === 'running') return;
    const id = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => window.clearTimeout(id);
  }, [timer, onDismiss]);

  if (!timer) return null;

  const endAt = timer.status === 'running' ? now : (timer.finishedAt ?? now);
  const elapsed = elapsedSeconds(timer.startedAt, endAt);
  const estimate = timer.estimateSeconds;
  const overEstimate = estimate !== null && timer.status === 'running' && elapsed > estimate;
  const progress = estimate !== null ? Math.min(100, Math.round((elapsed / estimate) * 100)) : null;

  const base: React.CSSProperties = {
    margin: '8px 12px 0', padding: '10px 14px', borderRadius: 12, fontSize: 13.5, lineHeight: 1.8, direction: 'rtl',
  };
  const style =
    timer.status === 'done'
      ? { ...base, background: 'rgba(22,163,74,0.2)', border: '1px solid rgba(74,222,128,0.5)', color: '#bbf7d0' }
      : timer.status === 'failed'
        ? { ...base, background: 'rgba(220,38,38,0.2)', border: '1px solid rgba(248,113,113,0.5)', color: '#fecaca' }
        : { ...base, background: 'rgba(37,99,235,0.25)', border: '1px solid rgba(96,165,250,0.6)', color: '#dbeafe', fontWeight: 700 };

  return (
    <div dir="rtl" data-testid="job-timer-bar" data-status={timer.status} data-kind={timer.kind} style={style}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ flex: 1, minWidth: 220 }}>
          {timer.status === 'running' && <>⏳ {timer.title}{timer.stage ? ` — ${timer.stage}` : ' — کام جاری ہے…'}</>}
          {timer.status === 'done' && <>✅ {timer.title}{timer.resultText ? ` — ${timer.resultText}` : ''}</>}
          {timer.status === 'failed' && <>❌ {timer.title}{timer.errorText ? ` — ${timer.errorText}` : ' — نہیں ہو سکا'}</>}
        </span>
        <span data-testid="job-timer-elapsed" style={{ whiteSpace: 'nowrap', fontWeight: 700 }}>
          ⏱️ {formatJobElapsed(elapsed)}
          {timer.status !== 'running' ? ' میں مکمل' : ''}
        </span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="ٹائمر بند کریں"
          data-testid="job-timer-dismiss"
          style={{ padding: '2px 10px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.25)', background: 'transparent', color: 'inherit', cursor: 'pointer' }}
        >
          ✕
        </button>
      </div>
      {timer.detail && timer.status === 'running' && (
        <div style={{ opacity: 0.85, fontSize: 12.5 }}>«{timer.detail}»</div>
      )}
      {timer.status === 'running' && estimate !== null && (
        <div style={{ marginTop: 6 }}>
          <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.15)', overflow: 'hidden' }}>
            <div data-testid="job-timer-progress" style={{ width: `${progress}%`, height: '100%', background: overEstimate ? '#fbbf24' : '#60a5fa', transition: 'width 1s linear' }} />
          </div>
          <div style={{ fontSize: 12.5, opacity: 0.9, marginTop: 2 }}>
            {overEstimate
              ? `تخمینہ (${formatJobEstimate(estimate)}) سے زیادہ وقت لگ رہا ہے — کام ابھی چل رہا ہے`
              : `تخمینہ: ${formatJobEstimate(estimate)}`}
          </div>
        </div>
      )}
      {timer.status === 'running' && estimate === null && (
        <div style={{ fontSize: 12.5, opacity: 0.9 }}>منٹ کا دعویٰ نہیں — یہ کام سیکنڈوں کا ہے، اس لیے صرف گزرا وقت دکھایا جا رہا ہے۔</div>
      )}
    </div>
  );
}
