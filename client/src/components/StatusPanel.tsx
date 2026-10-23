/**
 * StatusPanel — the right-side glass panel from the reference image:
 * a circular animated "brain" graphic on top, then status rows with
 * green dots, Urdu labels and thin progress bars.
 */
import { BrainCircuit } from 'lucide-react';
import SettingsPanel, { type AppSettings } from './SettingsPanel';
import { AGENT_DEFS } from '../lib/agent-team';

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
  onTestVoice?: () => void;
  /** Chat language (moved into Settings in Phase سادگی). */
  chatLang: string;
  onChatLangChange: (v: string) => void;
  /** Opens the device-pairing panel — its entry lives in Settings. */
  onOpenPairing: () => void;
  /** Brain backup (Phase 4) — the «🧠 دماغ کا بیک اپ» group in Settings. */
  onBackupDownload: () => void;
  onBackupRestore: () => void;
  /** Persona + tone (Phase 2) — the «💛 ساتھی» group in Settings. */
  persona: 'unique' | 'uniqa';
  onPersonaChange: (p: 'unique' | 'uniqa') => void;
  tone: 'neutral' | 'serious' | 'romantic';
  onToneChange: (t: 'neutral' | 'serious' | 'romantic') => void;
};

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

export default function StatusPanel({ status, settings, onSettingsChange, onClearChat, onTestVoice, chatLang, onChatLangChange, onOpenPairing, onBackupDownload, onBackupRestore, persona, onPersonaChange, tone, onToneChange }: StatusPanelProps) {
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
          onTestVoice={onTestVoice}
          chatLang={chatLang}
          onChatLangChange={onChatLangChange}
          onOpenPairing={onOpenPairing}
          onBackupDownload={onBackupDownload}
          onBackupRestore={onBackupRestore}
          persona={persona}
          onPersonaChange={onPersonaChange}
          tone={tone}
          onToneChange={onToneChange}
        />
      </div>
      <div className="status-rows">
        <StatusRow label="آواز" active={status.speaking} level={status.speaking ? 0.95 : status.thinking ? 0.5 : 0.18} />
        <StatusRow label="مائیکروفون" active={status.micActive} level={status.micActive ? 0.9 : 0.12} />
        <StatusRow label="مسلسل آواز" active={status.continuousVoice} level={status.continuousVoice ? 0.85 : 0.1} />
        <StatusRow label="اشارے" active={status.gesturesOn} level={status.gesturesOn ? 0.8 : 0.1} />
        <StatusRow label={`ایجنٹ ٹیم (${AGENT_DEFS.length})`} active level={1} />
        <StatusRow label="ماڈل" active level={0.92} />
      </div>
      <div className="status-foot" dir="rtl">
        <span className="status-dot on" aria-hidden="true" />
        سب سسٹم فعال ہیں
      </div>
      {/* The side panel stays slim: status + the ONE settings button.
          The gear above opens Settings, which now also holds the chat
          language and the 📱 ڈیوائس جوڑیں (pairing) entry. Map/Quran/
          WhatsApp are scenes opened by voice — no buttons for them. */}
    </aside>
  );
}
