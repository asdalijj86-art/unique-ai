// PaperStudio — NEW tool, user order 2026-10-31 ~20:28.
// Replaces the deleted DesignStudio with the user's new spec:
//  - Opens by voice/text order («سی وی بناؤ» / «اسائنمنٹ بناؤ»)
//  - CV and Assignment are SEPARATE tabs, not one combined panel
//  - Ready papers in EVERY colour: pick a paper, it opens in preview
//  - Chat box BELOW the paper: click any field, then chat what to
//    write — PaperStudio writes it into that clicked field itself
//  - Download / PDF button alongside, paper ready in every colour
//  - Paper is WHITE, writing is BLACK (user rule 2026-10-31) —
//    colour is only in headers, borders and accents, never in body text.
import { useMemo, useState } from 'react';
import { X } from 'lucide-react';

export type PaperKind = 'cv' | 'assignment';

export function isPaperStudioOrder(text: string): PaperKind | null {
  const t = String(text || '');
  if (/(اسائنمنٹ|assignment)/i.test(t)) return 'assignment';
  if (/(سی وی|\bcv\b|بائیو ڈیٹا|resume)/i.test(t)) return 'cv';
  return null;
}

const COLOURS = [
  { name: 'نیلا', hex: '#0f2a5c' },
  { name: 'جامنی', hex: '#4c1d95' },
  { name: 'سبز', hex: '#14532d' },
  { name: 'ٹیل', hex: '#0f766e' },
  { name: 'میرون', hex: '#7f1d1d' },
  { name: 'سیاہ + سنہری', hex: '#111827' },
] as const;

const esc = (s: string) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export default function PaperStudio({ initialKind, onClose }: { initialKind: PaperKind; onClose: () => void }) {
  const [kind, setKind] = useState<PaperKind>(initialKind);
  const [colour, setColour] = useState<string>(COLOURS[0].hex);
  const [cv, setCv] = useState({ name: '', title: '', email: '', phone: '', skills: '', experience: '', education: '' });
  const [asg, setAsg] = useState({ title: '', subject: '', name: '', className: '', content: '' });
  const [activeField, setActiveField] = useState<string | null>(null);
  const [chat, setChat] = useState('');
  const [chatReply, setChatReply] = useState('');

  const html = useMemo(() => {
    if (kind === 'cv') {
      return `<div style="font-family:system-ui;padding:28px;color:#000;background:#fff">
        <div style="border-bottom:4px solid ${colour};padding-bottom:12px">
          <h1 style="margin:0;color:${colour}">${esc(cv.name) || 'آپ کا نام'}</h1>
          <p style="margin:4px 0 0">${esc(cv.title)}${cv.email ? ` • ${esc(cv.email)}` : ''}${cv.phone ? ` • ${esc(cv.phone)}` : ''}</p>
        </div>
        <h3 style="color:${colour}">مہارتیں</h3><p>${esc(cv.skills)}</p>
        <h3 style="color:${colour}">تجربہ</h3><p>${esc(cv.experience)}</p>
        <h3 style="color:${colour}">تعلیم</h3><p>${esc(cv.education)}</p></div>`;
    }
    return `<div style="font-family:system-ui;padding:28px;color:#000;background:#fff">
      <div style="border:3px solid ${colour};border-radius:12px;padding:20px">
        <h1 style="margin:0;color:${colour}">${esc(asg.title) || 'اسائنمنٹ کا عنوان'}</h1>
        <p>${esc(asg.subject)}${asg.name ? ` • ${esc(asg.name)}` : ''}${asg.className ? ` • کلاس ${esc(asg.className)}` : ''}</p>
        <hr style="border-color:${colour}"/><p style="white-space:pre-wrap">${esc(asg.content)}</p>
      </div></div>`;
  }, [kind, colour, cv, asg]);

  function sendChat() {
    const text = chat.trim();
    if (!text) { setChatReply('پہلے نیچے چیٹ میں لکھیں کہ کیا لکھنا ہے۔'); return; }
    if (kind === 'cv') {
      const key = activeField && activeField in cv ? (activeField as keyof typeof cv) : null;
      if (key) { setCv((c) => ({ ...c, [key]: text })); setChatReply(`ٹھیک ہے، «${key}» میں یہ لکھ دیا ہے۔`); }
      else if (/gmail|@|ای میل|email/i.test(text)) { setCv((c) => ({ ...c, email: text })); setChatReply('ای میل میں لکھ دیا ہے۔'); }
      else if (/\d{10,}/.test(text)) { setCv((c) => ({ ...c, phone: text })); setChatReply('فون نمبر میں لکھ دیا ہے۔'); }
      else { setCv((c) => ({ ...c, name: c.name || text })); setChatReply('نام میں لکھ دیا ہے — کسی اور خانے پر کلک کر کے اس کا متن بھی چیٹ سے لکھوائیں۔'); }
    } else {
      const key = activeField && activeField in asg ? (activeField as keyof typeof asg) : null;
      if (key) { setAsg((a) => ({ ...a, [key]: text })); setChatReply(`ٹھیک ہے، «${key}» میں یہ لکھ دیا ہے۔`); }
      else { setAsg((a) => ({ ...a, content: a.content ? `${a.content}\n${text}` : text })); setChatReply('اسائنمنٹ کے متن میں لکھ دیا ہے۔'); }
    }
    setChat('');
  }

  async function downloadPdf() {
    const { downloadDocumentPdf, saveLastDocument } = await import('@/lib/doc-pdf');
    const filename = kind === 'cv' ? 'cv.pdf' : 'assignment.pdf';
    const title = kind === 'cv' ? (cv.name || 'CV') : (asg.title || 'Assignment');
    saveLastDocument({ title, filename, html });
    await downloadDocumentPdf(html, filename);
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', marginBottom: 8, fontSize: 15, color: '#000', background: '#fff' };
  const field = (label: string, key: string, value: string, setter: (v: string) => void, multiline = false) => (
    <label key={key} style={{ display: 'block', color: '#000' }}>{label}
      {multiline
        ? <textarea style={inputStyle} rows={4} value={value} onFocus={() => setActiveField(key)} onChange={(e) => setter(e.target.value)} />
        : <input style={inputStyle} value={value} onFocus={() => setActiveField(key)} onClick={() => setActiveField(key)} onChange={(e) => setter(e.target.value)} />}
    </label>
  );

  return (
    <div style={{ background: '#fff', color: '#000', borderRadius: 16, padding: 16, margin: 12, boxShadow: '0 4px 24px rgba(0,0,0,.12)', maxHeight: '85vh', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, color: '#000' }}>📄 پیپر اسٹوڈیو — سی وی اور اسائنمنٹ، الگ الگ</h3>
        <button type="button" onClick={onClose} aria-label="بند کریں"><X size={18} /></button>
      </div>
      <div style={{ display: 'flex', gap: 8, margin: '12px 0', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setKind('cv')} style={{ padding: '8px 16px', borderRadius: 999, background: kind === 'cv' ? '#2563eb' : '#e5e7eb', color: kind === 'cv' ? '#fff' : '#000' }}>سی وی والا پیپر</button>
        <button type="button" onClick={() => setKind('assignment')} style={{ padding: '8px 16px', borderRadius: 999, background: kind === 'assignment' ? '#2563eb' : '#e5e7eb', color: kind === 'assignment' ? '#fff' : '#000' }}>اسائنمنٹ والا پیپر</button>
      </div>
      <p style={{ color: '#000', fontSize: 14 }}>پیپر کا رنگ چنیں — ہر رنگ میں پیپر ریڈی ہے، کاغذ سفید اور لکھائی کالی رہے گی:</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {COLOURS.map((c) => (
          <button key={c.hex} type="button" onClick={() => setColour(c.hex)} style={{ padding: '8px 14px', borderRadius: 999, border: colour === c.hex ? '3px solid #000' : '1px solid #d1d5db', background: c.hex, color: '#fff' }}>{c.name}</button>
        ))}
      </div>
      {kind === 'cv' ? (
        <div>
          {field('نام', 'name', cv.name, (v) => setCv((c) => ({ ...c, name: v })))}
          {field('عنوان / پیشہ', 'title', cv.title, (v) => setCv((c) => ({ ...c, title: v })))}
          {field('ای میل', 'email', cv.email, (v) => setCv((c) => ({ ...c, email: v })))}
          {field('فون', 'phone', cv.phone, (v) => setCv((c) => ({ ...c, phone: v })))}
          {field('مہارتیں', 'skills', cv.skills, (v) => setCv((c) => ({ ...c, skills: v })), true)}
          {field('تجربہ', 'experience', cv.experience, (v) => setCv((c) => ({ ...c, experience: v })), true)}
          {field('تعلیم', 'education', cv.education, (v) => setCv((c) => ({ ...c, education: v })), true)}
        </div>
      ) : (
        <div>
          {field('عنوان', 'title', asg.title, (v) => setAsg((a) => ({ ...a, title: v })))}
          {field('مضمون', 'subject', asg.subject, (v) => setAsg((a) => ({ ...a, subject: v })))}
          {field('نام', 'name', asg.name, (v) => setAsg((a) => ({ ...a, name: v })))}
          {field('کلاس', 'className', asg.className, (v) => setAsg((a) => ({ ...a, className: v })))}
          {field('متن', 'content', asg.content, (v) => setAsg((a) => ({ ...a, content: v })), true)}
        </div>
      )}
      <h4 style={{ color: '#000' }}>پیپر کا پیش نظارہ</h4>
      <iframe title="paper preview" srcDoc={html} style={{ width: '100%', height: 360, border: '1px solid #d1d5db', borderRadius: 12, background: '#fff' }} />
      <h4 style={{ color: '#000' }}>💬 نیچے چیٹ کریں — یہ خود لکھ دے گا</h4>
      <p style={{ color: '#000', fontSize: 13 }}>پہلے جس خانے میں لکھوانا ہے اس پر کلک کریں، پھر نیچے چیٹ میں وہ متن لکھیں — وہی متن اس خانے میں خود لکھ دیا جائے گا۔</p>
      <input style={inputStyle} placeholder="یہاں لکھیں کہ کیا لکھنا ہے…" value={chat} onChange={(e) => setChat(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') sendChat(); }} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={sendChat} style={{ padding: '10px 20px', borderRadius: 999, background: '#15803d', color: '#fff', fontSize: 16 }}>چیٹ سے لکھیں</button>
        <button type="button" onClick={downloadPdf} style={{ padding: '10px 20px', borderRadius: 999, background: '#2563eb', color: '#fff', fontSize: 16 }}>PDF ڈاؤن لوڈ کریں</button>
      </div>
      {chatReply && <div style={{ background: '#f0fdf4', color: '#000', borderRadius: 12, padding: 12, marginTop: 12 }}>{chatReply}</div>}
      {activeField && <div style={{ color: '#000', fontSize: 13, marginTop: 8 }}>چنا ہوا خانہ: {activeField} — اب چیٹ میں لکھیں، یہ اسی میں لکھا جائے گا۔</div>}
    </div>
  );
}
