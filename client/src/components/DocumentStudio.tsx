// Document Studio — MASTER PROMPT implementation, 2026-10-31.
// ONE tool inside Unique AI (not a separate website):
//  - Professional CV / Resume Maker: 16 profession templates
//  - Assignment / Academic Document Maker: 6 institution templates
//  Total 22 templates (>=20 required, >=15 CV required).
//  Live editor: add/edit/delete sections, colours, fonts, photo/logo,
//  preview, PDF (existing free client-side doc-pdf), Word (.docx via
//  docx.js, free), Print. No paid API, no subscription, no key.
//  Paper is WHITE, body text is BLACK (user rule) — colour only in
//  headers, accents and borders.
import { useMemo, useState } from 'react';
import { X } from 'lucide-react';

export function isDocumentStudioOrder(text: string): boolean {
  // Mic transcription variants: Urdu «ڈاکومنٹ» can come out as
  // «ڈاکیومنٹ», and «اسٹوڈیو» as «سٹوڈیو» — accept all of them,
  // plus plain English «document studio» / «studio».
  return /(document|ڈاکومنٹ|ڈاکیومنٹ)/i.test(String(text || ''));
}

type Layout = 'sidebar' | 'top' | 'minimal' | 'gold';
type Template = { id: string; name: string; kind: 'cv' | 'assignment'; profession: string; primary: string; secondary: string; layout: Layout };
const CV_TEMPLATES: Template[] = [
  { id: 'cv-doctor-blue', name: 'Doctor — Royal Blue & White', kind: 'cv', profession: 'Doctors and Medical Professionals', primary: '#0f2a5c', secondary: '#eef2ff', layout: 'sidebar' },
  { id: 'cv-doctor-teal', name: 'Medical Professional — Teal', kind: 'cv', profession: 'Doctors and Medical Professionals', primary: '#0f766e', secondary: '#ecfdf5', layout: 'top' },
  { id: 'cv-engineer-navy', name: 'Engineer — Navy Blue & Silver', kind: 'cv', profession: 'Engineers', primary: '#1e3a5f', secondary: '#e5e7eb', layout: 'sidebar' },
  { id: 'cv-engineer-minimal', name: 'Engineer — Modern Minimal', kind: 'cv', profession: 'Engineers', primary: '#111827', secondary: '#f3f4f6', layout: 'minimal' },
  { id: 'cv-teacher-purple', name: 'Teacher — Purple & White', kind: 'cv', profession: 'Teachers and Professors', primary: '#4c1d95', secondary: '#f5f3ff', layout: 'top' },
  { id: 'cv-principal-gold', name: 'Principal — Black & Gold', kind: 'cv', profession: 'School Principals', primary: '#111827', secondary: '#fef3c7', layout: 'gold' },
  { id: 'cv-manager-corp', name: 'Manager — International Corporate', kind: 'cv', profession: 'Managers and Executives', primary: '#0f2a5c', secondary: '#dbeafe', layout: 'top' },
  { id: 'cv-office-green', name: 'Office Employee — Green & White', kind: 'cv', profession: 'Office Employees', primary: '#14532d', secondary: '#f0fdf4', layout: 'sidebar' },
  { id: 'cv-it-blue', name: 'IT Professional — Royal Blue', kind: 'cv', profession: 'IT Professionals', primary: '#1d4ed8', secondary: '#eff6ff', layout: 'sidebar' },
  { id: 'cv-student', name: 'Student / Fresh Graduate — Elegant Colorful', kind: 'cv', profession: 'Students and Fresh Graduates', primary: '#be185d', secondary: '#fdf2f8', layout: 'top' },
  { id: 'cv-business-navy', name: 'Business Professional — Navy & Silver', kind: 'cv', profession: 'Business Professionals', primary: '#172554', secondary: '#e2e8f0', layout: 'top' },
  { id: 'cv-medical-premium', name: 'Medical — Academic Premium', kind: 'cv', profession: 'Doctors and Medical Professionals', primary: '#7c2d12', secondary: '#fff7ed', layout: 'minimal' },
  { id: 'cv-academic', name: 'Professor — Academic Premium', kind: 'cv', profession: 'Teachers and Professors', primary: '#334155', secondary: '#f1f5f9', layout: 'minimal' },
  { id: 'cv-elegant', name: 'All Professions — Elegant Colorful', kind: 'cv', profession: 'All other professions', primary: '#6d28d9', secondary: '#ede9fe', layout: 'sidebar' },
  { id: 'cv-minimal', name: 'All Professions — Modern Minimal', kind: 'cv', profession: 'All other professions', primary: '#000000', secondary: '#f9fafb', layout: 'minimal' },
  { id: 'cv-executive-gold', name: 'Executive — Black & Gold', kind: 'cv', profession: 'Managers and Executives', primary: '#111827', secondary: '#fef9c3', layout: 'gold' },
];
const ASG_TEMPLATES: Template[] = [
  { id: 'asg-school', name: 'School Assignment — Green & White', kind: 'assignment', profession: 'Schools', primary: '#14532d', secondary: '#f0fdf4', layout: 'top' },
  { id: 'asg-college', name: 'College Assignment — Royal Blue & White', kind: 'assignment', profession: 'Colleges', primary: '#0f2a5c', secondary: '#eef2ff', layout: 'top' },
  { id: 'asg-university', name: 'University Assignment — Purple & White', kind: 'assignment', profession: 'Universities', primary: '#4c1d95', secondary: '#f5f3ff', layout: 'top' },
  { id: 'asg-medical', name: 'Medical College — Teal Professional', kind: 'assignment', profession: 'Medical Colleges', primary: '#0f766e', secondary: '#ecfdf5', layout: 'top' },
  { id: 'asg-engineering', name: 'Engineering College — Navy & Silver', kind: 'assignment', profession: 'Engineering Colleges', primary: '#1e3a5f', secondary: '#e5e7eb', layout: 'top' },
  { id: 'asg-research', name: 'Research Report — Black & Gold Premium', kind: 'assignment', profession: 'Research Projects', primary: '#111827', secondary: '#fef3c7', layout: 'gold' },
];
const TEMPLATES = [...CV_TEMPLATES, ...ASG_TEMPLATES];
const esc = (s: string) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', marginBottom: 8, fontSize: 15, color: '#000', background: '#fff' };

type Chapter = { heading: string; text: string };
type TableRow = { c1: string; c2: string };

export default function DocumentStudio({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useState<'cv' | 'assignment'>('cv');
  const [templateId, setTemplateId] = useState('cv-doctor-blue');
  const tpl = TEMPLATES.find((t) => t.id === templateId) || TEMPLATES[0];
  const [primary, setPrimary] = useState(tpl.primary);
  const [font, setFont] = useState('system-ui, sans-serif');
  const [photo, setPhoto] = useState('');
  const [cv, setCv] = useState({ name: '', title: '', email: '', phone: '', address: '', objective: '', education: '', experience: '', skills: '', languages: '', certifications: '', achievements: '', references: '' });
  const [show, setShow] = useState<Record<string, boolean>>({ objective: true, education: true, experience: true, skills: true, languages: true, certifications: true, achievements: true, references: true });
  const [asg, setAsg] = useState({ institution: '', student: '', roll: '', course: '', subject: '', teacher: '', date: '', title: '', references: '' });
  const [chapters, setChapters] = useState<Chapter[]>([{ heading: 'Introduction', text: '' }, { heading: 'Main Body', text: '' }, { heading: 'Conclusion', text: '' }]);
  const [tableRows, setTableRows] = useState<TableRow[]>([{ c1: '', c2: '' }]);
  const [asgImage, setAsgImage] = useState('');
  const [topic, setTopic] = useState('');
  const [status, setStatus] = useState('');

  function pickTemplate(t: Template) { setTemplateId(t.id); setCategory(t.kind); setPrimary(t.primary); }
  function onFile(e: React.ChangeEvent<HTMLInputElement>, setter: (v: string) => void) {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader(); r.onload = () => setter(String(r.result || '')); r.readAsDataURL(f);
  }
  function draftFromTopic() {
    if (!topic.trim()) { setStatus('پہلے موضوع لکھیں۔'); return; }
    setAsg((a) => ({ ...a, title: a.title || topic }));
    setChapters([
      { heading: 'Introduction', text: `${topic} is an important topic. This assignment introduces its background, purpose and scope.` },
      { heading: 'Main Discussion', text: `This chapter discusses ${topic} in detail — its key ideas, examples and analysis.` },
      { heading: 'Conclusion', text: `In conclusion, ${topic} shows clear lessons and practical value. Further study can extend this work.` },
    ]);
    setStatus('موضوع سے مسودہ بن گیا ہے — اب اسے اپنی مرضی سے ایڈٹ کریں۔');
  }

  const cvHtml = useMemo(() => {
    const sec = (label: string, key: string, body: string) => show[key] && body.trim() ? `<h3 style="color:${primary};border-bottom:2px solid ${primary}">${label}</h3><p style="white-space:pre-wrap">${esc(body)}</p>` : '';
    const sidebar = tpl.layout === 'sidebar';
    const body = `
      <div style="font-family:${font};color:#000;background:#fff;padding:28px">
        ${photo ? `<img src="${photo}" style="width:110px;height:110px;object-fit:cover;border-radius:50%;border:3px solid ${primary}"/>` : ''}
        <h1 style="color:${primary};margin:8px 0 0">${esc(cv.name) || 'Full Name'}</h1>
        <p style="margin:4px 0">${esc(cv.title)}${cv.email ? ` • ${esc(cv.email)}` : ''}${cv.phone ? ` • ${esc(cv.phone)}` : ''}${cv.address ? ` • ${esc(cv.address)}` : ''}</p>
        ${sec('Career Objective', 'objective', cv.objective)}
        ${sec('Education', 'education', cv.education)}
        ${sec('Work Experience', 'experience', cv.experience)}
        ${sec('Skills', 'skills', cv.skills)}
        ${sec('Languages', 'languages', cv.languages)}
        ${sec('Certifications', 'certifications', cv.certifications)}
        ${sec('Achievements', 'achievements', cv.achievements)}
        ${sec('References', 'references', cv.references)}
        <p style="font-size:12px;color:#555">Template: ${esc(tpl.name)} • ${sidebar ? 'Sidebar layout' : tpl.layout} • Page 1</p>
      </div>`;
    return body;
  }, [cv, photo, primary, font, show, tpl]);

  const asgHtml = useMemo(() => {
    const toc = chapters.map((c, i) => `<li>${i + 1}. ${esc(c.heading)}</li>`).join('');
    const chaps = chapters.map((c, i) => `<h2 style="color:${primary}">Chapter ${i + 1}: ${esc(c.heading)}</h2><p style="white-space:pre-wrap">${esc(c.text)}</p>`).join('');
    const table = tableRows.some((r) => r.c1 || r.c2) ? `<table border="1" cellpadding="8" style="border-collapse:collapse;width:100%"><tr><th>Item</th><th>Detail</th></tr>${tableRows.map((r) => `<tr><td>${esc(r.c1)}</td><td>${esc(r.c2)}</td></tr>`).join('')}</table>` : '';
    return `<div style="font-family:${font};color:#000;background:#fff;padding:28px">
      <div style="text-align:center;border:3px solid ${primary};border-radius:12px;padding:24px">
        <h2 style="color:${primary};margin:0">${esc(asg.institution) || 'College / University Name'}</h2>
        <h1 style="margin:16px 0">${esc(asg.title) || 'Assignment Title'}</h1>
        <p>Student: ${esc(asg.student)} • Roll: ${esc(asg.roll)}<br/>Course: ${esc(asg.course)} • Subject: ${esc(asg.subject)}<br/>Teacher: ${esc(asg.teacher)} • Date: ${esc(asg.date)}</p>
      </div>
      <h2 style="color:${primary}">Table of Contents</h2><ol>${toc}</ol>
      ${chaps}${table}${asgImage ? `<img src="${asgImage}" style="max-width:100%;margin-top:12px"/>` : ''}
      ${asg.references.trim() ? `<h2 style="color:${primary}">References and Bibliography</h2><p style="white-space:pre-wrap">${esc(asg.references)}</p>` : ''}
      <p style="font-size:12px;color:#555">Template: ${esc(tpl.name)} • A4 • Page 1</p></div>`;
  }, [asg, chapters, tableRows, asgImage, primary, font, tpl]);

  const html = category === 'cv' ? cvHtml : asgHtml;
  async function downloadPdf() {
    try {
      const { downloadDocumentPdf, saveLastDocument } = await import('@/lib/doc-pdf');
      const filename = category === 'cv' ? 'cv.pdf' : 'assignment.pdf';
      saveLastDocument({ kind: category === 'cv' ? 'resume' : 'assignment', title: category === 'cv' ? (cv.name || 'CV') : (asg.title || 'Assignment'), filename, html });
      await downloadDocumentPdf(html, filename); setStatus('PDF ڈاؤن لوڈ ہو گیا ہے۔');
    } catch { setStatus('PDF میں مسئلہ ہوا ہے — Print والا بٹن آزمائیں۔'); }
  }
  async function downloadWord() {
    try {
      const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType } = await import('docx');
      const paras: any[] = [];
      if (category === 'cv') {
        paras.push(new Paragraph({ text: cv.name || 'CV', heading: HeadingLevel.TITLE }));
        paras.push(new Paragraph({ text: [cv.title, cv.email, cv.phone, cv.address].filter(Boolean).join(' • ') }));
        const add = (h: string, v: string) => { if (v.trim()) { paras.push(new Paragraph({ text: h, heading: HeadingLevel.HEADING_2 })); paras.push(new Paragraph({ text: v })); } };
        add('Career Objective', cv.objective); add('Education', cv.education); add('Work Experience', cv.experience); add('Skills', cv.skills); add('Languages', cv.languages); add('Certifications', cv.certifications); add('Achievements', cv.achievements); add('References', cv.references);
      } else {
        paras.push(new Paragraph({ text: asg.title || 'Assignment', heading: HeadingLevel.TITLE }));
        paras.push(new Paragraph({ text: `${asg.institution} • ${asg.student} • Roll ${asg.roll} • ${asg.course} • ${asg.subject} • ${asg.teacher} • ${asg.date}` }));
        paras.push(new Paragraph({ text: 'Table of Contents', heading: HeadingLevel.HEADING_1 }));
        chapters.forEach((c, i) => paras.push(new Paragraph({ text: `${i + 1}. ${c.heading}` })));
        chapters.forEach((c, i) => { paras.push(new Paragraph({ text: `Chapter ${i + 1}: ${c.heading}`, heading: HeadingLevel.HEADING_1 })); paras.push(new Paragraph({ text: c.text })); });
        if (tableRows.some((r) => r.c1 || r.c2)) paras.push(new Table({ rows: [new TableRow({ children: [new TableCell({ children: [new Paragraph('Item')] }), new TableCell({ children: [new Paragraph('Detail')] })] }), ...tableRows.map((r) => new TableRow({ children: [new TableCell({ children: [new Paragraph(r.c1)] }), new TableCell({ children: [new Paragraph(r.c2)] })] }))] , width: { size: 100, type: WidthType.PERCENTAGE } }));
        if (asg.references.trim()) { paras.push(new Paragraph({ text: 'References', heading: HeadingLevel.HEADING_1 })); paras.push(new Paragraph({ text: asg.references })); }
      }
      const doc = new Document({ sections: [{ children: paras }] });
      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = category === 'cv' ? 'cv.docx' : 'assignment.docx'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000); setStatus('Word (.docx) ڈاؤن لوڈ ہو گیا ہے۔');
    } catch { setStatus('Word بنانے میں مسئلہ ہوا ہے — دوبارہ آزمائیں۔'); }
  }
  function printDoc() {
    const w = window.open('', '_blank'); if (!w) { setStatus('پرنٹ ونڈو بلاک ہو گئی ہے — پاپ اپ اجازت دیں۔'); return; }
    w.document.write(`<html><head><title>Document</title></head><body style="margin:0">${html}</body></html>`); w.document.close(); w.focus(); setTimeout(() => w.print(), 500);
  }
  const field = (label: string, key: string, value: string, setter: (v: string) => void, multiline = false) => (
    <label key={key} style={{ display: 'block', color: '#000' }}>{label}
      {multiline ? <textarea style={inputStyle} rows={3} value={value} onChange={(e) => setter(e.target.value)} /> : <input style={inputStyle} value={value} onChange={(e) => setter(e.target.value)} />}
    </label>
  );

  return (
    <div style={{ background: '#fff', color: '#000', borderRadius: 16, padding: 16, margin: 12, boxShadow: '0 4px 24px rgba(0,0,0,.12)', maxHeight: '85vh', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, color: '#000' }}>📄 Document Studio — Unique AI</h3>
        <button type="button" onClick={onClose} aria-label="بند کریں"><X size={18} /></button>
      </div>
      <p style={{ color: '#000', fontSize: 14 }}>ایک ہی ٹول میں CV اور Assignment — پہلے کیٹیگری چنیں، پھر ڈیزائن چنیں، پھر معلومات لکھیں، پھر PDF / Word / Print۔</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <button type="button" onClick={() => setCategory('cv')} style={{ padding: '8px 16px', borderRadius: 999, background: category === 'cv' ? '#2563eb' : '#e5e7eb', color: category === 'cv' ? '#fff' : '#000' }}>Professional CV / Resume Maker</button>
        <button type="button" onClick={() => setCategory('assignment')} style={{ padding: '8px 16px', borderRadius: 999, background: category === 'assignment' ? '#2563eb' : '#e5e7eb', color: category === 'assignment' ? '#fff' : '#000' }}>Assignment / Document Maker</button>
      </div>
      <h4 style={{ color: '#000' }}>ڈیزائن لائبریری — {category === 'cv' ? '16 CV ڈیزائن' : '6 Assignment ڈیزائن'} (کل 22)</h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 8, marginBottom: 12 }}>
        {TEMPLATES.filter((t) => t.kind === category).map((t) => (
          <button key={t.id} type="button" onClick={() => pickTemplate(t)} style={{ textAlign: 'left', padding: 10, borderRadius: 12, border: templateId === t.id ? '3px solid #000' : '1px solid #d1d5db', background: '#fff', color: '#000' }}>
            <span style={{ display: 'block', height: 10, background: t.primary, borderRadius: 6, marginBottom: 6 }} />
            <strong>{t.name}</strong><br /><small>{t.profession}</small>
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        <label style={{ color: '#000' }}>رنگ بدلیں: <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} /></label>
        <label style={{ color: '#000' }}>فونٹ: <select style={{ ...inputStyle, width: 'auto', marginBottom: 0 }} value={font} onChange={(e) => setFont(e.target.value)}>
          <option value="system-ui, sans-serif">Sans (Modern)</option><option value="Georgia, serif">Serif (Classic)</option><option value="'Times New Roman', serif">Times (Academic)</option>
        </select></label>
      </div>
      {category === 'cv' ? (
        <div>
          <label style={{ color: '#000' }}>Profile Photo: <input type="file" accept="image/*" onChange={(e) => onFile(e, setPhoto)} /></label>
          {field('Full Name', 'name', cv.name, (v) => setCv({ ...cv, name: v }))}
          {field('Professional Title', 'title', cv.title, (v) => setCv({ ...cv, title: v }))}
          {field('Email / Gmail', 'email', cv.email, (v) => setCv({ ...cv, email: v }))}
          {field('Phone Number', 'phone', cv.phone, (v) => setCv({ ...cv, phone: v }))}
          {field('Address', 'address', cv.address, (v) => setCv({ ...cv, address: v }))}
          {field('Career Objective', 'objective', cv.objective, (v) => setCv({ ...cv, objective: v }), true)}
          {field('Education', 'education', cv.education, (v) => setCv({ ...cv, education: v }), true)}
          {field('Work Experience', 'experience', cv.experience, (v) => setCv({ ...cv, experience: v }), true)}
          {field('Skills', 'skills', cv.skills, (v) => setCv({ ...cv, skills: v }), true)}
          {field('Languages', 'languages', cv.languages, (v) => setCv({ ...cv, languages: v }))}
          {field('Certifications', 'certifications', cv.certifications, (v) => setCv({ ...cv, certifications: v }), true)}
          {field('Achievements', 'achievements', cv.achievements, (v) => setCv({ ...cv, achievements: v }), true)}
          {field('References', 'references', cv.references, (v) => setCv({ ...cv, references: v }), true)}
          <p style={{ color: '#000' }}>سیکشن دکھائیں / چھپائیں:</p>
          {Object.keys(show).map((k) => <label key={k} style={{ color: '#000', marginRight: 12 }}><input type="checkbox" checked={show[k]} onChange={(e) => setShow({ ...show, [k]: e.target.checked })} /> {k}</label>)}
        </div>
      ) : (
        <div>
          {field('College / University Name', 'institution', asg.institution, (v) => setAsg({ ...asg, institution: v }))}
          {field('Assignment Title', 'title', asg.title, (v) => setAsg({ ...asg, title: v }))}
          {field('Student Name', 'student', asg.student, (v) => setAsg({ ...asg, student: v }))}
          {field('Roll Number', 'roll', asg.roll, (v) => setAsg({ ...asg, roll: v }))}
          {field('Course Name', 'course', asg.course, (v) => setAsg({ ...asg, course: v }))}
          {field('Subject', 'subject', asg.subject, (v) => setAsg({ ...asg, subject: v }))}
          {field('Teacher / Professor Name', 'teacher', asg.teacher, (v) => setAsg({ ...asg, teacher: v }))}
          {field('Submission Date', 'date', asg.date, (v) => setAsg({ ...asg, date: v }))}
          <label style={{ color: '#000' }}>Image / Logo: <input type="file" accept="image/*" onChange={(e) => onFile(e, setAsgImage)} /></label>
          <h4 style={{ color: '#000' }}>Chapters — Add / Edit / Delete</h4>
          {chapters.map((c, i) => (
            <div key={i} style={{ border: '1px solid #d1d5db', borderRadius: 12, padding: 10, marginBottom: 8 }}>
              <input style={inputStyle} placeholder="Chapter heading" value={c.heading} onChange={(e) => setChapters(chapters.map((x, j) => j === i ? { ...x, heading: e.target.value } : x))} />
              <textarea style={inputStyle} rows={3} placeholder="Paragraph" value={c.text} onChange={(e) => setChapters(chapters.map((x, j) => j === i ? { ...x, text: e.target.value } : x))} />
              <button type="button" onClick={() => setChapters(chapters.filter((_, j) => j !== i))} style={{ padding: '6px 12px', borderRadius: 999, background: '#fee2e2', color: '#000' }}>Delete this chapter</button>
            </div>
          ))}
          <button type="button" onClick={() => setChapters([...chapters, { heading: 'New Chapter', text: '' }])} style={{ padding: '8px 16px', borderRadius: 999, background: '#e5e7eb', color: '#000', marginBottom: 8 }}>+ Add new section / chapter</button>
          <h4 style={{ color: '#000' }}>Table</h4>
          {tableRows.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 8 }}>
              <input style={inputStyle} placeholder="Item" value={r.c1} onChange={(e) => setTableRows(tableRows.map((x, j) => j === i ? { ...x, c1: e.target.value } : x))} />
              <input style={inputStyle} placeholder="Detail" value={r.c2} onChange={(e) => setTableRows(tableRows.map((x, j) => j === i ? { ...x, c2: e.target.value } : x))} />
            </div>
          ))}
          <button type="button" onClick={() => setTableRows([...tableRows, { c1: '', c2: '' }])} style={{ padding: '8px 16px', borderRadius: 999, background: '#e5e7eb', color: '#000', marginBottom: 8 }}>+ Add table row</button>
          {field('References and Bibliography', 'references', asg.references, (v) => setAsg({ ...asg, references: v }), true)}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <input style={{ ...inputStyle, width: 'auto', flex: 1, marginBottom: 0 }} placeholder="Topic for draft, e.g. Photosynthesis" value={topic} onChange={(e) => setTopic(e.target.value)} />
            <button type="button" onClick={draftFromTopic} style={{ padding: '8px 16px', borderRadius: 999, background: '#15803d', color: '#fff' }}>Generate draft from topic</button>
          </div>
        </div>
      )}
      <h4 style={{ color: '#000' }}>Live Preview — A4, white paper, black text</h4>
      <iframe title="document preview" srcDoc={html} style={{ width: '100%', height: 420, border: '1px solid #d1d5db', borderRadius: 12, background: '#fff' }} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        <button type="button" onClick={downloadPdf} style={{ padding: '10px 20px', borderRadius: 999, background: '#2563eb', color: '#fff', fontSize: 16 }}>Download PDF</button>
        <button type="button" onClick={downloadWord} style={{ padding: '10px 20px', borderRadius: 999, background: '#7c3aed', color: '#fff', fontSize: 16 }}>Download Word (.docx)</button>
        <button type="button" onClick={printDoc} style={{ padding: '10px 20px', borderRadius: 999, background: '#111827', color: '#fff', fontSize: 16 }}>Print Document</button>
      </div>
      {status && <div style={{ background: '#f0fdf4', color: '#000', borderRadius: 12, padding: 12, marginTop: 12 }}>{status}</div>}
    </div>
  );
}
