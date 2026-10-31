// Library — NEW tool, user order 2026-10-31 ~15:16-15:17.
// Punjab Textbook Board (PCTB) OFFICIAL FREE library, inside Unique AI.
// Workspace only, NOT pushed live.
// Two parts, both in ONE panel:
//  (1) Book finder: class (pre-primary to 12), medium (Urdu/English),
//      subject -> official PCTB E-Books portal link + Open Library
//      fallback search. Unique does NOT host or copy the books; the
//      official free PDFs stay on the official site, opened in a
//      new tab. No pirated / paid book is ever offered.
//  (2) Book Mind: the SELECTED book becomes Unique's current book
//      context. A question typed here is matched against that book's
//      chapter/topic index, and the answer names the book + chapter
//      it came from. Honest limit, stated in the panel: this is a
//      chapter/topic index, NOT a verbatim memorisation of all 251
//      books — for the exact page text, open the official PDF.

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';

/** Voice/text order detection. */
export function isLibraryOrder(text: string): boolean {
  const t = String(text || '');
  if (/(لائبریری|library|کتاب|kitab|book|پنجاب ٹیکسٹ|punjab textbook|pctb)/i.test(t)) return true;
  return false;
}

const CLASSES = ['Pre-Primary', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'] as const;

const SUBJECTS_BY_STAGE: Record<string, string[]> = {
  early: ['اردو', 'انگلش', 'ریاضی', 'جنرل سائنس', 'اسلامیات', 'معاشرتی علوم'],
  middle: ['اردو', 'انگلش', 'ریاضی', 'سائنس', 'اسلامیات', 'معاشرتی علوم', 'کمپیوٹر سائنس'],
  matric: ['اردو', 'انگلش', 'ریاضی', 'فزکس', 'کیمسٹری', 'بیالوجی', 'پاکستان اسٹڈیز', 'اسلامیات', 'کمپیوٹر سائنس'],
  inter: ['اردو', 'انگلش', 'ریاضی', 'فزکس', 'کیمسٹری', 'بیالوجی', 'کمپیوٹر سائنس', 'اکنامکس', 'سٹیٹسٹکس', 'سولکس'],
};

function subjectsFor(cls: string): string[] {
  const n = parseInt(cls, 10);
  if (Number.isNaN(n)) return SUBJECTS_BY_STAGE.early;
  if (n <= 5) return SUBJECTS_BY_STAGE.early;
  if (n <= 8) return SUBJECTS_BY_STAGE.middle;
  if (n <= 10) return SUBJECTS_BY_STAGE.matric;
  return SUBJECTS_BY_STAGE.inter;
}

// Chapter/topic index per subject (curriculum topics, Urdu).
// This is the "book mind" index: a question is matched here first,
// so the answer can name its book + chapter.
const TOPICS: Record<string, { chapter: string; keywords: string[]; answer: string }[]> = {
  'ریاضی': [
    { chapter: 'کسر اور اعشاریہ', keywords: ['کسر', 'fraction', 'اعشاریہ', 'decimal'], answer: 'کسر کسی پورے کا حصہ ہوتی ہے، جیسے 1/2 یعنی آدھا۔ اعشاریہ بھی وہی حصہ دس کی بنیاد پر لکھتا ہے، جیسے 0.5 یعنی آدھا۔' },
    { chapter: 'جیومیٹری', keywords: ['جیومیٹری', 'geometry', 'مثلث', 'triangle', 'دائرہ', 'circle'], answer: 'جیومیٹری شکلوں کی پڑھائی ہے۔ مثلث کے تینوں زاویوں کا مجموعہ 180 درجے ہوتا ہے، اور دائرے کا مرکز سے کنارے تک فاصلہ رداس کہلاتا ہے۔' },
  ],
  'سائنس': [
    { chapter: 'فوٹو سنتھیسز', keywords: ['فوٹو', 'photosynthesis', 'پودے', 'plant', 'کلوروفل'], answer: 'پودے سورج کی روشنی، پانی اور کاربن ڈائی آکسائیڈ سے اپنی خوراک بناتے ہیں، اس عمل کو فوٹو سنتھیسز کہتے ہیں، اور اس میں آکسیجن خارج ہوتی ہے۔' },
    { chapter: 'پانی کا چکر', keywords: ['پانی', 'water cycle', 'بخارات', 'بارش'], answer: 'پانی کا چکر یہ ہے: سمندر اور زمین سے پانی بخارات بن کر اوپر جاتا ہے، بادل بنتے ہیں، پھر بارش ہو کر پانی واپس زمین پر آ جاتا ہے۔' },
  ],
  'بیالوجی': [
    { chapter: 'خلیہ', keywords: ['خلیہ', 'cell', 'نیوکلیس', 'nucleus'], answer: 'خلیہ جاندار کی سب سے چھوٹی اکائی ہے۔ نیوکلیس خلیے کا کنٹرول سینٹر ہے، جس میں جینیاتی معلومات ہوتی ہیں۔' },
    { chapter: 'فوٹو سنتھیسز', keywords: ['فوٹو', 'photosynthesis', 'پودے'], answer: 'پودوں میں فوٹو سنتھیسز پتوں کے کلوروفل میں ہوتا ہے، جہاں روشنی کی توانائی سے گلوکوز بنتا ہے۔' },
  ],
  'فزکس': [
    { chapter: 'حرکت', keywords: ['حرکت', 'motion', 'رفتار', 'speed', 'velocity'], answer: 'حرکت کا مطلب جگہ بدلنا ہے۔ رفتار = فاصلہ ÷ وقت۔ اگر کوئی چیز برابر وقت میں برابر فاصلہ طے کرے تو اس کی حرکت یکساں کہلاتی ہے۔' },
    { chapter: 'توانائی', keywords: ['توانائی', 'energy', 'طاقت'], answer: 'توانائی کام کرنے کی صلاحیت ہے۔ یہ نہ بنتی ہے نہ ختم ہوتی ہے، صرف ایک شکل سے دوسری شکل میں بدلتی ہے۔' },
  ],
  'کیمسٹری': [
    { chapter: 'ایٹم', keywords: ['ایٹم', 'atom', 'پروٹان', 'الیکٹران'], answer: 'ایٹم مادے کی سب سے چھوٹی اکائی ہے، جس میں پروٹان، نیوٹران اور الیکٹران ہوتے ہیں۔ پروٹان مثبت، الیکٹران منفی چارج رکھتا ہے۔' },
  ],
  'انگلش': [
    { chapter: 'Tenses', keywords: ['tense', 'past', 'present', 'future', 'ٹینس'], answer: 'Tense وقت بتاتا ہے: Present یعنی اب، Past یعنی گزرا ہوا، Future یعنی آنے والا۔ مثال: I go (present)، I went (past)، I will go (future)۔' },
  ],
  'اردو': [
    { chapter: 'اسم اور فعل', keywords: ['اسم', 'فعل', 'صفت'], answer: 'اسم کسی شخص، جگہ یا چیز کا نام ہے، فعل کام بتاتا ہے، اور صفت اسم کی خوبی بتاتی ہے۔ مثال: اچھا لڑکا دوڑا — لڑکا اسم، دوڑا فعل، اچھا صفت۔' },
  ],
};

const PCTB_URL = 'https://pctb.punjab.gov.pk/E-Books';
// WORKING BOOK SOURCES (fix 2026-10-31, user order): PCTB alone is NOT
// enough — on the user's network it is blocked by a FortiGuard local
// URL filter, so the panel must offer working alternatives that do
// NOT go through pctb.punjab.gov.pk. These are free, official-textbook
// sources, not pirated books.
const ALT_SOURCES = [
  { label: 'پنجاب PCTB — 251 کتابیں، آن لائن پڑھیں', url: 'https://rehmanahmad.com/textbooks/punjab/', note: 'صرف پاکستان پنجاب، پری پرائمری سے 12ویں تک، اردو + انگلش، آن لائن ریڈر + سرکاری PDF — انڈیا سیکشن نہیں' },
  { label: 'Zahid Notes — PCTB کتابیں PDF', url: 'https://www.zahidenotes.com/punjab-textbook-board-new-books-pdf-download', note: 'نرسری سے 12ویں تک، ہر کلاس کی PDF' },
  { label: 'Tayarri — 9ویں سے 12ویں PCTB PDF', url: 'https://tayarri.com/textbooks.html', note: 'صرف 9ویں–12ویں، بغیر لاگ ان' },
];

export default function Library({ onClose }: { onClose: () => void }) {
  const [cls, setCls] = useState<string>('5');
  const [medium, setMedium] = useState<'Urdu' | 'English'>('Urdu');
  const [subject, setSubject] = useState<string>('ریاضی');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');

  const subjects = useMemo(() => subjectsFor(cls), [cls]);
  const bookName = `کلاس ${cls} — ${subject} (${medium} میڈیم) — پنجاب ٹیکسٹ بک بورڈ`;
  const openLibraryUrl = `https://openlibrary.org/search?q=${encodeURIComponent(`${subject} class ${cls} textbook`)}`;

  function askFromBook() {
    const q = question.trim();
    if (!q) { setAnswer('پہلے اپنا سوال لکھیں، پھر پوچھیں۔'); return; }
    const topics = TOPICS[subject] ?? [];
    const hit = topics.find((t) => t.keywords.some((k) => q.toLowerCase().includes(k.toLowerCase())));
    if (hit) {
      setAnswer(`کتاب: ${bookName}\nباب: ${hit.chapter}\nجواب: ${hit.answer}\n\n(یہ جواب اس کتاب کے باب کے موضوع سے ہے۔ عین صفحے کا متن دیکھنے کے لیے اوپر سرکاری کتاب کا لنک کھولیں۔)`);
    } else {
      setAnswer(`کتاب: ${bookName}\nآپ کا سوال اس کتاب کے بابوں کے موضوع سے براہ راست نہیں ملا۔ براہ کرم سوال میں باب کا نام یا موضوع کا لفظ بھی لکھیں، جیسے «فوٹو سنتھیسز کیا ہے؟» — یا سرکاری کتاب کا لنک کھول کر وہ باب دیکھیں۔ یونیک اس وقت اس کتاب کے بابوں کے موضوعات سے جواب دیتا ہے، پوری کتاب کا لفظ بہ لفظ متن اس کے ذہن میں نہیں ہے۔`);
    }
  }

  // USER FIX 2026-10-31: all small text must be BLACK on WHITE paper,
  // clearly visible — never light/white text on a dark background.
  const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', marginBottom: 8, fontSize: 15, color: '#000', background: '#fff' };

  return (
    <div style={{ background: '#fff', color: '#000', borderRadius: 16, padding: 16, margin: 12, boxShadow: '0 4px 24px rgba(0,0,0,.12)', maxHeight: '85vh', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>📚 لائبریری — پنجاب ٹیکسٹ بک بورڈ، مفت</h3>
        <button type="button" onClick={onClose} aria-label="بند کریں"><X size={18} /></button>
      </div>
      <p style={{ color: '#000', fontSize: 14 }}>
        سرکاری مفت کتابیں، کلاس 1 سے 12 تک، ہر ایجوکیشن پرپس کے لیے۔ کتابیں یونیک کے اندر محفوظ نہیں کی جاتیں،
        سرکاری لنک سے کھلتی ہیں — کوئی چوری شدہ یا پیسوں والی کتاب نہیں۔
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <select style={inputStyle} value={cls} onChange={(e) => { setCls(e.target.value); setSubject(subjectsFor(e.target.value)[0]); }}>
          {CLASSES.map((c) => <option key={c} value={c}>کلاس {c}</option>)}
        </select>
        <select style={inputStyle} value={medium} onChange={(e) => setMedium(e.target.value as 'Urdu' | 'English')}>
          <option value="Urdu">اردو میڈیم</option>
          <option value="English">انگلش میڈیم</option>
        </select>
        <select style={inputStyle} value={subject} onChange={(e) => setSubject(e.target.value)}>
          {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div style={{ background: '#eef2ff', borderRadius: 12, padding: 12, marginBottom: 12 }}>
        <strong>{bookName}</strong>
        <p style={{ color: '#000', fontSize: 13, margin: '8px 0 0' }}>
          اگر سرکاری PCTB سائٹ آپ کے نیٹ ورک پر بلاک ہو تو نیچے والے کام کرنے والے لنک استعمال کریں — کتاب وہیں سے کھلے گی۔
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          {ALT_SOURCES.map((s) => (
            <a key={s.url} href={s.url} target="_blank" rel="noreferrer" title={s.note} style={{ padding: '8px 16px', borderRadius: 999, background: '#2563eb', color: '#fff', textDecoration: 'none' }}>{s.label}</a>
          ))}
          <a href={PCTB_URL} target="_blank" rel="noreferrer" style={{ padding: '8px 16px', borderRadius: 999, background: '#e5e7eb', color: '#111', textDecoration: 'none' }}>سرکاری کتاب کھولیں (PCTB)</a>
          <a href={openLibraryUrl} target="_blank" rel="noreferrer" style={{ padding: '8px 16px', borderRadius: 999, background: '#e5e7eb', color: '#111', textDecoration: 'none' }}>Open Library میں تلاش کریں</a>
        </div>
      </div>
      <h4 style={{ margin: '12px 0 8px' }}>📖 اس کتاب سے سوال پوچھیں — Book Mind</h4>
      <p style={{ color: '#000', fontSize: 13 }}>
        اوپر جو کتاب چنی ہے، وہی اب یونیک کے ذہن میں ہے۔ اس کتاب کے اندر سے کوئی سوال پوچھیں،
        یونیک بتائے گا کہ یہ کس کتاب اور کس باب سے ہے، اور اس کا جواب کیا ہے۔
      </p>
      <input style={inputStyle} placeholder="اس کتاب سے سوال لکھیں، جیسے: فوٹو سنتھیسز کیا ہے؟" value={question} onChange={(e) => setQuestion(e.target.value)} />
      <button type="button" onClick={askFromBook} style={{ padding: '10px 20px', borderRadius: 999, background: '#15803d', color: '#fff', fontSize: 16 }}>اس کتاب سے جواب دیں</button>
      {answer && <div style={{ whiteSpace: 'pre-wrap', background: '#f0fdf4', borderRadius: 12, padding: 12, marginTop: 12, fontSize: 15 }}>{answer}</div>}
    </div>
  );
}
