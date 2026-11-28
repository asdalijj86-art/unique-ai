/**
 * GuidedTour — GUIDED TOUR + WHAT'S NEW (Phase 2, Stonic v3.1.22:
 * full guided tour + "after an update, Stonic shows you what is
 * new"). Six short steps, ~3 minutes, replayable from Settings; the
 * what's-new dialog lists the real changelog entries since the
 * version the user last saw.
 */

import { useState } from 'react';
import { TOUR_STEPS } from '@/lib/tour';
import type { ChangelogEntry } from '@/lib/changelog';

export function TourOverlay({
  onClose,
}: {
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const current = TOUR_STEPS[step];
  const last = step === TOUR_STEPS.length - 1;

  return (
    <div className="utour-overlay" data-testid="guided-tour" role="dialog" aria-label="گائیڈڈ ٹور">
      <div className="utour-card" dir="rtl">
        <div className="utour-progress" data-testid="tour-progress">
          قدم {step + 1} / {TOUR_STEPS.length}
        </div>
        <div className="utour-title">{current.title}</div>
        <p className="utour-text">{current.text}</p>
        <div className="utour-actions">
          {step > 0 && (
            <button type="button" onClick={() => setStep((s) => s - 1)} data-testid="button-tour-back">
              ◀ پچھلا
            </button>
          )}
          {!last ? (
            <button type="button" className="utour-next" onClick={() => setStep((s) => s + 1)} data-testid="button-tour-next">
              اگلا ▶
            </button>
          ) : (
            <button type="button" className="utour-next" onClick={onClose} data-testid="button-tour-finish">
              ✅ سمجھ گیا — شروع کریں
            </button>
          )}
          <button type="button" onClick={onClose} data-testid="button-tour-skip">
            چھوڑیں
          </button>
        </div>
      </div>
    </div>
  );
}

export function WhatsNewDialog({
  entries,
  onClose,
}: {
  entries: ChangelogEntry[];
  onClose: () => void;
}) {
  return (
    <div className="upanel" data-testid="whats-new-dialog" dir="rtl">
      <p className="upanel-intro">✨ نیا کیا ہے — اپڈیٹ کے بعد کی تبدیلیاں:</p>
      {entries.length === 0 ? (
        <p className="upanel-empty">ابھی کچھ نیا نہیں — آپ تازہ ترین ورژن پر ہیں۔</p>
      ) : (
        entries.map((entry) => (
          <div key={entry.id} className="uchlog-entry">
            <div className="uchlog-head">
              <span className="uchlog-title">{entry.title}</span>
              <span className="uchlog-date">{entry.date}</span>
            </div>
            <ul className="uchlog-notes">
              {entry.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        ))
      )}
      <button type="button" className="upanel-refresh" onClick={onClose} data-testid="button-whats-new-close">
        ✅ ٹھیک ہے
      </button>
    </div>
  );
}
