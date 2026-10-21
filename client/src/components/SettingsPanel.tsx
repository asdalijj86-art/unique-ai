/**
 * SettingsPanel — app settings: privacy, location, voice, gestures.
 * Toggles wired to chat.tsx state via props.
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Settings as SettingsIcon, X, MapPin, Mic, Hand, Volume2, Trash2 } from 'lucide-react';
import { testGeminiKey, parseGeminiKeys } from '../lib/api';

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
 * 1. Salman — سلمان (Edge TTS, PRIMARY default: free, no key, no daily
 *    quota — works day and night)
 * 2. Charon — گہری مردانہ آواز (deep masculine, Gemini)
 * 3. Fenrir — دوسری مردانہ آواز (second masculine voice, Gemini)
 * (Google female voice REMOVED per user demand 2026-10-19 — no female voice.)
 * Stored in localStorage; sent with TTS requests.
 */
function VoiceSelector() {
  const [voice, setVoice] = useState(() => {
    try {
      const stored = localStorage.getItem('unique-ai-voice');
      // A stale 'Google' selection (female, removed) shows as Salman.
      return stored === 'Google' ? 'Salman' : (stored || 'Salman');
    } catch { return 'Salman'; }
  });

  const select = (v: string) => {
    setVoice(v);
    try { localStorage.setItem('unique-ai-voice', v); } catch { /* ignore */ }
  };

  const options = [
    { id: 'Salman', label: '🎙️ سلمان — بنیادی آواز (ہر وقت دستیاب)', desc: 'مفت — نہ key، نہ کوٹہ' },
    { id: 'Charon', label: '🎙️ گہری آواز', desc: 'پہلی مردانہ آواز' },
    { id: 'Fenrir', label: '🎤 دوسری آواز', desc: 'دوسری مردانہ آواز' },
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
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState('');

  const save = async () => {
    try {
      const trimmed = key.trim();
      if (!trimmed) {
        localStorage.removeItem('unique-ai-gemini-key');
        setSaved(false);
        setTestMsg('');
        return;
      }
      // User may paste SEVERAL keys (one per line) — validate each, keep all.
      // The app rotates between them when one's quota runs out.
      // parseGeminiKeys also repairs keys that got line-wrapped while copying.
      const keys = parseGeminiKeys(trimmed);
      if (!keys.length) {
        setTestMsg('❌ درست key نہیں ملی۔');
        return;
      }
      setTesting(true);
      setTestMsg(`${keys.length} keys چیک ہو رہی ہیں…`);
      // Test all keys IN PARALLEL — sequential testing made the user wait
      // out each key's full round-trip (up to ~12s apiece) one by one.
      // Result labels and their Key 1/2/3 order are unchanged.
      const results = await Promise.all(keys.map((k) => testGeminiKey(k).catch(() => null)));
      let okCount = 0;
      let firstOkIdx = -1;
      const perKey: string[] = [];
      results.forEach((result, i) => {
        if (result?.ok) {
          okCount++;
          if (firstOkIdx < 0) firstOkIdx = i;
          perKey.push(`Key ${i + 1}: ✅ ٹھیک`);
        } else if (result?.errorType === 'quota') {
          perKey.push(`Key ${i + 1}: ⚠️ کوٹہ ختم`);
        } else if (result?.errorType === 'auth') {
          perKey.push(`Key ${i + 1}: ❌ غلط/نامکمل`);
        } else {
          perKey.push(`Key ${i + 1}: ❓ چیک نہ ہو سکی`);
        }
      });
      setTesting(false);
      localStorage.setItem('unique-ai-gemini-key', keys.join('\n'));
      // Start rotation at the first key that actually WORKED in the test
      // above — not blindly at Key 1, which may be quota-dead and would
      // otherwise be retried first on every single reply.
      localStorage.setItem('unique-ai-gemini-key-index', String(firstOkIdx >= 0 ? firstOkIdx : 0));
      setKey(keys.join('\n'));
      setSaved(true);
      setTestMsg(
        (okCount > 0
          ? `✅ ${keys.length} keys محفوظ — ${okCount} کام کر رہی ہیں۔ ایک ختم ہو تو app خود دوسری پر چلی جائے گی۔`
          : '⚠️ Keys محفوظ ہیں مگر ابھی کوئی کام نہیں کر رہی۔')
        + '\n' + perKey.join(' | ')
      );
    } catch { setTesting(false); }
  };

  const clear = () => {
    try {
      localStorage.removeItem('unique-ai-gemini-key');
      localStorage.removeItem('unique-ai-gemini-key-index');
    } catch { /* ignore */ }
    setKey('');
    setSaved(false);
  };

  return (
    <div className="setting-row" dir="rtl" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
      <span className="setting-label">🔑 اپنی Gemini Keys (آواز کے لیے)</span>
      <span style={{ fontSize: 11, opacity: 0.6 }}>ایک یا زیادہ keys — ہر نئی line میں ایک key۔ ایک ختم ہو تو app خود دوسری پر چلی جائے گی۔</span>
      <textarea
        value={key}
        onChange={(e) => { setKey(e.target.value); setSaved(false); }}
        placeholder={"aistudio.google.com سے free keys\nایک line میں ایک key"}
        dir="ltr"
        rows={3}
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
        aria-label="Gemini API keys"
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={save}
          disabled={testing}
          style={{
            background: 'rgba(255,255,255,0.12)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 8,
            padding: '4px 12px',
            color: 'inherit',
            fontSize: 13,
            cursor: testing ? 'wait' : 'pointer',
            opacity: testing ? 0.6 : 1,
          }}
        >
          {testing ? '⏳ چیک ہو رہی…' : saved ? '✅ محفوظ ہے' : 'محفوظ کریں'}
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
      {testMsg && (
        <span style={{ fontSize: 12, opacity: 0.9, whiteSpace: 'pre-line' }} dir="rtl">{testMsg}</span>
      )}
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
