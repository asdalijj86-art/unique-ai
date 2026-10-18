/**
 * StatusPanel — the right-side glass panel from the reference image:
 * a circular animated "brain" graphic on top, then status rows with
 * green dots, Urdu labels and thin progress bars.
 */
import { BrainCircuit } from 'lucide-react';

export type SystemStatus = {
  micActive: boolean;
  speaking: boolean;
  thinking: boolean;
  gesturesOn: boolean;
  continuousVoice: boolean;
};

type StatusPanelProps = {
  status: SystemStatus;
};

const TOOLS_COUNT = 29;

function StatusRow({
  label,
  active,
  level,
}: {
  label: string;
  active: boolean;
  level: number; // 0..1 bar fill
}) {
  return (
    <div className="status-row" dir="rtl">
      <span className={`status-dot${active ? ' on' : ''}`} aria-hidden="true" />
      <span className="status-label">{label}</span>
      <span className="status-bar" aria-hidden="true">
        <i style={{ width: `${Math.round(level * 100)}%` }} className={active ? 'live' : ''} />
      </span>
    </div>
  );
}

export default function StatusPanel({ status }: StatusPanelProps) {
  return (
    <aside className="status-panel" aria-label="سسٹم کی حالت">
      <div className="brain-wrap" aria-hidden="true">
        <svg className="brain-rings" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="52" fill="none" strokeWidth="1.2" strokeDasharray="10 8" className="bring b1" />
          <circle cx="60" cy="60" r="42" fill="none" strokeWidth="1" strokeDasharray="4 10" className="bring b2" />
          <circle cx="60" cy="60" r="32" fill="none" strokeWidth="1.4" strokeDasharray="22 14" className="bring b3" />
        </svg>
        <span className="brain-core">
          <BrainCircuit size={30} strokeWidth={1.6} />
        </span>
        <span className="brain-halo" />
      </div>
      <div className="status-title" dir="rtl">سسٹم</div>
      <div className="status-rows">
        <StatusRow label="آواز" active={status.speaking} level={status.speaking ? 0.95 : status.thinking ? 0.5 : 0.18} />
        <StatusRow label="مائیکروفون" active={status.micActive} level={status.micActive ? 0.9 : 0.12} />
        <StatusRow label="مسلسل آواز" active={status.continuousVoice} level={status.continuousVoice ? 0.85 : 0.1} />
        <StatusRow label="اشارے" active={status.gesturesOn} level={status.gesturesOn ? 0.8 : 0.1} />
        <StatusRow label={`ٹولز (${TOOLS_COUNT})`} active level={1} />
        <StatusRow label="ماڈل" active level={0.92} />
      </div>
      <div className="status-foot" dir="rtl">
        <span className="status-dot on" aria-hidden="true" />
        سب سسٹم فعال ہیں
      </div>
    </aside>
  );
}
