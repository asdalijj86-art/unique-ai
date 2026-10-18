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
import VideoUpload from './VideoUpload';

export type MediaToolName =
  | 'background_remover' | 'ocr' | 'upscaler' | 'pdf'
  | 'audio_to_text' | 'email' | 'resize' | 'video_creator' | 'video_upload'
  | 'password_gen' | 'emi_calc' | 'image_compress' | 'resume_builder' | 'invoice_gen';

const TOOL_TITLES: Record<MediaToolName, string> = {
  background_remover: '🖼️ بیک گراؤنڈ ہٹائیں',
  ocr: '📝 تصویر سے متن نکالیں',
  upscaler: '🔍 تصویر صاف کریں (HD)',
  pdf: '📄 پی ڈی ایف ٹولز',
  audio_to_text: '🎤 آڈیو سے متن',
  email: '✉️ ای میل لکھوائیں',
  resize: '📐 تصویر ری سائز کریں',
  video_upload: '🎬 ویڈیو اپلوڈ اور وائرل تیاری',
  password_gen: '🔐 پاس ورڈ بنائیں',
  emi_calc: '💰 قرض کی قسط نکالیں',
  image_compress: '🗜️ تصویر چھوٹی کریں',
  resume_builder: '📄 ریزیومے (CV) بنائیں',
  invoice_gen: '🧾 انوائس بنائیں',
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

// --- password generator ----------------------------------------------------------
function PasswordGenerator() {
  const [length, setLength] = useState(16);
  const [upper, setUpper] = useState(true);
  const [lower, setLower] = useState(true);
  const [digits, setDigits] = useState(true);
  const [symbols, setSymbols] = useState(true);
  const [password, setPassword] = useState('');
  const [copied, setCopied] = useState(false);

  function generate() {
    let chars = '';
    if (upper) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (lower) chars += 'abcdefghijklmnopqrstuvwxyz';
    if (digits) chars += '0123456789';
    if (symbols) chars += '!@#$%^&*()-_=+[]{}|;:,.<>?';
    if (!chars) return;
    const arr = new Uint32Array(length);
    crypto.getRandomValues(arr);
    let pwd = '';
    for (let i = 0; i < length; i++) pwd += chars[arr[i] % chars.length];
    setPassword(pwd);
    setCopied(false);
  }

  return (
    <div>
      <div className="tool-row">
        <label>لمبائی: {length}</label>
        <input type="range" min={8} max={64} value={length} onChange={(e) => setLength(Number(e.target.value))} dir="ltr" />
      </div>
      <div className="tool-row">
        <label><input type="checkbox" checked={upper} onChange={(e) => setUpper(e.target.checked)} /> A-Z</label>
        <label><input type="checkbox" checked={lower} onChange={(e) => setLower(e.target.checked)} /> a-z</label>
        <label><input type="checkbox" checked={digits} onChange={(e) => setDigits(e.target.checked)} /> 0-9</label>
        <label><input type="checkbox" checked={symbols} onChange={(e) => setSymbols(e.target.checked)} /> علامتیں</label>
      </div>
      <button type="button" className="tool-action-button" onClick={generate}>🔐 پاس ورڈ بنائیں</button>
      {password && (
        <div>
          <div className="tool-text-block" dir="ltr" data-testid="text-password" style={{ fontFamily: 'monospace', fontSize: 18 }}>{password}</div>
          <button type="button" className="tool-action-button" onClick={() => { navigator.clipboard?.writeText(password); setCopied(true); }}>
            {copied ? '✅ کاپی ہو گیا' : '📋 کاپی کریں'}
          </button>
        </div>
      )}
    </div>
  );
}

// --- EMI calculator ------------------------------------------------------------
function EmiCalculator() {
  const [principal, setPrincipal] = useState('500000');
  const [rate, setRate] = useState('12');
  const [years, setYears] = useState('5');
  const [result, setResult] = useState<{ emi: number; total: number; interest: number } | null>(null);

  function calculate() {
    const P = parseFloat(principal);
    const R = parseFloat(rate) / 1200;
    const N = parseFloat(years) * 12;
    if (!P || !R || !N || P <= 0 || N <= 0) return;
    const emi = R === 0 ? P / N : (P * R * Math.pow(1 + R, N)) / (Math.pow(1 + R, N) - 1);
    const total = emi * N;
    setResult({ emi: Math.round(emi), total: Math.round(total), interest: Math.round(total - P) });
  }

  return (
    <div>
      <div className="tool-row">
        <label>رقم (روپے): </label>
        <input type="number" value={principal} onChange={(e) => setPrincipal(e.target.value)} className="tool-input" dir="ltr" />
      </div>
      <div className="tool-row">
        <label>سود % سالانہ: </label>
        <input type="number" value={rate} onChange={(e) => setRate(e.target.value)} className="tool-input" dir="ltr" step="0.1" />
      </div>
      <div className="tool-row">
        <label>مدت (سال): </label>
        <input type="number" value={years} onChange={(e) => setYears(e.target.value)} className="tool-input" dir="ltr" />
      </div>
      <button type="button" className="tool-action-button" onClick={calculate}>💰 قسط نکالیں</button>
      {result && (
        <div className="tool-text-block" data-testid="text-emi-result">
          <div>📅 ماہانہ قسط: <b>{result.emi.toLocaleString()} روپے</b></div>
          <div>💵 کل ادائیگی: {result.total.toLocaleString()} روپے</div>
          <div>📈 کل سود: {result.interest.toLocaleString()} روپے</div>
        </div>
      )}
    </div>
  );
}

// --- image compressor ------------------------------------------------------------
function ImageCompressor() {
  const [src, setSrc] = useState<string | null>(null);
  const [origSize, setOrigSize] = useState(0);
  const [quality, setQuality] = useState(70);
  const [out, setOut] = useState<{ url: string; size: number } | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(f: File) {
    setSrc(URL.createObjectURL(f));
    setOrigSize(f.size);
    setOut(null);
  }

  async function compress() {
    if (!src) return;
    setBusy(true);
    try {
      const img = await loadImage(src);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode-failed'))), 'image/jpeg', quality / 100)
      );
      setOut({ url: URL.createObjectURL(blob), size: blob.size });
    } finally {
      setBusy(false);
    }
  }

  const kb = (n: number) => (n / 1024).toFixed(0) + ' KB';

  return (
    <div>
      <FilePicker accept="image/*" onFile={handleFile} label="📷 تصویر چنیں" />
      {src && (
        <div>
          <img src={src} alt="اصل" className="tool-preview-img" />
          <div className="tool-small-note">اصل سائز: {kb(origSize)}</div>
          <div className="tool-row">
            <label>کوالٹی: {quality}%</label>
            <input type="range" min={10} max={95} value={quality} onChange={(e) => setQuality(Number(e.target.value))} dir="ltr" />
            <button type="button" className="tool-action-button" onClick={compress} disabled={busy}>
              {busy ? 'ہو رہا ہے…' : '🗜️ چھوٹی کریں'}
            </button>
          </div>
        </div>
      )}
      {out && (
        <div>
          <img src={out.url} alt="چھوٹی شدہ" className="tool-preview-img" />
          <div className="tool-small-note">نیا سائز: {kb(out.size)} ({Math.round((1 - out.size / origSize) * 100)}% چھوٹی)</div>
          <button
            type="button"
            className="tool-action-button"
            onClick={async () => {
              const blob = await (await fetch(out.url)).blob();
              downloadBlob(blob, 'compressed.jpg');
            }}
          >
            ⬇️ ڈاؤن لوڈ کریں
          </button>
        </div>
      )}
    </div>
  );
}

// --- resume builder ----------------------------------------------------------------
function ResumeBuilder() {
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [phone, setPhone] = useState('');
  const [emailAddr, setEmailAddr] = useState('');
  const [address, setAddress] = useState('');
  const [summary, setSummary] = useState('');
  const [experience, setExperience] = useState('');
  const [education, setEducation] = useState('');
  const [skills, setSkills] = useState('');

  function buildHtml(): string {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');
    return `<!DOCTYPE html><html dir="auto"><head><meta charset="utf-8"><title>Resume - ${esc(name)}</title>
<style>body{font-family:Arial,sans-serif;max-width:700px;margin:40px auto;padding:0 20px;color:#222}
h1{margin:0;font-size:28px}h2{font-size:18px;color:#1a73e8;border-bottom:2px solid #1a73e8;padding-bottom:4px;margin-top:24px}
.sub{color:#555;margin-top:4px}.sec{margin-top:8px;line-height:1.6}</style></head><body>
<h1>${esc(name)}</h1><div class="sub">${esc(title)}</div>
<div class="sub">${esc(phone)} | ${esc(emailAddr)} | ${esc(address)}</div>
${summary ? `<h2>خلاصہ / Summary</h2><div class="sec">${esc(summary)}</div>` : ''}
${experience ? `<h2>تجربہ / Experience</h2><div class="sec">${esc(experience)}</div>` : ''}
${education ? `<h2>تعلیم / Education</h2><div class="sec">${esc(education)}</div>` : ''}
${skills ? `<h2>مہارتیں / Skills</h2><div class="sec">${esc(skills)}</div>` : ''}
</body></html>`;
  }

  function download() {
    if (!name.trim()) return;
    const blob = new Blob([buildHtml()], { type: 'text/html;charset=utf-8' });
    downloadBlob(blob, `resume-${name.trim().replace(/\s+/g, '-')}.html`);
  }

  const field = (label: string, value: string, set: (v: string) => void, textarea = false) => (
    <div className="tool-row">
      <label style={{ minWidth: 90 }}>{label}: </label>
      {textarea ? (
        <textarea value={value} onChange={(e) => set(e.target.value)} className="tool-textarea" dir="auto" rows={3} style={{ flex: 1 }} />
      ) : (
        <input value={value} onChange={(e) => set(e.target.value)} className="tool-input" dir="auto" style={{ flex: 1 }} />
      )}
    </div>
  );

  return (
    <div>
      {field('نام', name, setName)}
      {field('عہدہ', title, setTitle)}
      {field('فون', phone, setPhone)}
      {field('ای میل', emailAddr, setEmailAddr)}
      {field('پتہ', address, setAddress)}
      {field('خلاصہ', summary, setSummary, true)}
      {field('تجربہ', experience, setExperience, true)}
      {field('تعلیم', education, setEducation, true)}
      {field('مہارتیں', skills, setSkills, true)}
      <button type="button" className="tool-action-button" onClick={download} disabled={!name.trim()}>
        📄 ریزیومے ڈاؤن لوڈ کریں (HTML — پرنٹ کر کے PDF بنائیں)
      </button>
      <div className="tool-small-note">ٹپ: ڈاؤن لوڈ شدہ فائل کھولیں، Ctrl+P دبائیں اور "Save as PDF" چنیں۔</div>
    </div>
  );
}

// --- invoice generator ---------------------------------------------------------------
function InvoiceGenerator() {
  const [business, setBusiness] = useState('');
  const [clientName, setClientName] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('001');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState([{ desc: '', qty: '1', price: '' }]);

  function setItem(i: number, key: 'desc' | 'qty' | 'price', val: string) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, [key]: val } : it)));
  }

  function addItem() {
    setItems((prev) => [...prev, { desc: '', qty: '1', price: '' }]);
  }

  const total = items.reduce((s, it) => s + (parseFloat(it.qty) || 0) * (parseFloat(it.price) || 0), 0);

  function buildHtml(): string {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const rows = items
      .filter((it) => it.desc.trim())
      .map((it, i) => {
        const amt = (parseFloat(it.qty) || 0) * (parseFloat(it.price) || 0);
        return `<tr><td>${i + 1}</td><td>${esc(it.desc)}</td><td>${esc(it.qty)}</td><td>${Number(amt).toLocaleString()}</td></tr>`;
      })
      .join('');
    return `<!DOCTYPE html><html dir="auto"><head><meta charset="utf-8"><title>Invoice ${esc(invoiceNo)}</title>
<style>body{font-family:Arial,sans-serif;max-width:700px;margin:40px auto;padding:0 20px;color:#222}
h1{margin:0}table{width:100%;border-collapse:collapse;margin-top:20px}
th,td{border:1px solid #ccc;padding:8px;text-align:right}th{background:#f5f5f5}
.total{font-weight:bold;font-size:18px;margin-top:16px;text-align:left}</style></head><body>
<h1>🧾 انوائس #${esc(invoiceNo)}</h1>
<p><b>${esc(business)}</b><br>گاہک: ${esc(clientName)}<br>تاریخ: ${esc(date)}</p>
<table><tr><th>#</th><th>تفصیل</th><th>تعداد</th><th>رقم</th></tr>${rows}</table>
<div class="total">کل: ${total.toLocaleString()} روپے</div>
</body></html>`;
  }

  function download() {
    const blob = new Blob([buildHtml()], { type: 'text/html;charset=utf-8' });
    downloadBlob(blob, `invoice-${invoiceNo}.html`);
  }

  return (
    <div>
      <div className="tool-row">
        <label style={{ minWidth: 90 }}>کاروبار: </label>
        <input value={business} onChange={(e) => setBusiness(e.target.value)} className="tool-input" dir="auto" style={{ flex: 1 }} />
      </div>
      <div className="tool-row">
        <label style={{ minWidth: 90 }}>گاہک: </label>
        <input value={clientName} onChange={(e) => setClientName(e.target.value)} className="tool-input" dir="auto" style={{ flex: 1 }} />
      </div>
      <div className="tool-row">
        <label>انوائس نمبر: </label>
        <input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} className="tool-input" dir="ltr" style={{ width: 80 }} />
        <label>تاریخ: </label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="tool-input" dir="ltr" />
      </div>
      {items.map((it, i) => (
        <div className="tool-row" key={i}>
          <input value={it.desc} onChange={(e) => setItem(i, 'desc', e.target.value)} className="tool-input" dir="auto" placeholder="تفصیل" style={{ flex: 2 }} />
          <input value={it.qty} onChange={(e) => setItem(i, 'qty', e.target.value)} className="tool-input" dir="ltr" placeholder="تعداد" style={{ width: 70 }} />
          <input value={it.price} onChange={(e) => setItem(i, 'price', e.target.value)} className="tool-input" dir="ltr" placeholder="قیمت" style={{ width: 100 }} />
        </div>
      ))}
      <button type="button" className="tool-action-button" onClick={addItem}>➕ آئٹم شامل کریں</button>
      <div className="tool-text-block">کل: <b>{total.toLocaleString()} روپے</b></div>
      <button type="button" className="tool-action-button" onClick={download}>🧾 انوائس ڈاؤن لوڈ کریں</button>
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
        {tool === 'video_upload' && <VideoUpload />}
        {tool === 'password_gen' && <PasswordGenerator />}
        {tool === 'emi_calc' && <EmiCalculator />}
        {tool === 'image_compress' && <ImageCompressor />}
        {tool === 'resume_builder' && <ResumeBuilder />}
        {tool === 'invoice_gen' && <InvoiceGenerator />}
      </div>
    </div>
  );
}
