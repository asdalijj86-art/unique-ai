// Study Studio — STUDY SYSTEM, user order 2026-11-28 (voice).
// A study panel that comes forward when named (front-simple rule:
// everything hidden behind, comes forward when named). It does NOT
// duplicate the document engine: «اسائنمنٹ بناؤ» / «سی وی بناؤ»
// open Document Studio with the study context (class, subject,
// topic, source) carried over.
//
// What lives here:
//  - class picker (primary 1–5, middle 6–8, matric 9–10, inter
//    11–12, college/university) + subject picker (GENERAL list —
//    no single board's syllabus is hardcoded anywhere)
//  - exam preparation actions: revision plan, practice/mock
//    questions, past-paper-style practice, exam time management
//  - upcoming: the next saved exam/class + what comes next, how the
//    next class builds on this one, what to study in advance
//  - source input: a video link OR pasted text becomes the
//    assignment source — note EVERYTHING, copy exactly, swap ONLY
//    name + ID (standing video-to-document rule). HONEST LIMIT: a
//    video link is used as the source AS GIVEN — watching/fetching
//    it needs the live model + internet on the user's laptop; pasted
//    text works anywhere. The UI never claims a video was watched
//    when it was only linked.
import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import {
  STUDY_LEVELS,
  STUDY_SUBJECTS,
  TEXT_SOURCE_NOTE,
  VIDEO_SOURCE_HONEST_NOTE,
  classifyStudySource,
  studyLevelLabel,
  studySubjectLabel,
  type StudyContext,
  type StudyExam,
  type StudyLevelId,
  type StudySource,
} from '@/lib/study';
import type { DocumentStudioInitial } from './DocumentStudio';

export type StudyStudioProps = {
  context: StudyContext;
  onContextChange: (ctx: StudyContext) => void;
  /** Ask in chat (sends the text as the user's message). */
  onAsk: (text: string) => void;
  /** Open Document Studio with the study context carried over. */
  onOpenDocument: (initial: DocumentStudioInitial) => void;
  onClose: () => void;
};

function daysUntil(month: number, day: number, now = Date.now()): number {
  const today = new Date(now);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  let occ = new Date(today.getFullYear(), month - 1, day).getTime();
  if (occ < startOfToday) occ = new Date(today.getFullYear() + 1, month - 1, day).getTime();
  return Math.round((occ - startOfToday) / (24 * 60 * 60 * 1000));
}

export default function StudyStudio({ context, onContextChange, onAsk, onOpenDocument, onClose }: StudyStudioProps) {
  const [selectedLevel, setSelectedLevel] = useState<StudyLevelId | undefined>(context.levelId);
  const [selectedClass, setSelectedClass] = useState<number | undefined>(context.classNum);
  const [selectedSubject, setSelectedSubject] = useState<string | undefined>(context.subjectId);
  const [sourceInput, setSourceInput] = useState('');
  const [source, setSource] = useState<StudySource | null>(null);
  const [topic, setTopic] = useState('');

  const level = STUDY_LEVELS.find((l) => l.id === selectedLevel);
  const contextLine = useMemo(() => {
    const parts: string[] = [];
    const lv = studyLevelLabel({ ...context, levelId: selectedLevel, classNum: selectedClass });
    if (lv) parts.push(lv);
    const sj = studySubjectLabel({ ...context, subjectId: selectedSubject });
    if (sj) parts.push(`مضمون: ${sj}`);
    return parts.length > 0 ? parts.join(' • ') : 'ابھی کلاس اور مضمون نہیں چنا گیا — نیچے سے چنیں۔';
  }, [context, selectedLevel, selectedClass, selectedSubject]);

  function applyContext(next: Partial<StudyContext>) {
    const merged: StudyContext = { ...context, ...next, exams: context.exams };
    onContextChange(merged);
  }

  function pickLevel(id: StudyLevelId) {
    setSelectedLevel(id);
    setSelectedClass(undefined);
    applyContext({ levelId: id, classNum: undefined });
  }

  function pickClass(n: number) {
    setSelectedClass(n);
    applyContext({ classNum: n });
  }

  function pickSubject(id: string) {
    setSelectedSubject(id);
    applyContext({ subjectId: id });
  }

  const nextExam: { exam: StudyExam; days: number } | null = useMemo(() => {
    const list = (context.exams || [])
      .map((e) => ({ exam: e, days: daysUntil(e.month, e.day) }))
      .filter((x) => x.days >= 0)
      .sort((a, b) => a.days - b.days);
    return list[0] ?? null;
  }, [context.exams]);

  function askWithContext(base: string) {
    const ctxBits: string[] = [];
    const lv = studyLevelLabel({ ...context, levelId: selectedLevel, classNum: selectedClass });
    if (lv) ctxBits.push(lv);
    const sj = studySubjectLabel({ ...context, subjectId: selectedSubject });
    if (sj) ctxBits.push(sj);
    const ctx = ctxBits.length > 0 ? ` (${ctxBits.join('، ')})` : '';
    onAsk(`${base}${ctx}`);
  }

  function openDocument(kind: 'assignment' | 'cv') {
    const initial: DocumentStudioInitial = {
      category: kind,
      levelId: selectedLevel,
      classNum: selectedClass,
      subjectId: selectedSubject,
      topic: topic.trim() || undefined,
      source: source ?? undefined,
    };
    onOpenDocument(initial);
  }

  function attachSource() {
    const found = classifyStudySource(sourceInput);
    setSource(found);
  }

  const chip = (active: boolean): React.CSSProperties => ({
    padding: '8px 14px',
    borderRadius: 999,
    background: active ? '#2563eb' : '#e5e7eb',
    color: active ? '#fff' : '#000',
    border: 'none',
    cursor: 'pointer',
    fontSize: 14,
  });

  return (
    <div style={{ background: '#fff', color: '#000', borderRadius: 16, padding: 16, margin: 12, boxShadow: '0 4px 24px rgba(0,0,0,.12)', maxHeight: '85vh', overflowY: 'auto' }} data-testid="study-studio">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, color: '#000' }}>📚 سٹڈی سٹوڈیو — Study Studio</h3>
        <button type="button" onClick={onClose} aria-label="بند کریں"><X size={18} /></button>
      </div>
      <p style={{ color: '#000', fontSize: 14 }}>
        پڑھائی، ہوم ورک، امتحان کی تیاری — چھوٹی کلاس سے کالج تک۔ جواب مکمل ملے گا، یا صاف کہہ دیا جائے گا کہ یہ مجھے یقینی طور پر نہیں آتا۔
      </p>
      <p style={{ color: '#000', fontSize: 14, background: '#eff6ff', borderRadius: 12, padding: 10 }}>
        {contextLine}
      </p>

      <h4 style={{ color: '#000' }}>کلاس چنیں</h4>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        {STUDY_LEVELS.map((l) => (
          <button key={l.id} type="button" onClick={() => pickLevel(l.id)} style={chip(selectedLevel === l.id)} data-testid={`study-level-${l.id}`}>
            {l.label}
          </button>
        ))}
      </div>
      {level && level.classes.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          {level.classes.map((n) => (
            <button key={n} type="button" onClick={() => pickClass(n)} style={chip(selectedClass === n)} data-testid={`study-class-${n}`}>
              کلاس {n}
            </button>
          ))}
        </div>
      )}

      <h4 style={{ color: '#000' }}>مضمون چنیں</h4>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {STUDY_SUBJECTS.map((s) => (
          <button key={s.id} type="button" onClick={() => pickSubject(s.id)} style={chip(selectedSubject === s.id)} data-testid={`study-subject-${s.id}`}>
            {s.urdu} ({s.label})
          </button>
        ))}
      </div>

      <h4 style={{ color: '#000' }}>امتحان کی تیاری</h4>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <button type="button" onClick={() => askWithContext('ریویژن پلان بناؤ')} style={chip(false)} data-testid="study-action-revision-plan">📋 ریویژن پلان بناؤ</button>
        <button type="button" onClick={() => askWithContext('مشق سوالات دو')} style={chip(false)} data-testid="study-action-practice">✏️ مشق سوالات دو</button>
        <button type="button" onClick={() => askWithContext('پاسٹ پیپر طرز کے سوالات دو')} style={chip(false)} data-testid="study-action-past-paper">📝 پاسٹ پیپر طرز کے سوالات دو</button>
        <button type="button" onClick={() => askWithContext('امتحان کے لیے وقت کا انتظام بتاؤ')} style={chip(false)} data-testid="study-action-time">⏰ وقت کا انتظام بتاؤ</button>
      </div>

      <h4 style={{ color: '#000' }}>آگے کیا ہے — اگلی تیاری</h4>
      {nextExam ? (
        <div style={{ background: '#f0fdf4', borderRadius: 12, padding: 12, marginBottom: 12, color: '#000' }}>
          <p style={{ margin: '0 0 8px' }}>
            اگلا امتحان: <strong>{nextExam.exam.label}</strong> — {nextExam.days === 0 ? 'آج ہے' : nextExam.days === 1 ? 'کل ہے (1 دن رہ گیا ہے)' : `${nextExam.days} دن رہ گئے ہیں`}۔
          </p>
          <button type="button" onClick={() => askWithContext(`${nextExam.exam.label} کی تیاری کا منصوبہ بناؤ`)} style={chip(false)} data-testid="study-action-exam-plan">
            📋 اس امتحان کی تیاری کا منصوبہ بناؤ
          </button>
        </div>
      ) : (
        <p style={{ color: '#000', fontSize: 14, background: '#fefce8', borderRadius: 12, padding: 10 }}>
          کوئی امتحان محفوظ نہیں ہے — امتحان کی تاریخ چیٹ میں بتا دیں، جیسے «میرا ریاضی کا امتحان 15 دسمبر کو ہے»۔ پھر میں وقت سے پہلے تیاری یاد دلا دوں گی۔
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <button type="button" onClick={() => askWithContext('اگلی کلاس کی تیاری بتاؤ — اگلی کلاس اس کلاس پر کیسے بنتی ہے، اور پہلے سے کیا پڑھوں؟')} style={chip(false)} data-testid="study-action-next-class">
          🔭 اگلی کلاس کی تیاری بتاؤ
        </button>
      </div>

      <h4 style={{ color: '#000' }}>اسائنمنٹ / سی وی بناؤ</h4>
      <p style={{ color: '#000', fontSize: 14 }}>
        ڈاکومنٹ اسٹوڈیو میں بنے گی — کلاس اور مضمون ساتھ جائیں گے، اور لکھائی ایسی ہوگی جیسے آپ نے خود لکھی ہو۔
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <input
          style={{ flex: 1, minWidth: 180, padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 15, color: '#000', background: '#fff' }}
          placeholder="موضوع لکھیں، جیسے Photosynthesis"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          data-testid="study-topic-input"
        />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <button type="button" onClick={() => openDocument('assignment')} style={{ padding: '10px 20px', borderRadius: 999, background: '#15803d', color: '#fff', fontSize: 16 }} data-testid="study-action-assignment">
          📝 اسائنمنٹ بناؤ
        </button>
        <button type="button" onClick={() => openDocument('cv')} style={{ padding: '10px 20px', borderRadius: 999, background: '#2563eb', color: '#fff', fontSize: 16 }} data-testid="study-action-cv">
          📄 سی وی بناؤ
        </button>
      </div>

      <h4 style={{ color: '#000' }}>ماخذ — ویڈیو لنک یا متن</h4>
      <p style={{ color: '#000', fontSize: 14 }}>
        ویڈیو کا لنک دیں یا متن یہیں لکھ دیں — اسائنمنٹ اسی ماخذ سے بنے گی، سب کچھ ویسا کا ویسا، صرف آپ کا نام اور رول نمبر بدلے جائیں گے۔
      </p>
      <textarea
        style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 15, color: '#000', background: '#fff', minHeight: 70 }}
        placeholder="ویڈیو لنک (YouTube وغیرہ) یا متن یہیں لکھیں / پیسٹ کریں"
        value={sourceInput}
        onChange={(e) => setSourceInput(e.target.value)}
        data-testid="study-source-input"
      />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, marginBottom: 8 }}>
        <button type="button" onClick={attachSource} style={{ padding: '8px 16px', borderRadius: 999, background: '#e5e7eb', color: '#000' }} data-testid="study-source-attach">
          ماخذ جوڑیں
        </button>
        {source && (
          <button type="button" onClick={() => openDocument('assignment')} style={{ padding: '8px 16px', borderRadius: 999, background: '#15803d', color: '#fff' }} data-testid="study-source-assignment">
            اس ماخذ سے اسائنمنٹ بناؤ
          </button>
        )}
      </div>
      {source && (
        <p style={{ color: '#000', fontSize: 14, background: '#f0fdf4', borderRadius: 12, padding: 10 }} data-testid="study-source-note">
          {source.kind === 'video' ? VIDEO_SOURCE_HONEST_NOTE : TEXT_SOURCE_NOTE}
          {source.kind === 'video' ? ` لنک: ${source.value}` : ''}
        </p>
      )}
    </div>
  );
}
