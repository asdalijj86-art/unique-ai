// VideoUpload — گیلری سے ویڈیو اپلوڈ کریں، وائرل پیکج بنوائیں، اپلوڈ کے لیے تیار کریں۔
// Flow: file pick → preview + info → trim timestamps → plan/idea → /api/create-video
// → viral package (title/description/hashtags/thumbnails/script) + download + Urdu upload guide.
// NOTE: اصل اپلوڈ YouTube/Facebook ایپ میں صارف خود کرے گا (OAuth اس ورژن میں شامل نہیں)۔
// تمام UI اردو میں۔

import { useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

type VideoPackage = {
  title: string;
  description: string;
  hashtags: string[];
  thumbnailTexts: string[];
  trendingSounds: string[];
  script: string;
  uploadTip: string;
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="tool-action-button tool-copy-btn"
      onClick={() => {
        navigator.clipboard?.writeText(text).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? '✓ کاپی ہو گیا' : '📋 کاپی'}
    </button>
  );
}

function Section({ title, children, copyText }: { title: string; children: React.ReactNode; copyText?: string }) {
  return (
    <div className="vc-section">
      <div className="vc-section-head">
        <span className="vc-section-title">{title}</span>
        {copyText && <CopyButton text={copyText} />}
      </div>
      <div className="vc-section-body">{children}</div>
    </div>
  );
}

function fmtDuration(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '—';
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function VideoUpload() {
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [resolution, setResolution] = useState('');
  const [start, setStart] = useState('0');
  const [end, setEnd] = useState('');
  const [idea, setIdea] = useState('');
  const [platform, setPlatform] = useState<'youtube' | 'facebook' | 'both'>('both');
  const [language, setLanguage] = useState<'ur' | 'roman' | 'en'>('ur');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pkg, setPkg] = useState<VideoPackage | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(f: File) {
    setError('');
    setPkg(null);
    if (url) URL.revokeObjectURL(url);
    const objUrl = URL.createObjectURL(f);
    setFileName(f.name);
    setFileSize(f.size);
    setUrl(objUrl);
    setDuration(0);
    setResolution('');
    setStart('0');
    setEnd('');
  }

  function onMeta() {
    const v = videoRef.current;
    if (!v) return;
    const d = v.duration;
    setDuration(d);
    setResolution(`${v.videoWidth}×${v.videoHeight}`);
    setEnd(String(Math.floor(d)));
  }

  function previewTrim() {
    const v = videoRef.current;
    if (!v) return;
    const s = Math.max(0, parseFloat(start) || 0);
    const e = parseFloat(end);
    const endAt = isFinite(e) && e > s ? e : v.duration;
    v.currentTime = s;
    v.play().catch(() => {});
    const stopAt = () => {
      if (v.currentTime >= endAt) {
        v.pause();
        v.removeEventListener('timeupdate', stopAt);
      }
    };
    v.addEventListener('timeupdate', stopAt);
  }

  async function generate() {
    if (!idea.trim()) {
      setError('پہلے اپنے ویڈیو کا پلان/آئیڈیا لکھیں۔');
      return;
    }
    setBusy(true);
    setError('');
    setPkg(null);
    try {
      const trimNote = (() => {
        const s = parseFloat(start) || 0;
        const e = parseFloat(end);
        if (isFinite(e) && e > s) return ` (ویڈیو کا حصہ ${fmtDuration(s)} سے ${fmtDuration(e)} تک استعمال کریں)`;
        return '';
      })();
      const res = await fetch('/api/create-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea: idea.trim() + trimNote, platform, language }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'failed');
      setPkg(data);
    } catch {
      setError('وائرل پیکج نہیں بن سکا۔ دوبارہ کوشش کریں۔');
    } finally {
      setBusy(false);
    }
  }

  function downloadPackage() {
    if (!pkg) return;
    const lines = [
      '🎬 وائرل ویڈیو پیکج — Unique AI',
      `ویڈیو: ${fileName || '—'}`,
      '',
      '🎯 ٹائٹل:',
      pkg.title,
      '',
      '📄 ڈسکرپشن:',
      pkg.description,
      '',
      '#️⃣ ہیش ٹیگز:',
      pkg.hashtags.join(' '),
      '',
      '🖼️ تھمب نیل ٹیکسٹ:',
      ...pkg.thumbnailTexts.map((t) => `- ${t}`),
      '',
      '🎵 ٹرینڈنگ ساؤنڈز:',
      ...pkg.trendingSounds.map((t) => `- ${t}`),
      '',
      '📝 اسکرپٹ:',
      pkg.script,
      '',
      '💡 اپلوڈ ٹپ:',
      pkg.uploadTip,
    ];
    downloadBlob(new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }), 'viral-video-package.txt');
  }

  const fullPackageText = pkg
    ? `ٹائٹل:\n${pkg.title}\n\nڈسکرپشن:\n${pkg.description}\n\nہیش ٹیگز:\n${pkg.hashtags.join(' ')}`
    : '';

  return (
    <div>
      {/* step 1: upload */}
      <div className="tool-label">۱۔ اپنی گیلری سے ویڈیو منتخب کریں:</div>
      <input
        ref={fileRef}
        type="file"
        accept="video/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = '';
        }}
      />
      <button type="button" className="tool-action-button" onClick={() => fileRef.current?.click()}>
        📁 ویڈیو اپلوڈ کریں
      </button>

      {url && (
        <div style={{ marginTop: 12 }}>
          <video
            ref={videoRef}
            src={url}
            controls
            playsInline
            onLoadedMetadata={onMeta}
            style={{ width: '100%', maxHeight: 260, borderRadius: 10, background: '#000' }}
          />
          <div className="tool-text-block" dir="rtl" style={{ marginTop: 8 }}>
            📹 {fileName} — ⏱️ {fmtDuration(duration)} — 💾 {fmtSize(fileSize)}
            {resolution && ` — 📐 ${resolution}`}
          </div>

          {/* trim */}
          <div className="tool-label" style={{ marginTop: 10 }}>۲۔ تراش (اختیاری — شروع/اختتام سیکنڈ میں):</div>
          <div className="tool-row">
            <label>شروع: </label>
            <input
              type="number"
              min={0}
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="tool-select"
              style={{ width: 80 }}
            />
            <label>اختتام: </label>
            <input
              type="number"
              min={0}
              value={end}
              placeholder={duration ? String(Math.floor(duration)) : ''}
              onChange={(e) => setEnd(e.target.value)}
              className="tool-select"
              style={{ width: 80 }}
            />
            <button type="button" className="tool-action-button" onClick={previewTrim}>
              ▶️ تراشہ دیکھیں
            </button>
          </div>

          {/* format guide */}
          <div className="tool-label" style={{ marginTop: 10 }}>۳۔ فارمیٹ گائیڈ (وائرل ہونے کے لیے):</div>
          <div className="tool-text-block" dir="rtl">
            <b>📱 یوٹیوب شارٹس:</b> عمودی 9:16، 60 سیکنڈ سے کم، ٹائٹل/ڈسکرپشن میں #Shorts
            <br />
            <b>📘 فیس بک ریلز:</b> عمودی 9:16، 90 سیکنڈ تک، ریلز والے ہیش ٹیگز
            <br />
            💡 پہلے 3 سیکنڈ میں زوردار ہک رکھیں — یہی وائرل کرتا ہے!
          </div>

          {/* plan */}
          <div className="tool-label" style={{ marginTop: 10 }}>۴۔ اپنا پلان بتائیں (ویڈیو کس بارے میں ہے):</div>
          <textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            className="tool-textarea"
            dir="auto"
            rows={3}
            placeholder="مثلاً: میری بلی کی شرارتیں، آخر میں حیران کن موڑ…"
          />
          <div className="tool-row">
            <label>پلیٹ فارم: </label>
            <select value={platform} onChange={(e) => setPlatform(e.target.value as typeof platform)} className="tool-select">
              <option value="both">یوٹیوب + فیس بک</option>
              <option value="youtube">یوٹیوب شارٹس</option>
              <option value="facebook">فیس بک ریلز</option>
            </select>
            <label>زبان: </label>
            <select value={language} onChange={(e) => setLanguage(e.target.value as typeof language)} className="tool-select">
              <option value="ur">اردو</option>
              <option value="roman">رومن اردو</option>
              <option value="en">English</option>
            </select>
            <button
              type="button"
              className="tool-action-button"
              onClick={generate}
              disabled={busy}
            >
              {busy ? <><Loader2 size={15} className="spin" /> بن رہا ہے…</> : '🚀 وائرل پیکج بنائیں'}
            </button>
          </div>
        </div>
      )}

      {error && <div className="tool-error">{error}</div>}

      {pkg && (
        <div style={{ marginTop: 14 }}>
          <Section title="🎯 وائرل ٹائٹل" copyText={pkg.title}>
            <div className="tool-text-block" dir="auto">{pkg.title}</div>
          </Section>
          <Section title="📄 ڈسکرپشن" copyText={pkg.description}>
            <div className="tool-text-block" dir="auto" style={{ whiteSpace: 'pre-wrap' }}>{pkg.description}</div>
          </Section>
          <Section title="#️⃣ ہیش ٹیگز" copyText={pkg.hashtags.join(' ')}>
            <div className="tool-text-block" dir="auto">{pkg.hashtags.join(' ')}</div>
          </Section>
          <Section title="🖼️ تھمب نیل ٹیکسٹ" copyText={pkg.thumbnailTexts.join('\n')}>
            <div className="tool-text-block" dir="auto">
              {pkg.thumbnailTexts.map((t, i) => <div key={i}>• {t}</div>)}
            </div>
          </Section>
          <Section title="🎵 ٹرینڈنگ ساؤنڈز">
            <div className="tool-text-block" dir="auto">
              {pkg.trendingSounds.map((t, i) => <div key={i}>• {t}</div>)}
            </div>
          </Section>
          <Section title="📝 اسکرپٹ" copyText={pkg.script}>
            <div className="tool-text-block" dir="auto" style={{ whiteSpace: 'pre-wrap' }}>{pkg.script}</div>
          </Section>
          <Section title="💡 اپلوڈ ٹپ">
            <div className="tool-text-block" dir="auto">{pkg.uploadTip}</div>
          </Section>

          <div className="tool-row" style={{ marginTop: 8 }}>
            <CopyButton text={fullPackageText} />
            <button type="button" className="tool-action-button" onClick={downloadPackage}>
              ⬇️ پیکج ڈاؤن لوڈ کریں (.txt)
            </button>
          </div>

          {/* upload steps */}
          <div className="tool-label" style={{ marginTop: 12 }}>۵۔ اب اپلوڈ کریں — مرحلہ وار:</div>
          <div className="tool-text-block" dir="rtl">
            ۱۔ اوپر سے ٹائٹل، ڈسکرپشن اور ہیش ٹیگز کاپی کریں 📋
            <br />
            ۲۔ YouTube یا Facebook ایپ کھولیں
            <br />
            ۳۔ اپنی ویڈیو اپلوڈ کریں ⬆️
            <br />
            ۴۔ ٹائٹل اور ڈسکرپشن وہاں paste کریں
            <br />
            ۵۔ شائع کریں — تیار! 🎉
          </div>
          <div className="tool-text-block" dir="rtl" style={{ marginTop: 8, opacity: 0.85 }}>
            ℹ️ نوٹ: یہ تیار پیکج ہے — اصل اپلوڈ آپ YouTube/Facebook ایپ میں خود کریں گے۔
          </div>
        </div>
      )}
    </div>
  );
}
