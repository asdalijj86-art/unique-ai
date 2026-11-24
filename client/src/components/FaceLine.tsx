/**
 * FaceLine — the speech line ATTACHED to the living face (2026-11-24,
 * full Stonic screen: lines attached to the face, not floating free).
 * It shows the ACTUAL reply text currently being spoken — the same
 * text the voice is reading — never invented or decorative text. It
 * appears only while speech is active and clears the moment speech
 * ends or is stopped. The tail points up to the orb; the thought
 * bubble (AwarenessBubble) points down to it from above, so the
 * face carries both lines, Stonic-style.
 */

export default function FaceLine({
  text,
  label,
  persona,
}: {
  /** The exact text being spoken right now. */
  text: string;
  /** e.g. «یونیکا بول رہی ہے…» */
  label: string;
  persona: 'unique' | 'uniqa';
}) {
  const shown = text.length > 160 ? `${text.slice(0, 160).trim()}…` : text;
  return (
    <div
      className={`uface-line uface-line-${persona}`}
      dir="rtl"
      role="status"
      aria-live="polite"
      data-testid="face-line"
    >
      <span className="uface-line-label">{label}</span>
      <p className="uface-line-text">{shown}</p>
    </div>
  );
}
