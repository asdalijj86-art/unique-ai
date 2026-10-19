/**
 * SettingsPanel — app settings: privacy, location, voice, gestures.
 * Toggles wired to chat.tsx state via props.
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
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

/**
 * VoiceSelector — lets the user pick from 3 voices:
 * 1. Charon — گہری مردانہ آواز (deep masculine, default)
 * 2. Fenrir — دوسری مردانہ آواز (second masculine voice)
 * 3. Google — free fallback آواز (no key needed)
 * Stored in localStorage; sent with TTS requests.
 */
function VoiceSelector() {
  const [voice, setVoice] = useState(() => {
    try { return localStorage.getItem('unique-ai-voice') || 'Charon'; }
    catch { return 'Charon'; }
  });

  const select = (v: string) => {
    setVoice(v);
    try { localStorage.setItem('unique-ai-voice', v); } catch { /* ignore */ }
  };

  const options = [
    { id: 'Charon', label: '🎙️ گہری آواز', desc: 'پہلی مردانہ آواز' },
    { id: 'Fenrir', label: '🎤 دوسری آواز', desc: 'دوسری مردانہ آواز' },
    { id: 'Google', label: '🔊 فری آواز', desc: 'بغیر key کے' },
  ];

  return (
    <div className="setting-row" dir="rtl" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
      <span className="setting-label">🎚️ آواز منتخب کریں</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => select(opt.id)}
            style={{
              background: voice === opt.id ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255,255,255,0.06)',
              border: voice === opt.id ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              padding: '6px 10px',
              color: 'inherit',
              fontSize: 13,
              cursor: 'pointer',
              textAlign: 'right',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>{opt.label}</span>
            <span style={{ fontSize: 11, opacity: 0.6 }}>{opt.desc}</span>
            {voice === opt.id && <span>✅</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * ApiKeySetting — lets the user save their own free Gemini API key
 * (from aistudio.google.com) for voice. Stored only in this browser's
 * localStorage; sent with TTS requests so their personal quota is used.
 */
function ApiKeySetting() {
  const [key, setKey] = useState(() => {
    try { return localStorage.getItem('unique-ai-gemini-key') || ''; }
    catch { return ''; }
  });
  const [saved, setSaved] = useState(() => {
    try { return !!localStorage.getItem('unique-ai-gemini-key'); }
    catch { return false; }
  });

  const save = () => {
    try {
      const trimmed = key.trim();
      if (trimmed) {
        localStorage.setItem('unique-ai-gemini-key', trimmed);
        setSaved(true);
      } else {
        localStorage.removeItem('unique-ai-gemini-key');
        setSaved(false);
      }
    } catch { /* ignore */ }
  };

  const clear = () => {
    try { localStorage.removeItem('unique-ai-gemini-key'); } catch { /* ignore */ }
    setKey('');
    setSaved(false);
  };

  return (
    <div className="setting-row" dir="rtl" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
      <span className="setting-label">🔑 اپنی Gemini Key (آواز کے لیے)</span>
      <input
        type="password"
        value={key}
        onChange={(e) => { setKey(e.target.value); setSaved(false); }}
        placeholder="aistudio.google.com سے free key"
        dir="ltr"
        style={{
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 8,
          padding: '6px 10px',
          color: 'inherit',
          fontSize: 13,
          width: '100%',
          boxSizing: 'border-box',
        }}
        aria-label="Gemini API key"
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={save}
          style={{
            background: 'rgba(255,255,255,0.12)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 8,
            padding: '4px 12px',
            color: 'inherit',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          {saved ? '✅ محفوظ ہے' : 'محفوظ کریں'}
        </button>
        {saved && (
          <button
            type="button"
            onClick={clear}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,100,100,0.3)',
              borderRadius: 8,
              padding: '4px 12px',
              color: 'inherit',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            ہٹائیں
          </button>
        )}
      </div>
      <span style={{ fontSize: 11, opacity: 0.6 }}>
        Free key: aistudio.google.com → Get API Key
      </span>
    </div>
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
      {open && createPortal(
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
          <ApiKeySetting />
          <VoiceSelector />
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
        </div>,
        document.body
      )}
    </div>
  );
}
