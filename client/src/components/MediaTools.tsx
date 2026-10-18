// MediaTools — client-side media/productivity tools, all in Urdu.
// - background_remover: @imgly/background-removal (in-browser)
// - ocr: tesseract.js (Urdu + English)
// - upscaler: canvas 2x/4x with sharpening
// - resize: canvas resize to chosen dimensions
// - pdf: pdf-lib — images → PDF, merge PDFs
// - audio_to_text: upload → /api/transcribe (Gemini)
// - email: form → /api/draft-email (Gemini)

import { useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

export type MediaToolName =
  | 'background_remover' | 'ocr' | 'upscaler' | 'pdf'
  | 'audio_to_text' | 'email' | 'resize' | 'video_creator';

const TOOL_TITLES: Record<MediaToolName, string> = {
  background_remover: '🖼️ بیک گراؤنڈ ہٹائیں',
  ocr: '📝 تصویر سے متن نکالیں',
  upscaler: '🔍 تصویر صاف کریں (HD)',
  pdf: '📄 پی ڈی ایف ٹولز',
  audio_to_text: '🎤 آڈیو سے متن',
  email: '✉️ ای میل لکھوائیں',
  resize: '📐 تصویر ری سائز کریں',
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

function FilePicker({ accept, onFile, label }: { accept: string; onFile: (f: File) => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <input
        ref={ref}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
      <button type="button" className="tool-action-button" onClick={() => ref.current?.click()}>
        {label}
      </button>
    </div>
  );
}

// --- background remover ----------------------------------------------------
function BackgroundRemover() {
  const [src, setSrc] = useState<string | null>(null);
  const [out, setOut] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleFile(f: File) {
    setError('');
    setOut(null);
    setSrc(URL.createObjectURL(f));
    setBusy(true);
    try {
      const { removeBackground } = await import('@imgly/background-removal');
      const blob = await removeBackground(f);
      setOut(URL.createObjectURL(blob));
    } catch {
      setError('بیک گراؤنڈ ہٹانے میں مسئلہ ہوا۔ دوبارہ کوشش کریں۔');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <FilePicker accept="image/*" onFile={handleFile} label="📷 تصویر چنیں" />
      {busy && <div className="tool-loading"><Loader2 size={18} className="spin" /> بیک گراؤنڈ ہٹایا جا رہا ہے…</div>}
      {error && <div className="tool-error">{error}</div>}
      {src && (
        <div className="tool-before-after">
          <div><div className="tool-label">پہلے</div><img src={src} alt="اصل" className="tool-preview-img" /></div>
          {out && <div><div className="tool-label">بعد میں</div><img src={out} alt="نتیجہ" className="tool-preview-img tool-checker" /></div>}
        </div>
      )}
      {out && (
        <button
          type="button"
          className="tool-action-button"
          onClick={async () => {
            const blob = await (await fetch(out)).blob();
            downloadBlob(blob, 'background-removed.png');
          }}
        >
          ⬇️ ڈاؤن لوڈ کریں
        </button>
      )}
    </div>
  );
}

// --- OCR -------------------------------------------------------------------
function OcrTool() {
  const [src, setSrc] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleFile(f: File) {
    setError('');
    setText('');
    setSrc(URL.createObjectURL(f));
    setBusy(true);
    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker(['urd', 'eng']);
      const { data } = await worker.recognize(f);
      await worker.terminate();
      setText(data.text.trim() || 'کوئی متن نہیں ملا۔');
    } catch {
      setError('متن نکالنے میں مسئلہ ہوا۔ دوبارہ کوشش کریں۔');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <FilePicker accept="image/*" onFile={handleFile} label="📷 تصویر چنیں" />
      {busy && <div className="tool-loading"><Loader2 size={18} className="spin" /> متن نکالا جا رہا ہے…</div>}
      {error && <div className="tool-error">{error}</div>}
      {src && <img src={src} alt="اصل" className="tool-preview-img" />}
      {text && (
        <div>
          <div className="tool-text-block" dir="auto" data-testid="text-ocr-result">{text}</div>
          <button type="button" className="tool-action-button" onClick={() => navigator.clipboard?.writeText(text)}>
            📋 کاپی کریں
          </button>
        </div>
      )}
    </div>
  );
}

// --- canvas helpers ----------------------------------------------------------
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode-failed'))), 'image/png');
  });
}

// --- upscaler ------------------------------------------------------------------
function Upscaler() {
  const [src, setSrc] = useState<string | null>(null);
  const [out, setOut] = useState<string | null>(null);
  const [scale, setScale] = useState(2);
  const [busy, setBusy] = useState(false);

  async function handleFile(f: File) {
    setSrc(URL.createObjectURL(f));
    setOut(null);
  }

  async function upscale() {
    if (!src) return;
    setBusy(true);
    try {
      const img = await loadImage(src);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth * scale;
      canvas.height = img.naturalHeight * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      // Mild sharpening via convolution.
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imageData.data;
      const copy = new Uint8ClampedArray(d);
      const w = canvas.width;
      const kernel = [0, -0.15, 0, -0.15, 1.6, -0.15, 0, -0.15, 0];
      for (let y = 1; y < canvas.height - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          for (let ch = 0; ch < 3; ch++) {
            let v = 0;
            for (let ky = -1; ky <= 1; ky++) {
              for (let kx = -1; kx <= 1; kx++) {
                v += copy[((y + ky) * w + (x + kx)) * 4 + ch] * kernel[(ky + 1) * 3 + (kx + 1)];
              }
            }
            d[(y * w + x) * 4 + ch] = v;
          }
        }
      }
      ctx.putImageData(imageData, 0, 0);
      const blob = await canvasToBlob(canvas);
      setOut(URL.createObjectURL(blob));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <FilePicker accept="image/*" onFile={handleFile} label="📷 تصویر چنیں" />
      {src && (
        <div>
          <img src={src} alt="اصل" className="tool-preview-img" />
          <div className="tool-row">
            <label>اسکیل: </label>
            <select value={scale} onChange={(e) => setScale(Number(e.target.value))} className="tool-select" dir="ltr">
              <option value={2}>2x</option>
              <option value={4}>4x</option>
            </select>
            <button type="button" className="tool-action-button" onClick={upscale} disabled={busy}>
              {busy ? 'ہو رہا ہے…' : '🔍 صاف کریں'}
            </button>
          </div>
        </div>
      )}
      {out && (
        <div>
          <img src={out} alt="صاف شدہ" className="tool-preview-img" />
          <button
            type="button"
            className="tool-action-button"
            onClick={async () => {
              const blob = await (await fetch(out)).blob();
              downloadBlob(blob, `upscaled-${scale}x.png`);
            }}
          >
            ⬇️ ڈاؤن لوڈ کریں
          </button>
        </div>
      )}
    </div>
  );
}

// --- resize ----------------------------------------------------------------------
function ResizeTool() {
  const [src, setSrc] = useState<string | null>(null);
  const [width, setWidth] = useState('800');
  const [busy, setBusy] = useState(false);

  async function resize() {
    if (!src) return;
    const w = parseInt(width, 10);
    if (!w || w <= 0 || w > 4000) return;
    setBusy(true);
    try {
      const img = await loadImage(src);
      const ratio = img.naturalHeight / img.naturalWidth;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = Math.round(w * ratio);
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await canvasToBlob(canvas);
      downloadBlob(blob, `resized-${w}px.png`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <FilePicker accept="image/*" onFile={(f) => setSrc(URL.createObjectURL(f))} label="📷 تصویر چنیں" />
      {src && (
        <div>
          <img src={src} alt="اصل" className="tool-preview-img" />
          <div className="tool-row">
            <label>چوڑائی (px): </label>
            <input
              type="number"
              value={width}
              onChange={(e) => setWidth(e.target.value)}
              className="tool-input"
              dir="ltr"
              min={1}
              max={4000}
            />
            <button type="button" className="tool-action-button" onClick={resize} disabled={busy}>
              {busy ? 'ہو رہا ہے…' : '📐 ری سائز + ڈاؤن لوڈ'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- PDF tools ---------------------------------------------------------------------
function PdfTools() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'images' | 'merge'>('images');
  const [files, setFiles] = useState<File[]>([]);

  async function imagesToPdf() {
    if (files.length === 0) return;
    setBusy(true);
    setError('');
    try {
      const { PDFDocument } = await import('pdf-lib');
      const pdf = await PDFDocument.create();
      for (const f of files) {
        const buf = await f.arrayBuffer();
        let img;
        if (f.type.includes('png')) img = await pdf.embedPng(buf);
        else img = await pdf.embedJpg(buf);
        const page = pdf.addPage([img.width, img.height]);
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
      }
      const bytes = await pdf.save();
      downloadBlob(new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' }), 'images.pdf');
      setFiles([]);
    } catch {
      setError('پی ڈی ایف بنانے میں مسئلہ ہوا۔');
    } finally {
      setBusy(false);
    }
  }

  async function mergePdfs() {
    if (files.length < 2) {
      setError('کم از کم 2 پی ڈی ایف فائلیں چنیں۔');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { PDFDocument } = await import('pdf-lib');
      const merged = await PDFDocument.create();
      for (const f of files) {
        const buf = await f.arrayBuffer();
        const pdf = await PDFDocument.load(buf);
        const pages = await merged.copyPages(pdf, pdf.getPageIndices());
        pages.forEach((p) => merged.addPage(p));
      }
      const bytes = await merged.save();
      downloadBlob(new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' }), 'merged.pdf');
      setFiles([]);
    } catch {
      setError('پی ڈی ایف ملانے میں مسئلہ ہوا۔');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="tool-row" style={{ marginBottom: 10 }}>
        <button
          type="button"
          className={`tool-action-button${mode === 'images' ? ' active' : ''}`}
          onClick={() => { setMode('images'); setFiles([]); setError(''); }}
        >
          🖼️ تصاویر → PDF
        </button>
        <button
          type="button"
          className={`tool-action-button${mode === 'merge' ? ' active' : ''}`}
          onClick={() => { setMode('merge'); setFiles([]); setError(''); }}
        >
          📄 PDFs ملائیں
        </button>
      </div>
      <input
        type="file"
        accept={mode === 'images' ? 'image/*' : 'application/pdf'}
        multiple
        onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
      />
      {files.length > 0 && <div className="tool-small-note">{files.length} فائلیں چنی گئیں</div>}
      {error && <div className="tool-error">{error}</div>}
      <div style={{ marginTop: 10 }}>
        <button
          type="button"
          className="tool-action-button"
          disabled={busy || files.length === 0}
          onClick={mode === 'images' ? imagesToPdf : mergePdfs}
        >
          {busy ? 'ہو رہا ہے…' : mode === 'images' ? '📄 PDF بنائیں + ڈاؤن لوڈ' : '📄 ملائیں + ڈاؤن لوڈ'}
        </button>
      </div>
    </div>
  );
}

// --- audio to text -------------------------------------------------------------------
function AudioToText() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [text, setText] = useState('');

  async function handleFile(f: File) {
    setBusy(true);
    setError('');
    setText('');
    try {
      const buf = await f.arrayBuffer();
      let binary = '';
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      }
      const base64 = btoa(binary);
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioBase64: base64, mimeType: f.type || 'audio/webm' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'failed');
      setText(data.text);
    } catch {
      setError('آڈیو تحریر میں نہیں بدلی جا سکی۔ دوبارہ کوشش کریں۔');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <FilePicker accept="audio/*" onFile={handleFile} label="🎤 آڈیو فائل چنیں" />
      {busy && <div className="tool-loading"><Loader2 size={18} className="spin" /> تحریر بنائی جا رہی ہے…</div>}
      {error && <div className="tool-error">{error}</div>}
      {text && (
        <div>
          <div className="tool-text-block" dir="auto" data-testid="text-transcription">{text}</div>
          <button type="button" className="tool-action-button" onClick={() => navigator.clipboard?.writeText(text)}>
            📋 کاپی کریں
          </button>
        </div>
      )}
    </div>
  );
}

// --- email helper ----------------------------------------------------------------------
function EmailHelper() {
  const [purpose, setPurpose] = useState('');
  const [tone, setTone] = useState('professional');
  const [language, setLanguage] = useState('ur');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');

  async function generate() {
    if (!purpose.trim()) return;
    setBusy(true);
    setError('');
    setDraft('');
    try {
      const res = await fetch('/api/draft-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purpose: purpose.trim(), tone, language }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'failed');
      setDraft(data.draft);
    } catch {
      setError('ای میل نہیں بن سکی۔ دوبارہ کوشش کریں۔');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="tool-label">ای میل کا مقصد لکھیں:</div>
      <textarea
        value={purpose}
        onChange={(e) => setPurpose(e.target.value)}
        className="tool-textarea"
        dir="auto"
        rows={3}
        placeholder="مثلاً: چھٹی کی درخواست، نوکری کے لیے اپلائی…"
      />
      <div className="tool-row">
        <label>لہجہ: </label>
        <select value={tone} onChange={(e) => setTone(e.target.value)} className="tool-select">
          <option value="professional">پروفیشنل</option>
          <option value="friendly">دوستانہ</option>
          <option value="formal">رسمی</option>
        </select>
        <label>زبان: </label>
        <select value={language} onChange={(e) => setLanguage(e.target.value)} className="tool-select">
          <option value="ur">اردو</option>
          <option value="roman">رومن اردو</option>
          <option value="en">English</option>
        </select>
        <button type="button" className="tool-action-button" onClick={generate} disabled={busy || !purpose.trim()}>
          {busy ? 'لکھ رہا ہوں…' : '✉️ ای میل بنائیں'}
        </button>
      </div>
      {error && <div className="tool-error">{error}</div>}
      {draft && (
        <div>
          <div className="tool-text-block" dir="auto" data-testid="text-email-draft" style={{ whiteSpace: 'pre-wrap' }}>
            {draft}
          </div>
          <button type="button" className="tool-action-button" onClick={() => navigator.clipboard?.writeText(draft)}>
            📋 کاپی کریں
          </button>
        </div>
      )}
    </div>
  );
}

// --- main -------------------------------------------------------------------------------
export default function MediaTools({ tool, onClose }: { tool: MediaToolName; onClose: () => void }) {
  return (
    <div className="tool-results" dir="rtl" data-testid="panel-media-tools" role="region" aria-label="میڈیا ٹولز">
      <div className="tool-results-head">
        <span className="tool-results-title">{TOOL_TITLES[tool]}</span>
        <button type="button" className="tool-results-close" onClick={onClose} aria-label="بند کریں">
          ✕
        </button>
      </div>
      <div className="tool-results-body">
        {tool === 'background_remover' && <BackgroundRemover />}
        {tool === 'ocr' && <OcrTool />}
        {tool === 'upscaler' && <Upscaler />}
        {tool === 'resize' && <ResizeTool />}
        {tool === 'pdf' && <PdfTools />}
        {tool === 'audio_to_text' && <AudioToText />}
        {tool === 'email' && <EmailHelper />}
      </div>
    </div>
  );
}
