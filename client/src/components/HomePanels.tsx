/**
 * HomePanels — the four panels around the living face (Phase 1,
 * 2026-11-22): MEMORY / SKILLS / CHARACTER / SETTINGS, plus the
 * agents strip. Every panel shows REAL data and every button does
 * the real thing — no decoration, no dead controls.
 *
 * MEMORY — the notes and learnings actually stored on this device
 * (unique-ai-notes / unique-ai-learnings for Uniqa, the '-unique'
 * keys for Unique — per-persona since 2026-11-25), with real delete
 * buttons and a switcher to view either persona's memory.
 * SKILLS — the five working studios plus the three focus views;
 * each button opens the real thing. No Video Maker: it was removed
 * by the user's order on 2026-10-31 and is still disabled in code.
 * CHARACTER — who is present (Unique / Uniqa), the لہجہ, and the
 * seven agents with their LIVE status from the task board.
 */

import { useEffect, useRef, useState } from 'react';
import { secureAppStorage } from '@/lib/secure-app-storage';
import { AGENT_DEFS, agentLabel, type AgentTaskState } from '../lib/agent-team';
import { loadLearnings, saveLearnings, type Learning, type MemoryPersona } from '../lib/learnings';
import { loadNotes, saveNotes, type Note } from '../lib/memory';
import {
  addVisualMemory,
  deleteVisualMemory,
  downscaleImageFile,
  loadVisualMemories,
  makeVisualMemory,
  type VisualMemory,
} from '../lib/visual-memories';
import {
  isSkillEnabled,
  SKILL_LABELS,
  type SkillKey,
  type SkillsEnabledMap,
} from '../lib/skills-toggle';
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

export function MemoryPanel({
  refreshSignal = 0,
  persona = 'uniqa',
}: {
  refreshSignal?: number;
  /** The persona currently speaking. The panel opens on THEIR memory;
   *  the switcher below only changes what is VIEWED — never who is
   *  speaking (2026-11-25, per-persona memory). */
  persona?: MemoryPersona;
}) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [learnings, setLearnings] = useState<Learning[]>([]);
  /** Whose memory is being viewed. Starts on the speaking persona;
   *  switching here is view-only — it never calls onPersonaChange. */
  const [viewPersona, setViewPersona] = useState<MemoryPersona>(persona);
  // Visual memories (Phase 2, Stonic v3.1.25): photo + its story.
  const [visuals, setVisuals] = useState<VisualMemory[]>([]);
  const [vmPhoto, setVmPhoto] = useState<string | null>(null);
  const [vmStory, setVmStory] = useState('');
  const [vmTitle, setVmTitle] = useState('');
  const [vmNotice, setVmNotice] = useState('');
  const [vmBusy, setVmBusy] = useState(false);
  const vmFileRef = useRef<HTMLInputElement | null>(null);

  const refresh = () => {
    try {
      setNotes(loadNotes(secureAppStorage, viewPersona));
    } catch {
      setNotes([]);
    }
    try {
      setLearnings(loadLearnings(secureAppStorage, viewPersona));
    } catch {
      setLearnings([]);
    }
    try {
      setVisuals(loadVisualMemories(secureAppStorage).filter((m) => m.persona === viewPersona));
    } catch {
      setVisuals([]);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  // When the speaking persona changes (summoned by name), the panel
  // follows them — the viewed memory is theirs again.
  useEffect(() => {
    setViewPersona(persona);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persona]);

  // Core Memory (2026-11-24): the list updates as the conversation
  // goes — the parent bumps refreshSignal on every new message.
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal, viewPersona]);

  const deleteNote = (id: string) => {
    const next = notes.filter((n) => n.id !== id);
    saveNotes(secureAppStorage, next, viewPersona);
    setNotes(next);
  };

  const deleteLearning = (id: string) => {
    const next = learnings.filter((l) => l.id !== id);
    saveLearnings(secureAppStorage, next, viewPersona);
    setLearnings(next);
  };

  async function onVmFile(file: File | undefined) {
    if (!file) return;
    setVmBusy(true);
    setVmNotice('');
    try {
      const dataUrl = await downscaleImageFile(file);
      setVmPhoto(dataUrl);
      setVmNotice('تصویر تیار ہے — اب اس کی کہانی لکھیں۔');
    } catch (e) {
      setVmNotice(e instanceof Error ? e.message : 'تصویر تیار نہیں ہو سکی۔');
    } finally {
      setVmBusy(false);
    }
  }

  function saveVisual() {
    if (!vmPhoto) { setVmNotice('پہلے تصویر چنیں۔'); return; }
    const made = makeVisualMemory(vmPhoto, vmStory, viewPersona, vmTitle);
    if (!made) { setVmNotice('کہانی لکھیں — تصویر کی کہانی کے بغیر یادداشت نہیں بنتی۔'); return; }
    const next = addVisualMemory(secureAppStorage, made);
    setVisuals(next.filter((m) => m.persona === viewPersona));
    setVmPhoto(null);
    setVmStory('');
    setVmTitle('');
    setVmNotice('✅ تصویری یادداشت محفوظ ہو گئی۔');
  }

  function removeVisual(id: string) {
    const next = deleteVisualMemory(secureAppStorage, id);
    setVisuals(next.filter((m) => m.persona === viewPersona));
  }

  return (
    <div className="upanel" data-testid="panel-memory" dir="rtl">
      <p className="upanel-intro">
        یہ وہی باتیں ہیں جو میں نے آپ سے سیکھیں — صرف اسی ڈیوائس پر محفوظ ہیں۔
      </p>
      {/* Whose memory is this? (2026-11-25, per-persona memory) */}
      <div className="umem-who" dir="rtl" data-testid="memory-persona-switcher">
        <span className="umem-who-label">
          {viewPersona === 'uniqa' ? '💛 یونیکا کی میموری' : '💙 یونیک کی میموری'}
        </span>
        <span className="umem-who-btns" role="group" aria-label="کس کی میموری دیکھیں">
          <button
            type="button"
            className={`umem-who-btn${viewPersona === 'uniqa' ? ' active' : ''}`}
            onClick={() => setViewPersona('uniqa')}
            aria-pressed={viewPersona === 'uniqa'}
            data-testid="button-memory-view-uniqa"
          >
            💛 یونیکا
          </button>
          <button
            type="button"
            className={`umem-who-btn${viewPersona === 'unique' ? ' active' : ''}`}
            onClick={() => setViewPersona('unique')}
            aria-pressed={viewPersona === 'unique'}
            data-testid="button-memory-view-unique"
          >
            💙 یونیک
          </button>
        </span>
      </div>
      <p className="umem-who-note">
        صرف دیکھ رہے ہیں — بولنے والا {persona === 'uniqa' ? 'یونیکا' : 'یونیک'} ہی رہے گا۔
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

      {/* VISUAL MEMORIES (Phase 2, Stonic v3.1.25): a photo as a
          memory, with its story. Photos are downscaled on the way
          in; nothing leaves this device. */}
      <div className="upanel-section-title">📷 تصویری یادیں</div>
      <p className="upanel-empty">
        کوئی تصویر یادداشت کے طور پر رکھیں — ساتھ اس کی کہانی۔ تصویر چھوٹی کر کے محفوظ ہوتی ہے۔
      </p>
      <input
        ref={vmFileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => { void onVmFile(e.target.files?.[0]); e.target.value = ''; }}
        data-testid="input-visual-memory-photo"
      />
      {vmPhoto && (
        <div className="uvmem-preview">
          <img src={vmPhoto} alt="نئی تصویری یادداشت" className="uvmem-thumb" />
        </div>
      )}
      <div className="uvmem-form">
        <input
          type="text"
          value={vmTitle}
          maxLength={80}
          onChange={(e) => setVmTitle(e.target.value)}
          placeholder="عنوان (اختیاری)"
          data-testid="input-visual-memory-title"
        />
        <textarea
          value={vmStory}
          maxLength={500}
          rows={2}
          onChange={(e) => setVmStory(e.target.value)}
          placeholder="اس تصویر کی کہانی لکھیں…"
          data-testid="input-visual-memory-story"
        />
        <div className="uvmem-actions">
          <button type="button" onClick={() => vmFileRef.current?.click()} disabled={vmBusy} data-testid="button-visual-memory-pick">
            📷 تصویر چنیں
          </button>
          <button type="button" onClick={saveVisual} disabled={vmBusy || !vmPhoto} data-testid="button-visual-memory-save">
            ✅ یادداشت محفوظ کریں
          </button>
        </div>
      </div>
      {vmNotice && (
        <p className="upanel-empty" role="status" data-testid="visual-memory-notice">{vmNotice}</p>
      )}
      {visuals.length === 0 ? (
        <p className="upanel-empty">ابھی کوئی تصویری یادداشت نہیں۔</p>
      ) : (
        <ul className="uvmem-list">
          {visuals.map((m) => (
            <li key={m.id} className="uvmem-item" data-testid={`visual-memory-${m.id}`}>
              <img src={m.photo} alt={m.title || 'تصویری یادداشت'} className="uvmem-thumb" />
              <span className="uvmem-body">
                {m.title && <strong>{m.title} — </strong>}
                <span>{m.story}</span>
              </span>
              <button
                type="button"
                className="upanel-item-delete"
                onClick={() => removeVisual(m.id)}
                aria-label="یہ تصویری یادداشت مٹائیں"
                data-testid={`button-delete-visual-memory-${m.id}`}
              >
                🗑️
              </button>
            </li>
          ))}
        </ul>
      )}
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
  customSkills = [],
  onNewSkill,
  onDeleteSkill,
  /** On/off map (Phase 2): missing = ON. */
  skillsEnabled = {},
  onToggleSkill,
}: {
  onOpenStudio: (key: StudioKey) => void;
  onOpenFocus: (key: FocusViewKey) => void;
  /** User-created skills (lib/custom-skills) — listed here, created
   *  from the «نئی مہارت بنائیں» button. */
  customSkills?: { id: string; name: string; description: string; instructions: string }[];
  onNewSkill?: () => void;
  onDeleteSkill?: (id: string) => void;
  skillsEnabled?: SkillsEnabledMap;
  onToggleSkill?: (key: SkillKey) => void;
}) {
  const customOn = isSkillEnabled(skillsEnabled, 'custom');
  return (
    <div className="upanel" data-testid="panel-skills" dir="rtl">
      <p className="upanel-intro">یہ سب کچھ میں واقعی کر سکتا ہوں — کسی بھی چیز کو چھونے پر وہ کھل جائے گی۔ ہر مہارت کا سوئچ بھی یہیں ہے — بند کریں تو وہ رک جاتی ہے، مٹتی نہیں۔</p>
      <div className="upanel-section-title">🛠️ اسٹوڈیو</div>
      <div className="uskills-grid">
        {STUDIOS.map((s) => {
          const on = isSkillEnabled(skillsEnabled, s.key);
          return (
            <div key={s.key} className={`uskills-wrap${on ? '' : ' off'}`}>
              <button
                type="button"
                className="uskills-card"
                onClick={() => onOpenStudio(s.key)}
                disabled={!on}
                aria-disabled={!on}
                data-testid={`button-skill-${s.key}`}
              >
                <span className="uskills-icon">{s.icon}</span>
                <span className="uskills-label">{s.label}</span>
                <span className="uskills-desc">{on ? s.desc : 'بند ہے — سوئچ سے آن کریں'}</span>
              </button>
              {onToggleSkill && (
                <button
                  type="button"
                  className={`uskills-toggle${on ? ' on' : ''}`}
                  onClick={() => onToggleSkill(s.key)}
                  aria-pressed={on}
                  aria-label={`${SKILL_LABELS[s.key]} ${on ? 'بند کریں' : 'آن کریں'}`}
                  data-testid={`button-skill-toggle-${s.key}`}
                >
                  {on ? '✅ آن ہے' : '⏸️ بند ہے'}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="upanel-section-title">✨ میری بنائی ہوئی مہارتیں</div>
      {onToggleSkill && (
        <button
          type="button"
          className={`uskills-toggle${customOn ? ' on' : ''}`}
          onClick={() => onToggleSkill('custom')}
          aria-pressed={customOn}
          data-testid="button-skill-toggle-custom"
        >
          {customOn ? '✅ میری مہارتیں آن ہیں' : '⏸️ میری مہارتیں بند ہیں'}
        </button>
      )}
      {customSkills.length === 0 ? (
        <p className="upanel-empty">ابھی کوئی اپنی مہارت نہیں بنائی — نیچے والے بٹن سے بنائیں۔</p>
      ) : (
        <ul className="upanel-list">
          {customSkills.map((s) => (
            <li key={s.id} className="upanel-item">
              <span className="upanel-item-text">
                <strong>{s.name}</strong>
                {s.description ? ` — ${s.description}` : ''}
              </span>
              {onDeleteSkill && (
                <button
                  type="button"
                  className="upanel-item-delete"
                  onClick={() => onDeleteSkill(s.id)}
                  aria-label="یہ مہارت مٹائیں"
                  data-testid={`button-delete-skill-${s.id}`}
                >
                  🗑️
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {onNewSkill && (
        <button type="button" className="upanel-refresh" onClick={onNewSkill} disabled={!customOn} data-testid="button-new-skill">
          ＋ نئی مہارت بنائیں
        </button>
      )}
      <div className="upanel-section-title">📍 دیگر سہولتیں</div>
      <div className="uskills-grid">
        {FOCUS_VIEWS.map((f) => {
          const on = isSkillEnabled(skillsEnabled, f.key);
          return (
            <div key={f.key} className={`uskills-wrap${on ? '' : ' off'}`}>
              <button
                type="button"
                className="uskills-card"
                onClick={() => onOpenFocus(f.key)}
                disabled={!on}
                aria-disabled={!on}
                data-testid={`button-skill-${f.key}`}
              >
                <span className="uskills-icon">{f.icon}</span>
                <span className="uskills-label">{f.label}</span>
                <span className="uskills-desc">{on ? f.desc : 'بند ہے — سوئچ سے آن کریں'}</span>
              </button>
              {onToggleSkill && (
                <button
                  type="button"
                  className={`uskills-toggle${on ? ' on' : ''}`}
                  onClick={() => onToggleSkill(f.key)}
                  aria-pressed={on}
                  aria-label={`${SKILL_LABELS[f.key]} ${on ? 'بند کریں' : 'آن کریں'}`}
                  data-testid={`button-skill-toggle-${f.key}`}
                >
                  {on ? '✅ آن ہے' : '⏸️ بند ہے'}
                </button>
              )}
            </div>
          );
        })}
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
