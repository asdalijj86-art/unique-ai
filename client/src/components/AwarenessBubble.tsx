/**
 * AwarenessBubble — the thought bubble Awareness shows BEFORE it
 * speaks (Phase 1, 2026-11-22). The user sees what Unique is about
 * to say, and can let it speak, speak it now, or dismiss it — a
 * dismissed bubble never speaks.
 */
export default function AwarenessBubble({
  line,
  thinkingLabel,
  onSpeakNow,
  onDismiss,
}: {
  line: string;
  /** e.g. "💭 یونیک سوچ رہا ہے…" / "💭 یونیکا سوچ رہی ہے…" */
  thinkingLabel: string;
  onSpeakNow: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="uaware-bubble" role="status" data-testid="awareness-bubble" dir="rtl">
      <span className="uaware-bubble-label">{thinkingLabel}</span>
      <p className="uaware-bubble-line">{line}</p>
      <div className="uaware-bubble-actions">
        <button type="button" className="uaware-bubble-speak" onClick={onSpeakNow} data-testid="button-awareness-speak-now">
          ▶ ابھی بولیں
        </button>
        <button
          type="button"
          className="uaware-bubble-dismiss"
          onClick={onDismiss}
          aria-label="خاموش رہیں"
          data-testid="button-awareness-dismiss"
        >
          ✕
        </button>
      </div>
      <span className="uaware-bubble-progress" aria-hidden="true" />
    </div>
  );
}
