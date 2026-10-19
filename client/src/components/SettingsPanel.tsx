/**
 * SettingsPanel — app settings: privacy, location, voice, gestures.
 * Toggles wired to chat.tsx state via props.
 */
import { useState } from 'react';
import { Settings as SettingsIcon, X, MapPin, Mic, Hand, Volume2, Trash2 } from 'lucide-react';

export type AppSettings = {
  locationEnabled: boolean;
  voiceEnabled: boolean;
  continuousVoice: boolean;
  gesturesEnabled: boolean;
};

type SettingsPanelProps = {
  settings: AppSettings;
  onChange: (s: AppSettings) => void;
  onClearChat: () => void;
  onTestVoice?: () => void;
};

function Toggle({
  label,
  icon,
  value,
  onToggle,
}: {
  label: string;
  icon: React.ReactNode;
  value: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`setting-row${value ? ' on' : ''}`}
      onClick={onToggle}
      dir="rtl"
      aria-pressed={value}
    >
      <span className="setting-icon">{icon}</span>
      <span className="setting-label">{label}</span>
      <span className={`setting-switch${value ? ' on' : ''}`} aria-hidden="true">
        <i />
      </span>
    </button>
  );
}

export default function SettingsPanel({ settings, onChange, onClearChat, onTestVoice }: SettingsPanelProps) {
  const [open, setOpen] = useState(false);

  const toggle = (key: keyof AppSettings) =>
    onChange({ ...settings, [key]: !settings[key] });

  return (
    <div className="settings-wrap">
      <button
        type="button"
        className="settings-gear"
        onClick={() => setOpen(!open)}
        aria-label={open ? 'سیٹنگز بند کریں' : 'سیٹنگز کھولیں'}
        aria-expanded={open}
      >
        <SettingsIcon size={18} />
      </button>
      {open && (
        <div className="settings-dropdown" dir="rtl" role="dialog" aria-label="سیٹنگز">
          <div className="settings-head">
            <span>سیٹنگز</span>
            <button
              type="button"
              className="settings-close"
              onClick={() => setOpen(false)}
              aria-label="بند کریں"
            >
              <X size={16} />
            </button>
          </div>
          <div className="settings-group">پرائیویسی اور مقام</div>
          <Toggle
            label="مقام (میری جگہ)"
            icon={<MapPin size={16} />}
            value={settings.locationEnabled}
            onToggle={() => toggle('locationEnabled')}
          />
          <div className="settings-group">آواز</div>
          <Toggle
            label="آواز (بول کر جواب)"
            icon={<Volume2 size={16} />}
            value={settings.voiceEnabled}
            onToggle={() => toggle('voiceEnabled')}
          />
          <Toggle
            label="مسلسل آواز"
            icon={<Mic size={16} />}
            value={settings.continuousVoice}
            onToggle={() => toggle('continuousVoice')}
          />
          {onTestVoice && (
            <button
              type="button"
              className="setting-row"
              onClick={onTestVoice}
              dir="rtl"
              aria-label="آواز ٹیسٹ کریں"
            >
              <span className="setting-icon"><Volume2 size={16} /></span>
              <span className="setting-label">🔊 آواز ٹیسٹ کریں</span>
            </button>
          )}
          <div className="settings-group">کنٹرول</div>
          <Toggle
            label="ہاتھ کے اشارے"
            icon={<Hand size={16} />}
            value={settings.gesturesEnabled}
            onToggle={() => toggle('gesturesEnabled')}
          />
          <div className="settings-group">ڈیٹا</div>
          <button
            type="button"
            className="setting-row danger"
            onClick={() => {
              if (window.confirm('کیا واقعی چیٹ صاف کرنی ہے؟')) {
                onClearChat();
                setOpen(false);
              }
            }}
            dir="rtl"
          >
            <span className="setting-icon"><Trash2 size={16} /></span>
            <span className="setting-label">چیٹ صاف کریں</span>
          </button>
        </div>
      )}
    </div>
  );
}
