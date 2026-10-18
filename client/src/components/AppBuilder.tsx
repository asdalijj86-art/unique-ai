// AppBuilder — shows the "building" UI while Gemini generates a PWA
// (installable "Android app"), then a phone-frame preview + install guide
// in Urdu + download buttons for index.html / manifest.json / sw.js.

import { useEffect, useState } from 'react';
import { Download, Loader2, Smartphone, X } from 'lucide-react';

type Props = {
  description: string;
  onClose: () => void;
};

const BUILD_STEPS = [
  'ایپ کا ڈیزائن سوچ رہا ہوں…',
  'موبائل اسکرین ترتیب دے رہا ہوں…',
  'بٹن اور مینیو بنا رہا ہوں…',
  'انسٹال فائلیں تیار کر رہا ہوں…',
  'آخری جانچ کر رہا ہوں…',
];

type BuildAppResult = {
  html: string;
  manifest: Record<string, unknown>;
  serviceWorker: string;
  appName: string;
};

async function buildApp({ description }: { description: string }): Promise<BuildAppResult> {
  const res = await fetch('/api/build-app', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw { data: errData };
  }
  return res.json() as Promise<BuildAppResult>;
}

export default function AppBuilder({ description, onClose }: Props) {
  const [result, setResult] = useState<BuildAppResult | null>(null);
  const [error, setError] = useState('');
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setInterval(() => {
      setStepIndex((i) => Math.min(i + 1, BUILD_STEPS.length - 1));
    }, 2600);
    buildApp({ description })
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch((err) => {
        if (cancelled) return;
        const message =
          err && typeof err === 'object' && 'data' in err &&
          (err as { data?: { error?: string } }).data?.error
            ? (err as { data: { error: string } }).data.error
            : 'ایپ بنانے میں مسئلہ ہوا۔ دوبارہ کوشش کریں۔';
        setError(message);
      })
      .finally(() => window.clearInterval(timer));
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [description]);

  function downloadFile(name: string, content: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  return (
    <section className="project-builder" dir="rtl" data-testid="section-app-builder" aria-label="ایپ بنانے والا">
      <header className="project-builder-head">
        <div>
          <div className="project-builder-title">
            <Smartphone size={16} style={{ display: 'inline', verticalAlign: '-2px', marginLeft: 6 }} />
            موبائل ایپ تیار ہو رہی ہے
          </div>
          <div className="project-builder-desc" dir="auto">{description}</div>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="بند کریں" data-testid="button-close-app-builder">
          <X size={17} />
        </button>
      </header>

      {!result && !error && (
        <div className="project-builder-progress">
          <Loader2 size={22} className="spin" />
          <div data-testid="text-app-build-step">{BUILD_STEPS[stepIndex]}</div>
        </div>
      )}

      {error && <div className="project-builder-error" data-testid="text-app-build-error">{error}</div>}

      {result && (
        <div className="app-builder-done">
          <div className="app-builder-phone">
            <iframe
              title="ایپ کا پیش نظارہ"
              srcDoc={result.html}
              className="app-builder-frame"
              data-testid="iframe-app-preview"
            />
          </div>
          <div className="app-builder-side">
            <div className="app-builder-install-title">📲 اینڈرائیڈ پر انسٹال کریں</div>
            <ol className="app-builder-install-steps">
              <li>نیچے <strong>index.html ڈاؤن لوڈ</strong> کریں (تینوں فائلیں ایک فولڈر میں رکھیں)</li>
              <li>فولڈر کو کسی مفت ہوسٹنگ پر اپ لوڈ کریں (مثلاً GitHub Pages یا Netlify)</li>
              <li>موبائل میں Chrome سے وہ لنک کھولیں</li>
              <li>Chrome مینیو (⋮) → <strong>Add to Home Screen</strong> دبائیں</li>
              <li>اب یہ ایپ کی طرح چلے گی — آف لائن بھی!</li>
            </ol>
            <div className="app-builder-downloads">
              <button
                type="button"
                className="tool-action-button"
                onClick={() => downloadFile('index.html', result.html, 'text/html;charset=utf-8')}
              >
                <Download size={15} /> index.html
              </button>
              <button
                type="button"
                className="tool-action-button"
                onClick={() => downloadFile('manifest.json', JSON.stringify(result.manifest, null, 2), 'application/json')}
              >
                <Download size={15} /> manifest.json
              </button>
              <button
                type="button"
                className="tool-action-button"
                onClick={() => downloadFile('sw.js', result.serviceWorker, 'text/javascript')}
              >
                <Download size={15} /> sw.js
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
