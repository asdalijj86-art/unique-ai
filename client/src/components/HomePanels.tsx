/**
 * HomePanels — the four panels around the living face (Phase 1,
 * 2026-11-22): MEMORY / SKILLS / CHARACTER / SETTINGS, plus the
 * agents strip. Every panel shows REAL data and every button does
 * the real thing — no decoration, no dead controls.
 *
 * MEMORY — the notes and learnings actually stored on this device
 * (unique-ai-notes / unique-ai-learnings), with real delete buttons.
 * SKILLS — the five working studios plus the three focus views;
 * each button opens the real thing. No Video Maker: it was removed
 * by the user's order on 2026-10-31 and is still disabled in code.
 * CHARACTER — who is present (Unique / Uniqa), the لہجہ, and the
 * seven agents with their LIVE status from the task board.
 */

import { useEffect, useState } from 'react';
import { AGENT_DEFS, agentLabel, type AgentTaskState } from '../lib/agent-team';
import { loadLearnings, saveLearnings, type Learning } from '../lib/learnings';
import { loadNotes, saveNotes, type Note } from '../lib/memory';
import type { BoardEntry } from '../lib/task-board';

// ---------------------------------------------------------------------------
// PanelDrawer — bottom sheet on phones, docked panel on laptops.
// ---------------------------------------------------------------------------

export function PanelDrawer({
  title,
  onClose,
  children,
  testId,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <div className="upanel-drawer-overlay" data-testid={testId} onClick={onClose}>
      <div
        className="upanel-drawer"
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="upanel-drawer-head" dir="rtl">
          <span className="upanel-drawer-title">{title}</span>
          <button type="button" className="upanel-drawer-close" onClick={onClose} aria-label="بند کریں">
            ✕
          </button>
        </div>
        <div className="upanel-drawer-body">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MEMORY — real notes + learnings from this device, deletable.
// ---------------------------------------------------------------------------

export function MemoryPanel() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [learnings, setLearnings] = useState<Learning[]>([]);

  const refresh = () => {
    try {
      setNotes(loadNotes(window.localStorage));
    } catch {
      setNotes([]);
    }
    try {
      setLearnings(loadLearnings(window.localStorage));
    } catch {
      setLearnings([]);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const deleteNote = (id: string) => {
    const next = notes.filter((n) => n.id !== id);
    saveNotes(window.localStorage, next);
    setNotes(next);
  };

  const deleteLearning = (id: string) => {
    const next = learnings.filter((l) => l.id !== id);
    saveLearnings(window.localStorage, next);
    setLearnings(next);
  };

  return (
    <div className="upanel" data-testid="panel-memory" dir="rtl">
      <p className="upanel-intro">
        یہ وہی باتیں ہیں جو میں نے آپ سے سیکھیں — صرف اسی ڈیوائس پر محفوظ ہیں۔
      </p>
      <div className="upanel-section-title">📌 یادداشت</div>
      {notes.length === 0 ? (
        <p className="upanel-empty">
          ابھی کوئی یادداشت نہیں — جب آپ مجھے «یاد رکھو» کہیں گے، وہ یہیں آ جائے گی۔
        </p>
      ) : (
        <ul className="upanel-list">
          {notes.map((n) => (
            <li key={n.id} className="upanel-item">
              <span className="upanel-item-text">{n.text}</span>
              <button
                type="button"
                className="upanel-item-delete"
                onClick={() => deleteNote(n.id)}
                aria-label="یہ یادداشت مٹائیں"
                data-testid={`button-delete-note-${n.id}`}
              >
                🗑️
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="upanel-section-title">💡 سیکھا ہوا</div>
      {learnings.length === 0 ? (
        <p className="upanel-empty">ابھی کچھ سیکھا نہیں — ہر گفتگو سے میں کچھ نہ کچھ سیکھتا ہوں۔</p>
      ) : (
        <ul className="upanel-list">
          {learnings.map((l) => (
            <li key={l.id} className="upanel-item">
              <span className="upanel-item-text">{l.text}</span>
              <button
                type="button"
                className="upanel-item-delete"
                onClick={() => deleteLearning(l.id)}
                aria-label="یہ سیکھ مٹائیں"
                data-testid={`button-delete-learning-${l.id}`}
              >
                🗑️
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="upanel-refresh" onClick={refresh} data-testid="button-memory-refresh">
        ↻ تازہ کریں
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SKILLS — the working studios. Every button opens the real thing.
// ---------------------------------------------------------------------------

export type StudioKey = 'library' | 'document' | 'media' | 'islamic' | 'game';
export type FocusViewKey = 'map' | 'whatsapp' | 'quran';

const STUDIOS: { key: StudioKey; icon: string; label: string; desc: string }[] = [
  { key: 'library', icon: '📚', label: 'لائبریری', desc: 'پنجاب ٹیکسٹ بک بورڈ کی کتابیں اور باب' },
  { key: 'document', icon: '📄', label: 'ڈاکومنٹ اسٹوڈیو', desc: 'CV اور اسائنمنٹ — 22 ٹیمپلیٹس، PDF/Word' },
  { key: 'media', icon: '🎬', label: 'میڈیا اسٹوڈیو', desc: 'ویڈیو اور فوٹو ایڈیٹر — کاٹیں، جوڑیں، ایکسپورٹ کریں' },
  { key: 'islamic', icon: '🕌', label: 'اسلامی اسٹوڈیو', desc: 'قرآن، حدیث، دعا اور اذکار' },
  { key: 'game', icon: '🎮', label: 'گیم اسٹوڈیو', desc: '6 کھیلنے والے کھیل — آسان، نارمل، مشکل' },
];

const FOCUS_VIEWS: { key: FocusViewKey; icon: string; label: string; desc: string }[] = [
  { key: 'quran', icon: '📖', label: 'قرآن پاک', desc: 'سورتیں، پارے، تلاوت اور ترجمہ' },
  { key: 'map', icon: '🗺️', label: 'نقشہ', desc: 'جگہیں، راستے اور قریبی مقامات' },
  { key: 'whatsapp', icon: '💬', label: 'WhatsApp', desc: 'اپنے رابطوں کو پیغام بھیجیں' },
];

export function SkillsPanel({
  onOpenStudio,
  onOpenFocus,
}: {
  onOpenStudio: (key: StudioKey) => void;
  onOpenFocus: (key: FocusViewKey) => void;
}) {
  return (
    <div className="upanel" data-testid="panel-skills" dir="rtl">
      <p className="upanel-intro">یہ سب کچھ میں واقعی کر سکتا ہوں — کسی بھی چیز کو چھونے پر وہ کھل جائے گی۔</p>
      <div className="upanel-section-title">🛠️ اسٹوڈیو</div>
      <div className="uskills-grid">
        {STUDIOS.map((s) => (
          <button
            key={s.key}
            type="button"
            className="uskills-card"
            onClick={() => onOpenStudio(s.key)}
            data-testid={`button-skill-${s.key}`}
          >
            <span className="uskills-icon">{s.icon}</span>
            <span className="uskills-label">{s.label}</span>
            <span className="uskills-desc">{s.desc}</span>
          </button>
        ))}
      </div>
      <div className="upanel-section-title">📍 دیگر سہولتیں</div>
      <div className="uskills-grid">
        {FOCUS_VIEWS.map((f) => (
          <button
            key={f.key}
            type="button"
            className="uskills-card"
            onClick={() => onOpenFocus(f.key)}
            data-testid={`button-skill-${f.key}`}
          >
            <span className="uskills-icon">{f.icon}</span>
            <span className="uskills-label">{f.label}</span>
            <span className="uskills-desc">{f.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CHARACTER — persona + tone + the seven agents, live.
// ---------------------------------------------------------------------------

export function CharacterPanel({
  persona,
  onPersonaChange,
  tone,
  onToneChange,
  tasks,
  boardEntries,
  onOpenOffice,
}: {
  persona: 'unique' | 'uniqa';
  onPersonaChange: (p: 'unique' | 'uniqa') => void;
  tone: 'neutral' | 'serious' | 'romantic';
  onToneChange: (t: 'neutral' | 'serious' | 'romantic') => void;
  tasks: AgentTaskState[] | null;
  boardEntries: BoardEntry[];
  onOpenOffice: () => void;
}) {
  const PERSONAS: { v: 'unique' | 'uniqa'; t: string; d: string }[] = [
    { v: 'unique', t: '🤖 یونیک', d: 'آپ کا اصل معاون — صرف بلانے پر آتا ہے' },
    { v: 'uniqa', t: '💛 یونیکا', d: 'آپ کی ساتھی — سامنے، سب سے پہلے' },
  ];
  const TONES: { v: 'neutral' | 'serious' | 'romantic'; t: string }[] = [
    { v: 'neutral', t: 'عام' },
    { v: 'serious', t: 'سنجیدہ' },
    { v: 'romantic', t: 'رومینٹک' },
  ];
  return (
    <div className="upanel" data-testid="panel-character" dir="rtl">
      <p className="upanel-intro">یہ میں ہوں — اور یہ میری سات ایجنٹوں کی ٹیم ہے جو آپ کے لیے کام کرتی ہے۔</p>
      <div className="upanel-section-title">💛 کون حاضر ہے؟</div>
      <div className="uagent-personas">
        {PERSONAS.map((p) => (
          <button
            key={p.v}
            type="button"
            className={`uagent-persona ${persona === p.v ? 'active' : ''}`}
            onClick={() => onPersonaChange(p.v)}
            aria-pressed={persona === p.v}
            data-testid={`button-persona-${p.v}`}
          >
            <span className="uagent-persona-name">{p.t}</span>
            <span className="uagent-persona-desc">{p.d}</span>
          </button>
        ))}
      </div>
      <div className="upanel-section-title">🎭 لہجہ</div>
      <div className="utone-row">
        {TONES.map((t) => (
          <button
            key={t.v}
            type="button"
            className={`utone-chip ${tone === t.v ? 'active' : ''}`}
            onClick={() => onToneChange(t.v)}
            aria-pressed={tone === t.v}
            data-testid={`button-tone-${t.v}`}
          >
            {t.t}
          </button>
        ))}
      </div>
      <div className="upanel-section-title">👥 میری ٹیم — سات ایجنٹ</div>
      <ul className="upanel-list">
        {AGENT_DEFS.map((def) => {
          const state = tasks?.find((t) => t.key === def.key);
          const doneToday = boardEntries.filter((e) => e.agentKey === def.key).length;
          return (
            <li key={def.key} className="upanel-item">
              <span className={`uagent-dot ${state?.status === 'working' ? 'working' : ''}`} aria-hidden="true" />
              <span className="upanel-item-text">
                {agentLabel(def)}
                {state?.status === 'working' ? ' — کام کر رہا ہے' : ''}
                {doneToday > 0 ? ` — آج ${doneToday} کام مکمل` : ''}
              </span>
            </li>
          );
        })}
      </ul>
      <button type="button" className="upanel-refresh" onClick={onOpenOffice} data-testid="button-open-office">
        🏢 دفتر کا بڑا منظر دیکھیں
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AgentsStrip — the seven agents, live, in one horizontal row.
// ---------------------------------------------------------------------------

export function AgentsStrip({
  tasks,
  boardEntries,
  onOpenOffice,
}: {
  tasks: AgentTaskState[] | null;
  boardEntries: BoardEntry[];
  onOpenOffice: () => void;
}) {
  return (
    <div className="uagents-strip" data-testid="agents-strip" dir="rtl">
      {AGENT_DEFS.map((def) => {
        const state = tasks?.find((t) => t.key === def.key);
        const working = state?.status === 'working';
        const doneToday = boardEntries.filter((e) => e.agentKey === def.key).length;
        return (
          <span key={def.key} className={`uagents-chip ${working ? 'working' : ''}`} title={agentLabel(def)}>
            <span className={`uagents-dot ${working ? 'working' : ''}`} aria-hidden="true" />
            <span className="uagents-icon">{def.icon}</span>
            <span className="uagents-name">{def.person}</span>
            {working ? (
              <span className="uagents-state">کام کر رہا ہے</span>
            ) : doneToday > 0 ? (
              <span className="uagents-state">آج {doneToday} مکمل</span>
            ) : (
              <span className="uagents-state">فارغ</span>
            )}
          </span>
        );
      })}
      <button type="button" className="uagents-office" onClick={onOpenOffice} data-testid="button-office-scene">
        🏢 دفتر
      </button>
    </div>
  );
}
