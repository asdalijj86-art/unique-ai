/**
 * SettingsPanel — the ONE settings place of the app (FRONT-SIMPLE,
 * 2026-11-25): everything lives here as ROWS. Each row shows that
 * tool's PICTURE/icon, its name written beside it («یہ اس چیز کی
 * سیٹنگ ہے»), and its setting control in the same line (change it
 * or not). Tap a row to open its controls in place — nothing is
 * scattered in panels any more. Toggles, keys, voice, camera,
 * pairing, backup, player, news, support, world monitor, hub —
 * all of it is one list of rows.
 *
 * Rendered directly inside the SETTING node dialog (chat.tsx) —
 * no gear button, no dropdown. The camera row's MediaLinkCard has
 * NO video element: the camera video stays mounted (invisible) in
 * the main layout so Uniqa's look keeps working while Settings is
 * closed. His picture never shows on screen — the preview rule.
 */
import { useEffect, useState } from 'react';
import { MapPin, Mic, Hand, Volume2, Trash2, Smartphone } from 'lucide-react';
import { testGeminiKey } from '../lib/api';
import { changePassword, deleteOwnKey, getOwnKeyStatus, saveOwnKey } from '../lib/auth';
import { rekeyVault } from '../lib/secure-app-storage';
import { secureAppStorage } from '../lib/secure-app-storage';
import { describeDeviceVoices, pickUrduMaleVoiceFrom, pickUrduFemaleVoiceFrom } from '../lib/persona';
import PermissionsWarmup from './PermissionsWarmup';
import { MediaLinkCard, HeadlinesCard, SupportButton, type CameraCardStatus } from './FrontExtras';
import type { SystemStatus } from './StatusPanel';

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
  /** Chat reply language. */
  chatLang: string;
  onChatLangChange: (v: string) => void;
  /** Opens the device-pairing panel. */
  onOpenPairing: () => void;
  /** Brain backup: download the brain file / open the restore picker. */
  onBackupDownload: () => void;
  onBackupRestore: () => void;
  /** Persona + tone: who is present, and the current لہجہ. */
  persona: 'unique' | 'uniqa';
  onPersonaChange: (p: 'unique' | 'uniqa') => void;
  tone: 'neutral' | 'serious' | 'romantic';
  onToneChange: (t: 'neutral' | 'serious' | 'romantic') => void;
  /** Awareness: speaks first — the top-bar switch mirrors this. */
  awarenessEnabled?: boolean;
  onAwarenessChange?: (enabled: boolean) => void;
  /** Test path: shows the thought bubble, then speaks the line. */
  onTestAwareness?: () => void;
  /** Live system status (one summary row on top). */
  status?: SystemStatus;
  /** Theme — moved here from the top bar (FRONT-SIMPLE). */
  theme?: string;
  onThemeChange?: (v: string) => void;
  /** Camera permission + live look (the row's switch + card). */
  cameraPermission?: boolean;
  onCameraPermissionChange?: (v: boolean) => void;
  cameraStatus?: CameraCardStatus;
  cameraStatusMessage?: string;
  micLive?: boolean;
  lastCameraNote?: string | null;
  onStopCameraLook?: () => void;
  /** WhatsApp support number (the row's card). */
  supportNumber?: string;
  onSaveSupportNumber?: (n: string) => void;
  /** Tools that come forward (Settings closes first, in chat.tsx). */
  onOpenPlayer?: () => void;
  onOpenHub?: () => void;
  onOpenWorldMonitor?: () => void;
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

// ---------------------------------------------------------------------------
// SettingRow — one row: [picture] [name + «یہ ... کی سیٹنگ ہے»]
// [control in the same line]. Tap the name to open its controls
// in place (accordion); toggles and actions work from the row.
// ---------------------------------------------------------------------------

function SettingRow({
  icon,
  name,
  hint,
  control,
  children,
  onNamesClick,
  testId,
}: {
  icon: React.ReactNode;
  name: string;
  hint: string;
  control?: React.ReactNode;
  children?: React.ReactNode;
  onNamesClick?: () => void;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const expandable = children !== undefined && children !== null;
  const handleNames = () => {
    if (expandable) setOpen((v) => !v);
    else if (onNamesClick) onNamesClick();
  };
  return (
    <div className="usetting-row" dir="rtl" data-testid={testId}>
      <div className="usetting-row-head">
        <span className="usetting-row-icon" aria-hidden="true">{icon}</span>
        <button
          type="button"
          className="usetting-row-names"
          onClick={handleNames}
          aria-expanded={expandable ? open : undefined}
        >
          <span className="usetting-row-name">{name}</span>
          <span className="usetting-row-hint">{hint}</span>
        </button>
        <span className="usetting-row-control">
          {control ?? (expandable ? (
            <span className="usetting-row-chev" aria-hidden="true">{open ? '▾' : '▸'}</span>
          ) : null)}
        </span>
      </div>
      {expandable && open && <div className="usetting-row-body">{children}</div>}
    </div>
  );
}

function RowToggle({
  icon,
  name,
  hint,
  value,
  onToggle,
  testId,
}: {
  icon: React.ReactNode;
  name: string;
  hint: string;
  value: boolean;
  onToggle: () => void;
  testId?: string;
}) {
  return (
    <SettingRow
      icon={icon}
      name={name}
      hint={hint}
      testId={testId}
      onNamesClick={onToggle}
      control={(
        <button
          type="button"
          className={`setting-switch${value ? ' on' : ''}`}
          onClick={onToggle}
          aria-pressed={value}
          aria-label={name}
        >
          <i />
        </button>
      )}
    />
  );
}

function RowAction({
  icon,
  name,
  hint,
  actionLabel,
  onAction,
  danger,
  testId,
}: {
  icon: React.ReactNode;
  name: string;
  hint: string;
  actionLabel: string;
  onAction: () => void;
  danger?: boolean;
  testId?: string;
}) {
  return (
    <SettingRow
      icon={icon}
      name={name}
      hint={hint}
      testId={testId}
      onNamesClick={onAction}
      control={(
        <button
          type="button"
          className={`usetting-row-open${danger ? ' danger' : ''}`}
          onClick={onAction}
        >
          {actionLabel}
        </button>
      )}
    />
  );
}

/**
 * PersonaSelector — who is "present": یونیکا (the default
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
    <div dir="rtl" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
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
    <div dir="rtl" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
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

const THEMES = [
  { v: 'unique', t: 'Unique' },
  { v: 'midnight', t: 'آدھی رات' },
  { v: 'emerald', t: 'زمرد' },
  { v: 'rose', t: 'گلابی' },
];

/** ThemeSelector — the colour theme, formerly the top bar. */
function ThemeSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div dir="rtl" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {THEMES.map((t) => (
        <button
          key={t.v}
          type="button"
          onClick={() => onChange(t.v)}
          aria-pressed={value === t.v}
          data-testid={`button-theme-${t.v}`}
          style={chipStyle(value === t.v)}
        >
          {t.t}
        </button>
      ))}
    </div>
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
    <div dir="rtl" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
    <div dir="rtl" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
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
    <div dir="rtl" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
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
    <div dir="rtl" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
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

export default function SettingsPanel({ settings, onChange, onClearChat, onTestVoice, chatLang, onChatLangChange, onOpenPairing, onBackupDownload, onBackupRestore, persona, onPersonaChange, tone, onToneChange, awarenessEnabled, onAwarenessChange, onTestAwareness, status, theme, onThemeChange, cameraPermission, onCameraPermissionChange, cameraStatus, cameraStatusMessage, micLive, lastCameraNote, onStopCameraLook, supportNumber, onSaveSupportNumber, onOpenPlayer, onOpenHub, onOpenWorldMonitor }: SettingsPanelProps) {
  const toggle = (key: keyof AppSettings) =>
    onChange({ ...settings, [key]: !settings[key] });

  const cameraLive = cameraStatus === 'looking' || cameraStatus === 'starting';
  const statusLine = status
    ? `آواز ${status.speaking ? 'چل رہی ہے' : status.thinking ? 'سوچ رہا ہے' : 'تیار'} · مائیک ${status.micActive ? 'آن' : 'بند'} · مسلسل آواز ${status.continuousVoice ? 'آن' : 'بند'} · اشارے ${status.gesturesOn ? 'آن' : 'بند'} · ایجنٹ ٹیم تیار`
    : 'سب سسٹم فعال ہیں';

  return (
    <div className="usettings" dir="rtl">
      {/* One-line system status — the old status rows, in one line. */}
      <div className="usetting-row" dir="rtl">
        <div className="usetting-row-head">
          <span className="usetting-row-icon" aria-hidden="true">🟢</span>
          <span className="usetting-row-names" style={{ cursor: 'default' }}>
            <span className="usetting-row-name">سسٹم کی حالت</span>
            <span className="usetting-row-hint">{statusLine}</span>
          </span>
        </div>
      </div>

      <SettingRow icon={<span aria-hidden="true">🗣️</span>} name="گفتگو کی زبان" hint="یہ گفتگو کی زبان کی سیٹنگ ہے" testId="setting-row-language">
        <LanguageSelector value={chatLang} onChange={onChatLangChange} />
      </SettingRow>

      <SettingRow icon={<span aria-hidden="true">💛</span>} name="کون حاضر ہے؟" hint="یہ ساتھی اور لہجے کی سیٹنگ ہے" testId="setting-row-persona">
        <PersonaSelector
          persona={persona}
          onPersonaChange={onPersonaChange}
          tone={tone}
          onToneChange={onToneChange}
        />
      </SettingRow>

      <SettingRow icon={<span aria-hidden="true">🎨</span>} name="تھیم" hint="یہ رنگ کی سیٹنگ ہے" testId="setting-row-theme">
        <ThemeSelector value={theme ?? 'unique'} onChange={(v) => onThemeChange?.(v)} />
      </SettingRow>

      {onAwarenessChange && (
        <SettingRow
          icon={<span aria-hidden="true">✨</span>}
          name="Awareness — خود پہلے بولے"
          hint="یہ خود پہلے بولنے کی سیٹنگ ہے"
          testId="setting-row-awareness"
          control={(
            <button
              type="button"
              className={`setting-switch${awarenessEnabled ? ' on' : ''}`}
              onClick={() => onAwarenessChange(!(awarenessEnabled ?? true))}
              aria-pressed={awarenessEnabled ?? true}
              aria-label="Awareness"
            >
              <i />
            </button>
          )}
        >
          <div dir="rtl" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11.5, opacity: 0.65, lineHeight: 1.8 }}>
              جب آپ کام میں مصروف ہوں، رات دیر ہو جائے، یا کافی دیر خاموشی ہو — تو یونیک خود پہلے بولے گا، اور بولنے سے پہلے
              سوچ کا بلبلہ دکھائے گا۔ کیمرہ کبھی استعمال نہیں ہوتا — صرف کام، وقت اور خاموشی دیکھی جاتی ہے۔
            </span>
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
          </div>
        </SettingRow>
      )}

      <SettingRow
        icon={<span aria-hidden="true">📷</span>}
        name="کیمرہ"
        hint={cameraLive ? 'یہ کیمرے کی سیٹنگ ہے — کیمرہ لائیو ہے، یونیکا دیکھ رہی ہے' : cameraPermission ? 'یہ کیمرے کی اجازت کی سیٹنگ ہے — اجازت آن ہے' : 'یہ کیمرے کی اجازت کی سیٹنگ ہے — اجازت بند ہے'}
        testId="setting-row-camera"
        control={(
          <button
            type="button"
            className={`setting-switch${cameraPermission ? ' on' : ''}`}
            onClick={() => onCameraPermissionChange?.(!(cameraPermission ?? false))}
            aria-pressed={cameraPermission ?? false}
            aria-label="کیمرہ اجازت"
          >
            <i />
          </button>
        )}
      >
        <MediaLinkCard
          micLive={micLive ?? false}
          cameraStatus={cameraStatus ?? 'idle'}
          cameraStatusMessage={cameraStatusMessage ?? ''}
          cameraPermission={cameraPermission ?? false}
          onToggleCameraPermission={() => onCameraPermissionChange?.(!(cameraPermission ?? false))}
          lastCameraNote={lastCameraNote ?? null}
          onStopCameraLook={() => onStopCameraLook?.()}
        />
      </SettingRow>

      <RowToggle
        icon={<Volume2 size={16} />}
        name="آواز"
        hint="یہ بول کر جواب دینے کی سیٹنگ ہے"
        value={settings.voiceEnabled}
        onToggle={() => toggle('voiceEnabled')}
        testId="setting-row-voice"
      />
      <RowToggle
        icon={<Mic size={16} />}
        name="مسلسل آواز"
        hint="یہ مسلسل سننے کی سیٹنگ ہے"
        value={settings.continuousVoice}
        onToggle={() => toggle('continuousVoice')}
        testId="setting-row-continuous-voice"
      />

      {onTestVoice && (
        <RowAction
          icon={<Volume2 size={16} />}
          name="آواز ٹیسٹ کریں"
          hint="یہ آواز سننے کی سیٹنگ ہے"
          actionLabel="سنو"
          onAction={onTestVoice}
          testId="setting-row-test-voice"
        />
      )}

      <SettingRow icon={<span aria-hidden="true">🎚️</span>} name="آواز منتخب کریں" hint="یہ آواز چننے کی سیٹنگ ہے" testId="setting-row-voice-select">
        <VoiceSelector />
      </SettingRow>

      <SettingRow icon={<span aria-hidden="true">🔍</span>} name="اس ڈیوائس کی آوازیں" hint="یہ ڈیوائس کی آوازیں جانچنے کی سیٹنگ ہے" testId="setting-row-device-voices">
        <DeviceVoiceDiagnostic />
      </SettingRow>

      <RowToggle
        icon={<MapPin size={16} />}
        name="مقام (میری جگہ)"
        hint="یہ مقام کی سیٹنگ ہے"
        value={settings.locationEnabled}
        onToggle={() => toggle('locationEnabled')}
        testId="setting-row-location"
      />

      <SettingRow icon={<span aria-hidden="true">🔓</span>} name="اجازتیں" hint="یہ اجازتوں کی سیٹنگ ہے" testId="setting-row-permissions">
        <PermissionsWarmup />
      </SettingRow>

      <RowToggle
        icon={<Hand size={16} />}
        name="ہاتھ کے اشارے"
        hint="یہ ہاتھ کے اشاروں کی سیٹنگ ہے"
        value={settings.gesturesEnabled}
        onToggle={() => toggle('gesturesEnabled')}
        testId="setting-row-gestures"
      />

      <RowAction
        icon={<Smartphone size={16} />}
        name="ڈیوائس جوڑیں"
        hint="یہ فون جوڑنے کی سیٹنگ ہے"
        actionLabel="جوڑیں"
        onAction={() => { onOpenPairing(); }}
        testId="setting-row-pairing"
      />

      <RowAction
        icon={<span aria-hidden="true">⬇️</span>}
        name="بیک اپ ڈاؤن لوڈ کریں"
        hint="یہ دماغ کا بیک اپ محفوظ کرنے کی سیٹنگ ہے"
        actionLabel="ڈاؤن لوڈ"
        onAction={onBackupDownload}
        testId="setting-row-backup-download"
      />
      <RowAction
        icon={<span aria-hidden="true">⬆️</span>}
        name="بیک اپ واپس لائیں"
        hint="یہ بیک اپ واپس لانے کی سیٹنگ ہے"
        actionLabel="واپس لائیں"
        onAction={onBackupRestore}
        testId="setting-row-backup-restore"
      />

      {onOpenPlayer && (
        <RowAction
          icon={<span aria-hidden="true">🎵</span>}
          name="Unique Player"
          hint="یہ موسیقی چلانے کا ٹول ہے"
          actionLabel="کھولیں"
          onAction={onOpenPlayer}
          testId="setting-row-player"
        />
      )}

      <SettingRow icon={<span aria-hidden="true">📰</span>} name="خبریں" hint="یہ خبروں کا ٹول ہے" testId="setting-row-news">
        <HeadlinesCard />
      </SettingRow>

      <SettingRow icon={<span aria-hidden="true">💬</span>} name="WhatsApp سپورٹ" hint="یہ WhatsApp سپورٹ کا ٹول ہے" testId="setting-row-support">
        <SupportButton supportNumber={supportNumber ?? ''} onSaveNumber={(n) => onSaveSupportNumber?.(n)} />
      </SettingRow>

      {onOpenWorldMonitor && (
        <RowAction
          icon={<span aria-hidden="true">🗺️</span>}
          name="ورلڈ مانیٹر"
          hint="یہ دنیا دیکھنے کا ٹول ہے"
          actionLabel="کھولیں"
          onAction={onOpenWorldMonitor}
          testId="setting-row-world-monitor"
        />
      )}

      {onOpenHub && (
        <RowAction
          icon={<span aria-hidden="true">🎨</span>}
          name="بصری مرکز"
          hint="یہ ڈرائنگ دیکھنے کا ٹول ہے"
          actionLabel="کھولیں"
          onAction={onOpenHub}
          testId="setting-row-hub"
        />
      )}

      <SettingRow icon={<span aria-hidden="true">🔑</span>} name="اپنی Gemini Key" hint="یہ آپ کی Gemini Key کی سیٹنگ ہے" testId="setting-row-api-key">
        <ApiKeySetting />
      </SettingRow>

      <SettingRow icon={<span aria-hidden="true">🔒</span>} name="اپنا پاسورڈ بدلیں" hint="یہ آپ کا پاسورڈ بدلنے کی سیٹنگ ہے" testId="setting-row-password">
        <PasswordSection />
      </SettingRow>

      <RowAction
        icon={<Trash2 size={16} />}
        name="چیٹ صاف کریں"
        hint="یہ چیٹ صاف کرنے کی سیٹنگ ہے"
        actionLabel="صاف کریں"
        danger
        onAction={() => {
          if (window.confirm('کیا واقعی چیٹ صاف کرنی ہے؟')) {
            onClearChat();
          }
        }}
        testId="setting-row-clear-chat"
      />
    </div>
  );
}
