// VideoCreator — viral-optimized video package generator.
// User describes their idea → AI returns 100% ready-to-upload package:
// hook-first script, viral title, description, auto-hashtags,
// thumbnail texts, trending sound suggestions, upload tip.
// All UI in Urdu. Nothing left to do manually.

import { useState } from 'react';
import { Loader2, X } from 'lucide-react';

type VideoPackage = {
  title: string;
  description: string;
  hashtags: string[];
  thumbnailTexts: string[];
  trendingSounds: string[];
  script: string;
  uploadTip: string;
};

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

export default function VideoCreator({ onClose }: { onClose: () => void }) {
  const [idea, setIdea] = useState('');
  const [platform, setPlatform] = useState<'youtube' | 'facebook' | 'both'>('both');
  const [language, setLanguage] = useState<'ur' | 'roman' | 'en'>('ur');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pkg, setPkg] = useState<VideoPackage | null>(null);

  async function generate() {
    if (!idea.trim()) return;
    setBusy(true);
    setError('');
    setPkg(null);
    try {
      const res = await fetch('/api/create-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea: idea.trim(), platform, language }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'failed');
      setPkg(data);
    } catch {
      setError('ویڈیو پیکج نہیں بن سکا۔ دوبارہ کوشش کریں۔');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tool-results" dir="rtl" data-testid="panel-video-creator" role="region" aria-label="ویڈیو بنانے والا">
      <div className="tool-results-head">
        <span className="tool-results-title">🎬 وائرل ویڈیو پیکج بنائیں</span>
        <button type="button" className="tool-results-close" onClick={onClose} aria-label="بند کریں">
          <X size={16} />
        </button>
      </div>
      <div className="tool-results-body">
        {!pkg && (
          <div>
            <div className="tool-label">اپنے ویڈیو کا آئیڈیا لکھیں:</div>
            <textarea
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              className="tool-textarea"
              dir="auto"
              rows={3}
              placeholder="مثلاً: عدیل کی بریانی چوری پکڑی گئی، زویا ناراض…"
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
                disabled={busy || !idea.trim()}
              >
                {busy ? <><Loader2 size={15} className="spin" /> بن رہا ہے…</> : '🚀 وائرل پیکج بنائیں'}
              </button>
            </div>
            {error && <div className="tool-error">{error}</div>}
          </div>
        )}

        {pkg && (
          <div>
            <Section title="🎯 وائرل ٹائٹل" copyText={pkg.title}>
              <div className="tool-text-block" dir="auto" data-testid="text-video-title">{pkg.title}</div>
            </Section>

            <Section title="🖼️ تھمب نیل ٹیکسٹ" copyText={pkg.thumbnailTexts.join('\n')}>
              <div className="vc-thumb-list">
                {pkg.thumbnailTexts.map((t, i) => (
                  <div key={i} className="vc-thumb-item" dir="auto">{t}</div>
                ))}
              </div>
            </Section>

            <Section title="📜 اسکرپٹ (ہک + ڈائیلاگ + CTA)" copyText={pkg.script}>
              <div className="tool-text-block" dir="auto" data-testid="text-video-script" style={{ whiteSpace: 'pre-wrap' }}>
                {pkg.script}
              </div>
            </Section>

            <Section title="📝 ڈسکرپشن" copyText={pkg.description}>
              <div className="tool-text-block" dir="auto" style={{ whiteSpace: 'pre-wrap' }}>
                {pkg.description}
              </div>
            </Section>

            <Section title="#️⃣ آٹو ہیش ٹیگز" copyText={pkg.hashtags.join(' ')}>
              <div className="vc-hashtags" dir="ltr" data-testid="text-video-hashtags">
                {pkg.hashtags.map((h, i) => (
                  <span key={i} className="vc-hashtag">{h}</span>
                ))}
              </div>
            </Section>

            {pkg.trendingSounds.length > 0 && (
              <Section title="🎵 ٹرینڈنگ ساؤنڈ تجاویز">
                <ul className="vc-sound-list">
                  {pkg.trendingSounds.map((s, i) => (
                    <li key={i} dir="auto">{s}</li>
                  ))}
                </ul>
              </Section>
            )}

            {pkg.uploadTip && (
              <div className="tool-small-note" style={{ textAlign: 'right', marginTop: 10 }}>
                ⏰ {pkg.uploadTip}
              </div>
            )}

            <div style={{ marginTop: 12 }}>
              <button type="button" className="tool-action-button" onClick={() => setPkg(null)}>
                ↩️ نیا پیکج بنائیں
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
