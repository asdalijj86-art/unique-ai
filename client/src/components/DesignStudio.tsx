// DesignStudio — NEW tool, user order 2026-10-31 ~00:42-00:43.
// ONE single tool only: inside it, BOTH a CV and an Assignment are
// prepared, with beautiful modern digital designs, and a complete PDF
// download. No separate CV tool, no separate assignment tool, no
// Canva clone, no Canva API — this is Unique AI's OWN in-app design
// studio. The user tells their plan/details once, Unique fills the
// template itself, and the PDF comes out ready, with no clicks inside
// any external design editor.
//
// PDF: reuses lib/doc-pdf (html2canvas + pdf-lib, client-side), the
// same proven path that shapes Urdu correctly. No server, no key.

import { useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { downloadDocumentPdf, saveLastDocument } from '../lib/doc-pdf';

export type DesignKind = 'cv' | 'assignment';

/** Voice/text order detection, mirroring lib/video-maker.ts. */
export function isDesignStudioOrder(text: string): DesignKind | null {
  const t = String(text || '');
  const hasMake = /(بناؤ|بنا|بنائیں|banao|bana|make|create|design|ڈیزائن|تیار کرو|تیار کریں)/i.test(t);
  if (!hasMake) return null;
  if (/(cv|سی وی|resume|ریزیومے|ریزیوم)/i.test(t)) return 'cv';
  if (/(assignment|اسائنمنٹ|اسائمنٹ|homework|ہوم ورک)/i.test(t)) return 'assignment';
  if (/(design studio|ڈیزائن اسٹوڈیو|ڈیزائن ٹول)/i.test(t)) return 'cv';
  return null;
}

function esc(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function paraHtml(text: string): string {
  return String(text || '')
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p)}</p>`)
    .join('');
}

const TEMPLATES = [
  { id: 0, name: 'ماڈرن بلیو', header: '#0f2a5c', accent: '#2563eb', pill: '#e8efff' },
  { id: 1, name: 'وائلٹ ایلیگنٹ', header: '#4c1d95', accent: '#7c3aed', pill: '#f0e9ff' },
  { id: 2, name: 'ڈارک پریمیم', header: '#111827', accent: '#b45309', pill: '#fef3c7' },
] as const;

function buildHtml(
  kind: DesignKind,
  template: number,
  cv: { name: string; title: string; email: string; phone: string; skills: string; experience: string; education: string },
  asg: { title: string; subject: string; name: string; className: string; content: string },
): string {
  const tpl = TEMPLATES[template] ?? TEMPLATES[0];
  const skills = cv.skills.split(/[,،\n]/).map((s) => s.trim()).filter(Boolean);
  const today = new Date().toLocaleDateString('ur-PK');
  const body = kind === 'cv'
    ? `
      <div class="header"><h1>${esc(cv.name || 'نام')}</h1><div class="subtitle">${esc(cv.title)}</div></div>
      <div class="contact">${esc(cv.email)}${cv.phone ? ` &nbsp;|&nbsp; ${esc(cv.phone)}` : ''}</div>
      ${skills.length ? `<h2>اسکلز</h2><div class="pills">${skills.map((s) => `<span>${esc(s)}</span>`).join('')}</div>` : ''}
      ${cv.experience ? `<h2>تجربہ</h2>${paraHtml(cv.experience)}` : ''}
      ${cv.education ? `<h2>تعلیم</h2>${paraHtml(cv.education)}` : ''}
    `
    : `
      <div class="header"><h1>${esc(asg.title || 'اسائنمنٹ')}</h1><div class="subtitle">${esc(asg.subject)}</div></div>
      <div class="contact">${esc(asg.name)}${asg.className ? ` &nbsp;|&nbsp; ${esc(asg.className)}` : ''} &nbsp;|&nbsp; ${esc(today)}</div>
      <div class="content">${paraHtml(asg.content)}</div>
    `;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box} body{margin:0;padding:0;font-family:system-ui,'Noto Nastaliq Urdu',sans-serif;color:#111827;background:#fff}
    .page{width:794px;padding:48px 56px}
    .header{background:${tpl.header};color:#fff;padding:28px 32px;border-radius:16px}
    .header h1{margin:0;font-size:34px} .subtitle{margin-top:6px;font-size:17px;opacity:.9}
    .contact{margin:18px 0;color:#374151;font-size:15px}
    h2{color:${tpl.accent};border-bottom:2px solid ${tpl.accent};padding-bottom:6px;margin:26px 0 10px;font-size:20px}
    p{line-height:1.9;font-size:16px;margin:8px 0}
    .pills{display:flex;flex-wrap:wrap;gap:8px} .pills span{background:${tpl.pill};color:${tpl.header};padding:6px 14px;border-radius:999px;font-size:14px}
    .content p{text-align:justify} .footer{margin-top:36px;color:#6b7280;font-size:12px;text-align:center}
  </style></head><body><div class="page">${body}<div class="footer">Digital document — Unique AI Design Studio</div></div></body></html>`;
}

export default function DesignStudio({
  initialKind = 'cv',
  initialPlan = '',
  onClose,
}: {
  initialKind?: DesignKind;
  initialPlan?: string;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<DesignKind>(initialKind);
  const [template, setTemplate] = useState(0);
  const [cv, setCv] = useState({ name: '', title: '', email: '', phone: '', skills: '', experience: initialPlan, education: '' });
  const [asg, setAsg] = useState({ title: '', subject: '', name: '', className: '', content: initialPlan });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const html = useMemo(() => buildHtml(kind, template, cv, asg), [kind, template, cv, asg]);
  const filename = kind === 'cv' ? 'cv-design.pdf' : 'assignment-design.pdf';

  async function handleDownload() {
    setError(''); setDone(false); setBusy(true);
    try {
      saveLastDocument({ kind: kind === 'cv' ? 'resume' : 'assignment', title: kind === 'cv' ? `سی وی — ${cv.name || 'ڈیزائن'}` : `اسائنمنٹ — ${asg.title || 'ڈیزائن'}`, filename, html });
      await downloadDocumentPdf(html, filename);
      setDone(true);
    } catch {
      setError('پی ڈی ایف بنانے میں مسئلہ ہوا۔ دوبارہ کوشش کریں۔');
    } finally {
      setBusy(false);
    }
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', marginBottom: 8, fontSize: 15 };

  return (
    <div style={{ background: '#fff', borderRadius: 16, padding: 16, margin: 12, boxShadow: '0 4px 24px rgba(0,0,0,.12)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>🎨 ڈیزائن اسٹوڈیو — ایک ہی ٹول</h3>
        <button type="button" onClick={onClose} aria-label="بند کریں"><X size={18} /></button>
      </div>
      <p style={{ color: '#4b5563', fontSize: 14 }}>
        یونیک کے اندر ہی سب کچھ: سی وی بھی، اسائنمنٹ بھی، خوبصورت ڈیجیٹل ڈیزائن کے ساتھ، مکمل پی ڈی ایف۔
        یہ یونیک کا اپنا ایک ہی ڈیزائن ٹول ہے۔
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button type="button" onClick={() => setKind('cv')} style={{ padding: '8px 16px', borderRadius: 999, background: kind === 'cv' ? '#2563eb' : '#e5e7eb', color: kind === 'cv' ? '#fff' : '#111' }}>سی وی</button>
        <button type="button" onClick={() => setKind('assignment')} style={{ padding: '8px 16px', borderRadius: 999, background: kind === 'assignment' ? '#2563eb' : '#e5e7eb', color: kind === 'assignment' ? '#fff' : '#111' }}>اسائنمنٹ</button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {TEMPLATES.map((t) => (
          <button key={t.id} type="button" onClick={() => setTemplate(t.id)} style={{ padding: '6px 12px', borderRadius: 999, background: template === t.id ? t.header : '#e5e7eb', color: template === t.id ? '#fff' : '#111' }}>{t.name}</button>
        ))}
      </div>
      {kind === 'cv' ? (
        <div>
          <input style={inputStyle} placeholder="نام" value={cv.name} onChange={(e) => setCv({ ...cv, name: e.target.value })} />
          <input style={inputStyle} placeholder="عنوان / پیشہ" value={cv.title} onChange={(e) => setCv({ ...cv, title: e.target.value })} />
          <input style={inputStyle} placeholder="جی میل / ای میل" value={cv.email} onChange={(e) => setCv({ ...cv, email: e.target.value })} />
          <input style={inputStyle} placeholder="نمبر" value={cv.phone} onChange={(e) => setCv({ ...cv, phone: e.target.value })} />
          <input style={inputStyle} placeholder="اسکلز (کاما سے الگ کریں)" value={cv.skills} onChange={(e) => setCv({ ...cv, skills: e.target.value })} />
          <textarea style={{ ...inputStyle, minHeight: 80 }} placeholder="تجربہ" value={cv.experience} onChange={(e) => setCv({ ...cv, experience: e.target.value })} />
          <textarea style={{ ...inputStyle, minHeight: 60 }} placeholder="تعلیم" value={cv.education} onChange={(e) => setCv({ ...cv, education: e.target.value })} />
        </div>
      ) : (
        <div>
          <input style={inputStyle} placeholder="اسائنمنٹ کا عنوان" value={asg.title} onChange={(e) => setAsg({ ...asg, title: e.target.value })} />
          <input style={inputStyle} placeholder="مضمون" value={asg.subject} onChange={(e) => setAsg({ ...asg, subject: e.target.value })} />
          <input style={inputStyle} placeholder="نام" value={asg.name} onChange={(e) => setAsg({ ...asg, name: e.target.value })} />
          <input style={inputStyle} placeholder="کلاس" value={asg.className} onChange={(e) => setAsg({ ...asg, className: e.target.value })} />
          <textarea style={{ ...inputStyle, minHeight: 120 }} placeholder="اپنا پلان / اسائنمنٹ کا متن یہاں لکھیں — یونیک اسی کو خوبصورت ڈیزائن میں ڈھال دے گا" value={asg.content} onChange={(e) => setAsg({ ...asg, content: e.target.value })} />
        </div>
      )}
      <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', marginBottom: 12 }}>
        <iframe title="ڈیزائن پیش نظارہ" srcDoc={html} style={{ width: '100%', height: 520, border: 0 }} />
      </div>
      {error && <div style={{ color: '#b91c1c', marginBottom: 8 }}>{error}</div>}
      {done && <div style={{ color: '#15803d', marginBottom: 8 }}>پی ڈی ایف ڈاؤن لوڈ ہو گئی ہے۔</div>}
      <button type="button" onClick={handleDownload} disabled={busy} style={{ padding: '10px 20px', borderRadius: 999, background: '#2563eb', color: '#fff', fontSize: 16 }}>
        {busy ? <><Loader2 size={16} className="spin" /> بن رہی ہے…</> : '⬇️ مکمل پی ڈی ایف ڈاؤن لوڈ کریں'}
      </button>
    </div>
  );
}
