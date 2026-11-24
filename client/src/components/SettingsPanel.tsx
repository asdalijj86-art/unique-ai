/**
 * SettingsPanel — the ONE settings button of the app (Phase سادگی).
 * Everything settings-like lives behind this single gear: chat
 * language, privacy/location, permissions warm-up (🔓 اجازتیں), voice
 * (reply voice, continuous voice, voice test, Gemini keys, voice
 * selection), gestures, device pairing (📱 ڈیوائس جوڑیں), the brain
 * backup (🧠 دماغ کا بیک اپ — Phase 4) and chat clearing. Toggles
 * wired to chat.tsx state via props.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Settings as SettingsIcon, X, MapPin, Mic, Hand, Volume2, Trash2, Smartphone } from 'lucide-react';
import { testGeminiKey } from '../lib/api';
import { changePassword, deleteOwnKey, getOwnKeyStatus, saveOwnKey } from '../lib/auth';
import { rekeyVault } from '../lib/secure-app-storage';
import { secureAppStorage } from '../lib/secure-app-storage';
import { describeDeviceVoices, pickUrduMaleVoiceFrom, pickUrduFemaleVoiceFrom } from '../lib/persona';
import PermissionsWarmup from './PermissionsWarmup';

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
  /** Chat reply language — moved here from the top bar (Phase سادگی). */
  chatLang: string;
  onChatLangChange: (v: string) => void;
  /** Opens the device-pairing panel (its entry lives here now). */
  onOpenPairing: () => void;
  /** Brain backup (Phase 4): download the brain file / open the
   *  restore picker (the pick stays the user's own tap). */
  onBackupDownload: () => void;
  onBackupRestore: () => void;
  /** Persona + tone (Phase 2): who is present, and the current لہجہ. */
  persona: 'unique' | 'uniqa';
  onPersonaChange: (p: 'unique' | 'uniqa') => void;
  tone: 'neutral' | 'serious' | 'romantic';
  onToneChange: (t: 'neutral' | 'serious' | 'romantic') => void;
  /** Awareness (Phase 1): speaks first — title-bar switch mirrors
   *  this same toggle. Optional: only chat.tsx wires it. */
  awarenessEnabled?: boolean;
  onAwarenessChange?: (enabled: boolean) => void;
  /** Test path: shows the thought bubble, then speaks the line. */
  onTestAwareness?: () => void;
};

const chipStyle = (active: boolean): React.CSSProperties => ({
  background: active ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255,255,255,0.06)',
  border: active ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid rgba(255,255,255,0.1)',
  borderRadius: 999,
  padding: '5px 12px',
  color: 'inherit',
  fontSize: 13,
  cursor: 'pointer',
});

/**
 * PersonaSelector (Phase 2) — who is "present": یونیکا (the default
 * assistant, with her own voice) or یونیک (the male assistant). He
 * speaks only when picked here OR summoned by name («یونیک کو بلاؤ»).
 * The tone chips set the لہجہ until changed — independent of persona.
 */
function PersonaSelector({ persona, onPersonaChange, tone, onToneChange }: {
  persona: 'unique' | 'uniqa';
  onPersonaChange: (p: 'unique' | 'uniqa') => void;
  tone: 'neutral' | 'serious' | 'romantic';
  onToneChange: (t: 'neutral' | 'serious' | 'romantic') => void;
}) {
  const PERSONAS: { v: 'unique' | 'uniqa'; t: string }[] = [
    { v: 'uniqa', t: '💛 یونیکا' },
    { v: 'unique', t: '🤖 یونیک' },
  ];
  const TONES: { v: 'neutral' | 'serious' | 'romantic'; t: string }[] = [
    { v: 'neutral', t: 'عام' },
    { v: 'serious', t: 'سنجیدہ' },
    { v: 'romantic', t: 'رومینٹک' },
  ];
  return (
    <div className="setting-row" dir="rtl" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
      <span className="setting-label">💛 کون حاضر ہے؟</span>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {PERSONAS.map((p) => (
          <button
            key={p.v}
            type="button"
            onClick={() => onPersonaChange(p.v)}
            aria-pressed={persona === p.v}
            data-testid={`button-persona-${p.v}`}
            style={chipStyle(persona === p.v)}
          >
            {p.t}
          </button>
        ))}
      </div>
      <span style={{ fontSize: 11, opacity: 0.6 }}>
        یونیک صرف بلانے پر آتا ہے — آواز سے «یونیک کو بلاؤ» یا یہاں سے چنیں۔
      </span>
      <span className="setting-label">🎭 لہجہ</span>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {TONES.map((t) => (
          <button
            key={t.v}
            type="button"
            onClick={() => onToneChange(t.v)}
            aria-pressed={tone === t.v}
            data-testid={`button-tone-${t.v}`}
            style={chipStyle(tone === t.v)}
          >
            {t.t}
          </button>
        ))}
      </div>
    </div>
  );
}

const CHAT_LANGS = [
  { v: 'auto', t: '🌐 Auto' },
  { v: 'ur', t: 'اردو' },
  { v: 'roman', t: 'Roman' },
  { v: 'en', t: 'English' },
  { v: 'ar', t: 'العربية' },
];

/** LanguageSelector — the chat-language chips, formerly the top bar. */
function LanguageSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="setting-row" dir="rtl" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
      <span className="setting-label">🗣️ گفتگو کی زبان</span>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {CHAT_LANGS.map((l) => (
          <button
            key={l.v}
            type="button"
            onClick={() => onChange(l.v)}
            aria-pressed={value === l.v}
            data-testid={`button-lang-${l.v}`}
            style={{
              background: value === l.v ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255,255,255,0.06)',
              border: value === l.v ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid rgba(255,255,255,0.1)',
              borderRadius: 999,
              padding: '5px 12px',
              color: 'inherit',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            {l.t}
          </button>
        ))}
      </div>
    </div>
  );
}

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
 * Stored per-account (secure-app-storage); sent with TTS requests.
 */
function VoiceSelector() {
  const [voice, setVoice] = useState(() => {
    try {
      const stored = secureAppStorage.getItem('unique-ai-voice');
      // A stale 'Google' selection (female, removed) shows as Salman.
      return stored === 'Google' ? 'Salman' : (stored || 'Salman');
    } catch { return 'Salman'; }
  });

  const select = (v: string) => {
    setVoice(v);
    try { secureAppStorage.setItem('unique-ai-voice', v); } catch { /* ignore */ }
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
 * DeviceVoiceDiagnostic — Settings-only, read-only (2026-10-27
 * night backup): lists this device's browser voices (name + lang)
 * and flags which, if any, pass the EXISTING strict pickers for
 * Unique (male) and Uniqa (female). Diagnostic only: it never
 * changes a picker, a selection, or any setting — it exists so
 * a Chromebook's browser-rescue failure can be seen, not guessed.
 * Voices load asynchronously in Chrome, so the list is refreshed
 * on tap (with one bounded voiceschanged wait) instead of being
 * read once at panel open.
 */
function DeviceVoiceDiagnostic() {
  const [voices, setVoices] = useState<{ name: string; lang: string }[] | null>(null);
  const [checking, setChecking] = useState(false);

  const check = async () => {
    if (!('speechSynthesis' in window)) { setVoices([]); return; }
    setChecking(true);
    const synth = window.speechSynthesis;
    let list = synth.getVoices();
    if (list.length === 0) {
      list = await new Promise<typeof list>((resolve) => {
        let settled = false;
        const go = () => {
          if (settled) return;
          settled = true;
          synth.removeEventListener('voiceschanged', go);
          resolve(synth.getVoices());
        };
        synth.addEventListener('voiceschanged', go);
        setTimeout(go, 1500);
      });
    }
    setVoices(list.map((v) => ({ name: v.name, lang: v.lang })));
    setChecking(false);
  };

  const described = voices ? describeDeviceVoices(voices) : [];
  const malePick = voices ? pickUrduMaleVoiceFrom(voices) : undefined;
  const femalePick = voices ? pickUrduFemaleVoiceFrom(voices) : undefined;

  return (
    <div className="setting-row" dir="rtl" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
      <span className="setting-label">🔍 اس ڈیوائس کی آوازیں (صرف جانچ)</span>
      <span style={{ fontSize: 11, opacity: 0.6 }}>
        یہ فہرست صرف دکھاتی ہے کہ اس لیپ ٹاپ/فون میں کون سی آوازیں ہیں اور کون سی یونیک یا یونیکا کے لیے منظور ہوتی ہیں۔ یہ کوئی آواز نہیں بدلتی۔
      </span>
      <button
        type="button"
        onClick={check}
        disabled={checking}
        data-testid="button-device-voices"
        style={{
          background: 'rgba(255,255,255,0.12)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 8,
          padding: '4px 12px',
          color: 'inherit',
          fontSize: 13,
          cursor: checking ? 'wait' : 'pointer',
          opacity: checking ? 0.6 : 1,
          alignSelf: 'flex-start',
        }}
      >
        {checking ? '⏳ چیک ہو رہی…' : 'آوازوں کی فہرست دکھائیں'}
      </button>
      {voices && (
        <div style={{ fontSize: 12, lineHeight: 1.8 }}>
          <div>یونیک کے لیے: {malePick ? malePick.name : 'کوئی منظور شدہ آواز نہیں'}</div>
          <div>یونیکا کے لیے: {femalePick ? femalePick.name : 'کوئی منظور شدہ آواز نہیں'}</div>
          {described.length === 0 && <div>اس ڈیوائس میں کوئی آواز نہیں ملی۔</div>}
          {described.map((v) => (
            <div key={`${v.name}-${v.lang}`}>
              {v.name} ({v.lang || '—'}) — {v.passesMale ? '✅ مردانہ ' : ''}{v.passesFemale ? '✅ زنانہ ' : ''}{!v.passesMale && !v.passesFemale ? '❌ کسی کے لیے منظور نہیں' : ''}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * ApiKeySetting — the user's OWN free Gemini API key (from
 * aistudio.google.com).
 *
 * SECURITY (2026-11-25): the key is NEVER stored in this browser.
 * It goes to the server once (POST /api/auth/key), where it is
 * AES-256-GCM encrypted at rest under this account only. The server
 * uses ONLY the logged-in account's key — a guest with no key gets
 * the honest no-key answer, never the owner's key. The UI shows only
 * the masked tail (…last4), never the full key.
 */
function ApiKeySetting() {
  const [key, setKey] = useState('');
  const [status, setStatus] = useState<{ hasKey: boolean; keyLast4: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    getOwnKeyStatus().then(setStatus).catch(() => { /* key status unavailable */ });
  }, []);

  const save = async () => {
    const trimmed = key.trim();
    if (!trimmed) { setMsg('پہلے key لکھیں۔'); return; }
    setBusy(true);
    setMsg('چیک ہو رہی ہے…');
    try {
      const test = await testGeminiKey(trimmed);
      if (!test.ok) {
        setMsg(
          test.errorType === 'quota' ? '⚠️ اس key کا کوٹہ ختم ہے — دوسری key لگائیں۔'
          : test.errorType === 'auth' ? '❌ یہ key غلط/نامکمل ہے۔'
          : '❓ key چیک نہ ہو سکی — نیٹ چیک کر کے دوبارہ کوشش کریں۔',
        );
        return;
      }
      const saved = await saveOwnKey(trimmed);
      setStatus({ hasKey: true, keyLast4: saved.keyLast4 });
      setKey('');
      setMsg('✅ آپ کی key خفیہ کر کے محفوظ ہو گئی — صرف آپ کی درخواستیں اسے استعمال کریں گی۔');
    } catch (e: any) {
      setMsg(e?.message || 'محفوظ نہیں ہو سکی۔');
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    try {
      await deleteOwnKey();
      setStatus({ hasKey: false, keyLast4: null });
      setMsg('key ہٹا دی گئی — اب AI جواب نہیں دے گا جب تک نئی key نہ لگائیں۔');
    } catch (e: any) {
      setMsg(e?.message || 'نہیں ہٹ سکی۔');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="setting-row" dir="rtl" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
      <span className="setting-label">🔑 اپنی Gemini Key (آواز + چیٹ کے لیے)</span>
      <span style={{ fontSize: 11, opacity: 0.6 }}>
        {status?.hasKey
          ? `محفوظ ہے — …${status.keyLast4} (مکمل key کبھی دکھائی نہیں دیتی)`
          : 'ابھی کوئی key محفوظ نہیں — key کے بغیر AI جواب نہیں دے گا۔'}
      </span>
      <input
        value={key}
        onChange={(e) => { setKey(e.target.value); }}
        placeholder="aistudio.google.com سے free key"
        dir="ltr"
        type="password"
        autoComplete="off"
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
          disabled={busy}
          style={{
            background: 'rgba(255,255,255,0.12)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 8,
            padding: '4px 12px',
            color: 'inherit',
            fontSize: 13,
            cursor: busy ? 'wait' : 'pointer',
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? '⏳ چیک ہو رہی…' : 'محفوظ کریں'}
        </button>
        {status?.hasKey && (
          <button
            type="button"
            onClick={clear}
            disabled={busy}
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
      {msg && (
        <span style={{ fontSize: 12, opacity: 0.9, whiteSpace: 'pre-line' }} dir="rtl">{msg}</span>
      )}
    </div>
  );
}

/**
 * PasswordSection — change MY OWN password. The vault is rekeyed
 * FIRST (memory re-encrypted with the new password); only then does
 * the server password change. If the rekey fails (wrong old password
 * / locked vault), NOTHING changes — fail closed, never orphan the
 * memory.
 */
function PasswordSection() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const change = async () => {
    if (next.length < 8) { setMsg('نیا پاسورڈ کم از کم 8 حرف کا ہو۔'); return; }
    if (next !== confirm) { setMsg('دونوں نئے پاسورڈ ایک جیسے نہیں ہیں۔'); return; }
    setBusy(true);
    setMsg('');
    try {
      const rekeyed = await rekeyVault(current, next);
      if (!rekeyed) {
        setMsg('پرانا پاسورڈ غلط ہے یا میموری بند ہے — پاسورڈ نہیں بدلا۔');
        return;
      }
      await changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      setMsg('✅ پاسورڈ بدل گیا — آپ کی خفیہ میموری اب نئے پاسورڈ سے کھلتی ہے۔');
    } catch (e: any) {
      setMsg(e?.message || 'پاسورڈ نہیں بدلا۔');
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 8,
    padding: '6px 10px',
    color: 'inherit',
    fontSize: 13,
    width: '100%',
    boxSizing: 'border-box' as const,
  };

  return (
    <div className="setting-row" dir="rtl" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
      <span className="setting-label">🔒 اپنا پاسورڈ بدلیں</span>
      <span style={{ fontSize: 11, opacity: 0.6 }}>پاسورڈ ہی آپ کی خفیہ میموری کی چابی ہے — بدلنے پر میموری بھی نئے پاسورڈ سے خفیہ ہو جائے گی۔</span>
      <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="پرانا پاسورڈ" autoComplete="current-password" style={inputStyle} />
      <input type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="نیا پاسورڈ (8+ حرف)" autoComplete="new-password" style={inputStyle} />
      <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="نیا پاسورڈ دوبارہ" autoComplete="new-password" style={inputStyle} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={change}
          disabled={busy}
          style={{
            background: 'rgba(255,255,255,0.12)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 8,
            padding: '4px 12px',
            color: 'inherit',
            fontSize: 13,
            cursor: busy ? 'wait' : 'pointer',
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? '…رک جائیں' : 'پاسورڈ بدلیں'}
        </button>
      </div>
      {msg && (
        <span style={{ fontSize: 12, opacity: 0.9, whiteSpace: 'pre-line' }} dir="rtl">{msg}</span>
      )}
    </div>
  );
}

export default function SettingsPanel({ settings, onChange, onClearChat, onTestVoice, chatLang, onChatLangChange, onOpenPairing, onBackupDownload, onBackupRestore, persona, onPersonaChange, tone, onToneChange, awarenessEnabled, onAwarenessChange, onTestAwareness }: SettingsPanelProps) {
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
          <div className="settings-group">زبان</div>
          <LanguageSelector value={chatLang} onChange={onChatLangChange} />
          <div className="settings-group">ساتھی</div>
          <PersonaSelector
            persona={persona}
            onPersonaChange={onPersonaChange}
            tone={tone}
            onToneChange={onToneChange}
          />
          <div className="settings-group">پرائیویسی اور مقام</div>
          <Toggle
            label="مقام (میری جگہ)"
            icon={<MapPin size={16} />}
            value={settings.locationEnabled}
            onToggle={() => toggle('locationEnabled')}
          />
          <div className="settings-group">اجازتیں</div>
          <PermissionsWarmup />
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
          {onAwarenessChange && (
            <>
              <div className="settings-group">✨ Awareness — پہلے بولنا</div>
              <Toggle
                label="Awareness (خود پہلے بولے)"
                icon={<span aria-hidden="true">✨</span>}
                value={awarenessEnabled ?? true}
                onToggle={() => onAwarenessChange(!(awarenessEnabled ?? true))}
              />
              <div className="setting-row" dir="rtl" style={{ cursor: 'default' }}>
                <span style={{ fontSize: 11.5, opacity: 0.65, lineHeight: 1.8 }}>
                  جب آپ کام میں مصروف ہوں، رات دیر ہو جائے، یا کافی دیر خاموشی ہو — تو یونیک خود پہلے بولے گا، اور بولنے سے پہلے
                  سوچ کا بلبلہ دکھائے گا۔ کیمرہ کبھی استعمال نہیں ہوتا — صرف کام، وقت اور خاموشی دیکھی جاتی ہے۔
                </span>
              </div>
              {onTestAwareness && (
                <button
                  type="button"
                  className="setting-row"
                  onClick={onTestAwareness}
                  dir="rtl"
                  aria-label="Awareness آزمائیں"
                  data-testid="button-awareness-test"
                >
                  <span className="setting-icon">💭</span>
                  <span className="setting-label">💭 Awareness آزمائیں — بلبلہ دکھائیں</span>
                </button>
              )}
            </>
          )}
          <ApiKeySetting />
          <PasswordSection />
          <VoiceSelector />
          <DeviceVoiceDiagnostic />
          <div className="settings-group">کنٹرول</div>
          <Toggle
            label="ہاتھ کے اشارے"
            icon={<Hand size={16} />}
            value={settings.gesturesEnabled}
            onToggle={() => toggle('gesturesEnabled')}
          />
          <div className="settings-group">ڈیوائس</div>
          <button
            type="button"
            className="setting-row"
            onClick={() => { setOpen(false); onOpenPairing(); }}
            dir="rtl"
            aria-label="ڈیوائس جوڑیں"
            data-testid="button-open-pairing"
          >
            <span className="setting-icon"><Smartphone size={16} /></span>
            <span className="setting-label">📱 ڈیوائس جوڑیں — فون ⇄ لیپ ٹاپ</span>
          </button>
          <div className="settings-group">🧠 دماغ کا بیک اپ</div>
          <button
            type="button"
            className="setting-row"
            onClick={() => { onBackupDownload(); }}
            dir="rtl"
            aria-label="بیک اپ ڈاؤن لوڈ کریں"
            data-testid="button-backup-download"
          >
            <span className="setting-icon">⬇️</span>
            <span className="setting-label">بیک اپ ڈاؤن لوڈ کریں — ایک فائل، USB کے لیے</span>
          </button>
          <button
            type="button"
            className="setting-row"
            onClick={() => { setOpen(false); onBackupRestore(); }}
            dir="rtl"
            aria-label="بیک اپ واپس لائیں"
            data-testid="button-backup-restore"
          >
            <span className="setting-icon">⬆️</span>
            <span className="setting-label">بیک اپ واپس لائیں — فائل سے دماغ زندہ کریں</span>
          </button>
          <div className="setting-row" dir="rtl" style={{ cursor: 'default' }}>
            <span style={{ fontSize: 11.5, opacity: 0.65, lineHeight: 1.8 }}>
              بیک اپ میں گفتگوئیں، یادیں، سیٹنگز اور شخصیت — سب شامل ہے۔ مگر آپ کی <strong>API keys شامل نہیں</strong> ہوتیں
              (حفاظت کی خاطر) — بحالی کے بعد وہ ایک بار دوبارہ ڈالنی ہوں گی۔
            </span>
          </div>
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
