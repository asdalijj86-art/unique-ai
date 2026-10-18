/**
 * StatusPanel — the right-side glass panel from the reference image:
 * a circular animated "brain" graphic on top, then status rows with
 * green dots, Urdu labels and thin progress bars.
 */
import { BrainCircuit } from 'lucide-react';
import MapWidget from './MapWidget';
import SettingsPanel, { type AppSettings } from './SettingsPanel';

export type SystemStatus = {
  micActive: boolean;
  speaking: boolean;
  thinking: boolean;
  gesturesOn: boolean;
  continuousVoice: boolean;
};

type StatusPanelProps = {
  status: SystemStatus;
  settings: AppSettings;
  onSettingsChange: (s: AppSettings) => void;
  onClearChat: () => void;
};

const TOOLS_COUNT = 30;

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

export default function StatusPanel({ status, settings, onSettingsChange, onClearChat }: StatusPanelProps) {
  return (
    <aside className="status-panel" aria-label="سسٹم کی حالت">
      <div className="status-head">
        <div className="status-title" dir="rtl">سسٹم</div>
        <span className="brain-corner" aria-hidden="true">
          <BrainCircuit size={20} strokeWidth={1.8} />
        </span>
        <SettingsPanel
          settings={settings}
          onChange={onSettingsChange}
          onClearChat={onClearChat}
        />
      </div>
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
      <MapWidget />
    </aside>
  );
}
