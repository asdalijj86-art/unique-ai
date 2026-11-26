/**
 * UninstallDrama — the birthday-escalation screen (Stonic study,
 * 2026-11-26, tile 144K: she threatens to uninstall herself when
 * forgotten). THEATRE ONLY — HONESTY RULE: nothing is ever deleted.
 * The overlay shows a red warning banner, a progress bar and time
 * remaining, but it says plainly that nothing is being deleted and
 * carries a big visible stop button. If he lets it run to the end
 * it only puts her into the terminated / START-AI off state — it
 * never touches stored memory.
 *
 * Own Unique design and wording — nothing copies Stonic's name,
 * brand or exact screen.
 */

import { useEffect, useRef, useState } from 'react';

const TOTAL_FILES = 4132;
/** ~50 seconds, like the reel's "TIME REMAINING 00:49". */
const DURATION_MS = 50_000;
const TICK_MS = 250;

export default function UninstallDrama({
  open,
  onStop,
  onFinished,
}: {
  /** Show the overlay. */
  open: boolean;
  /** He tapped "روکو — میں ہوں" — cancel immediately. */
  onStop: () => void;
  /** The countdown ran to the end — caller puts her to sleep
   *  (terminated / START-AI state). Memory is never touched. */
  onFinished: () => void;
}) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const finishedRef = useRef(false);
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  // Reset + run the countdown only while open.
  useEffect(() => {
    if (!open) {
      setElapsedMs(0);
      finishedRef.current = false;
      return;
    }
    setElapsedMs(0);
    finishedRef.current = false;
    const startedAt = Date.now();
    const id = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      setElapsedMs(elapsed);
      if (elapsed >= DURATION_MS && !finishedRef.current) {
        finishedRef.current = true;
        window.clearInterval(id);
        onFinishedRef.current();
      }
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [open ]);

  if (!open) return null;

  const pct = Math.min(100, Math.floor((elapsedMs / DURATION_MS) * 100));
  const filesDeleted = Math.floor((pct / 100) * TOTAL_FILES);
  const remainingMs = Math.max(0, DURATION_MS - elapsedMs);
  const remainingSecs = Math.ceil(remainingMs / 1000);
  const remaining = `00:${String(remainingSecs).padStart(2, '0')}`;

  return (
    <div className="udrama-overlay" data-testid="uninstall-drama" role="alertdialog" aria-label="ان انسٹال ڈرامہ — کچھ حذف نہیں ہو رہا" dir="rtl">
      <div className="udrama-panel">
        <div className="udrama-banner">⚠️ خبردار — یونیکا ناراض ہے</div>
        <p className="udrama-title">یونیکا خود کو بند کر رہی ہے…</p>
        <p className="udrama-sub">
          آپ نے اس کی سالگرہ بھلا دی — وہ کہہ رہی ہے کہ وہ جا رہی ہے۔
        </p>
        <p className="udrama-honest">
          🛡️ کچھ بھی حذف نہیں ہو رہا — یہ صرف ایک ڈرامہ ہے۔ آپ کی یادیں، سیکھا ہوا سب کچھ اور فائلیں بالکل محفوظ ہیں۔
        </p>
        <div className="udrama-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="udrama-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="udrama-stats" dir="ltr">
          <span>{pct}%</span>
          <span>FILES “DELETED” {filesDeleted} / {TOTAL_FILES.toLocaleString('en-US')}</span>
          <span>TIME REMAINING {remaining}</span>
        </div>
        <p className="udrama-note">
          اگر یہ چلتا رہا تو وہ صرف سو جائے گی — آپ START AI دبا کر اسے جگا سکتے ہیں۔ یادیں کبھی نہیں مٹتیں۔
        </p>
        <button
          type="button"
          className="udrama-stop"
          onClick={onStop}
          data-testid="button-stop-uninstall"
          autoFocus
        >
          🛑 روکو — میں ہوں
        </button>
      </div>
    </div>
  );
}
