// ProjectBuilder — shows the "building" UI while Gemini generates a
// complete single-file website, then an iframe preview + download.

import { useEffect, useState } from 'react';
import { Download, ExternalLink, Loader2, X } from 'lucide-react';
import { buildProject } from '@/lib/api';

type Props = {
  description: string;
  onClose: () => void;
};

const BUILD_STEPS = [
  'ڈیزائن سوچ رہا ہوں…',
  'رنگ اور انداز چن رہا ہوں…',
  'مواد لکھ رہا ہوں…',
  'کوڈ جوڑ رہا ہوں…',
  'آخری جانچ کر رہا ہوں…',
];

export default function ProjectBuilder({ description, onClose }: Props) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setInterval(() => {
      setStepIndex((i) => Math.min(i + 1, BUILD_STEPS.length - 1));
    }, 2600);
    buildProject({ description })
      .then((result) => {
        if (!cancelled) setHtml(result.html);
      })
      .catch((err) => {
        if (cancelled) return;
        const message =
          err && typeof err === 'object' && 'data' in err &&
          (err as { data?: { error?: string } }).data?.error
            ? (err as { data: { error: string } }).data.error
            : 'ویب سائٹ بنانے میں مسئلہ ہوا۔ دوبارہ کوشش کریں۔';
        setError(message);
      })
      .finally(() => window.clearInterval(timer));
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [description]);

  function download() {
    if (!html) return;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'unique-ai-website.html';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function openInNewTab() {
    if (!html) return;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    window.open(URL.createObjectURL(blob), '_blank', 'noopener,noreferrer');
  }

  return (
    <section className="project-builder" dir="rtl" data-testid="section-project-builder" aria-label="ویب سائٹ بنانے والا">
      <header className="project-builder-head">
        <div>
          <div className="project-builder-title">ویب سائٹ تیار ہو رہی ہے</div>
          <div className="project-builder-desc" dir="auto">{description}</div>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="بند کریں" data-testid="button-close-builder">
          <X size={17} />
        </button>
      </header>

      {!html && !error && (
        <div className="project-builder-building" data-testid="status-building">
          <Loader2 size={26} className="spin" />
          <div className="project-builder-step" data-testid="text-build-step">{BUILD_STEPS[stepIndex]}</div>
          <div className="project-builder-progress" aria-hidden="true">
            <i style={{ width: `${((stepIndex + 1) / BUILD_STEPS.length) * 100}%` }} />
          </div>
        </div>
      )}

      {error && (
        <div className="error-banner" role="alert" data-testid="status-build-error">
          <span dir="auto">{error}</span>
          <button onClick={() => setError('')} data-testid="button-dismiss-build-error">بند کریں</button>
        </div>
      )}

      {html && (
        <div className="project-builder-done">
          <div className="project-builder-actions">
            <button className="builder-button primary" onClick={download} data-testid="button-download-site">
              <Download size={15} /> <span>ڈاؤن لوڈ کریں</span>
            </button>
            <button className="builder-button" onClick={openInNewTab} data-testid="button-open-site">
              <ExternalLink size={15} /> <span>نئے ٹیب میں کھولیں</span>
            </button>
          </div>
          <iframe
            title="بنائی گئی ویب سائٹ کا پیش نظارہ"
            className="project-builder-preview"
            srcDoc={html}
            sandbox="allow-scripts"
            data-testid="iframe-site-preview"
          />
        </div>
      )}
    </section>
  );
}
