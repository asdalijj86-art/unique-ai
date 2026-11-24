/**
 * StonicFront — the front built from the Stonic video the user showed
 * (2026-11-24, 'The Journey Behind Stonic AI - Zero to Growth'):
 *
 *   - Front nodes ATTACHED to the front: MEMORY / SKILLS / VOICES /
 *     SETTING pill nodes with coloured lines converging into the
 *     central orb — NOT side panels. Clicking a node opens its panel
 *     as a dialog over the front.
 *   - Orb with a TERMINATE / START AI pill below it (mic icon).
 *   - Agent Town (bottom-centre): agent chips with status dots and
 *     thought bubbles; clicking a chip opens that agent's OWN live
 *     work view (real Wikipedia search + its real task), and the same
 *     view opens itself when an agent is given a task.
 *   - The speaking line lives in a SMALL SIDE BOX next to the orb
 *     (user correction: full message, scrollable, nothing hidden).
 *
 * Own Unique brand, name and colours throughout — nothing here copies
 * Stonic's code, name or exact design.
 */

import { useEffect, useRef, useState } from 'react';
import AiOrb from './AiOrb';
import FaceLine from './FaceLine';
import VoiceWaveform, { type WaveMode } from './VoiceWaveform';
import AwarenessBubble from './AwarenessBubble';
import { AGENT_DEFS, agentLabel, type AgentDef, type AgentTaskState } from '../lib/agent-team';
import type { BoardEntry } from '../lib/task-board';

export type FrontNodeKey = 'memory' | 'skills' | 'voices' | 'settings';

// ---------------------------------------------------------------------------
// NodeDialog — a node panel as a centered dialog over the front.
// ---------------------------------------------------------------------------

export function NodeDialog({
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
    <div
      className="ufront-dialog-overlay"
      data-testid={testId}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ufront-dialog" role="dialog" aria-label={title}>
        <div className="ufront-dialog-head" dir="rtl">
          <span className="ufront-dialog-title">{title}</span>
          <button type="button" className="ufront-dialog-close" onClick={onClose} aria-label="بند کریں">
            ✕
          </button>
        </div>
        <div className="ufront-dialog-body">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// VoicesPanel — who speaks: Uniqa first, Unique only when summoned.
// ---------------------------------------------------------------------------

export function VoicesPanel({
  persona,
  onPersonaChange,
  tone,
  onToneChange,
  onTestVoice,
}: {
  persona: 'unique' | 'uniqa';
  onPersonaChange: (p: 'unique' | 'uniqa') => void;
  tone: 'neutral' | 'serious' | 'romantic';
  onToneChange: (t: 'neutral' | 'serious' | 'romantic') => void;
  onTestVoice: () => void;
}) {
  const PERSONAS: { v: 'unique' | 'uniqa'; t: string; d: string }[] = [
    { v: 'uniqa', t: '💛 یونیکا', d: 'آپ کی ساتھی — سامنے، سب سے پہلے بولتی ہے' },
    { v: 'unique', t: '🤖 یونیک', d: 'آپ کا اصل معاون — صرف بلانے پر آتا ہے' },
  ];
  const TONES: { v: 'neutral' | 'serious' | 'romantic'; t: string }[] = [
    { v: 'neutral', t: 'عام' },
    { v: 'serious', t: 'سنجیدہ' },
    { v: 'romantic', t: 'رومینٹک' },
  ];
  return (
    <div className="upanel" data-testid="panel-voices" dir="rtl">
      <p className="upanel-intro">کون بول رہا ہے — آواز اور لہجہ یہیں سے بدلیں۔</p>
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
      <button type="button" className="upanel-refresh" onClick={onTestVoice} data-testid="button-test-voice">
        🔊 آواز کا ٹیسٹ سنیں
      </button>
      <p className="upanel-empty">
        یونیک کو بلانے کے لیے «یونیک کو بلاؤ» کہیں — وہ آ کر بات کرے گا، پھر یونیکا واپس آ جائے گی۔
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FrontStage — nodes + orb + power pill + side box.
// ---------------------------------------------------------------------------

const NODES: { key: FrontNodeKey; icon: string; label: string; urdu: string; color: string; testId: string }[] = [
  { key: 'memory', icon: '🧠', label: 'MEMORY', urdu: 'میموری', color: '#22d3ee', testId: 'button-panel-memory' },
  { key: 'skills', icon: '🛠️', label: 'SKILLS', urdu: 'مہارتیں', color: '#a78bfa', testId: 'button-panel-skills' },
  { key: 'voices', icon: '🎙️', label: 'VOICES', urdu: 'آوازیں', color: '#f9a8d4', testId: 'button-panel-voices' },
  { key: 'settings', icon: '⚙️', label: 'SETTING', urdu: 'سیٹنگز', color: '#34d399', testId: 'button-panel-settings' },
];

export function FrontStage({
  persona,
  tone,
  orbSize,
  isSpeaking,
  isThinking,
  isPreparingVoice,
  isActive,
  faceState,
  faceStateLabel,
  heroStatus,
  speakingText,
  waveMode,
  recording,
  recordingLabel,
  voiceStatus,
  attachedImage,
  onClearAttach,
  awarenessBubble,
  awarenessThinkingLabel,
  onAwarenessSpeakNow,
  onAwarenessDismiss,
  memoryCount,
  activeNode,
  onOpenNode,
  onOrbClick,
  onStopSpeech,
  onStartAI,
  onTerminate,
  onOpenCall,
}: {
  persona: 'unique' | 'uniqa';
  tone: 'neutral' | 'serious' | 'romantic';
  orbSize: number;
  isSpeaking: boolean;
  isThinking: boolean;
  isPreparingVoice: boolean;
  isActive: boolean;
  faceState: 'listening' | 'thinking' | 'speaking' | 'ready';
  faceStateLabel: string;
  heroStatus: string;
  speakingText: string | null;
  waveMode: WaveMode;
  recording: boolean;
  recordingLabel: string;
  voiceStatus: string;
  attachedImage: string | null;
  onClearAttach: () => void;
  awarenessBubble: { line: string } | null;
  awarenessThinkingLabel: string;
  onAwarenessSpeakNow: () => void;
  onAwarenessDismiss: () => void;
  memoryCount: number;
  activeNode: FrontNodeKey | null;
  onOpenNode: (key: FrontNodeKey) => void;
  onOrbClick: () => void;
  onStopSpeech: () => void;
  onStartAI: () => void;
  onTerminate: () => void;
  /** Open the «📞 کال — کہیں سے بھی» panel (Stonic Remote-style). */
  onOpenCall: () => void;
}) {
  return (
    <section className="ufront-stage" aria-label="فرنٹ">
      {/* Connector lines: each node joins the orb (desktop only). */}
      <svg className="ufront-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <line x1="11" y1="12" x2="50" y2="42" stroke="#22d3ee" />
        <line x1="89" y1="12" x2="50" y2="42" stroke="#a78bfa" />
        <line x1="11" y1="88" x2="50" y2="42" stroke="#f9a8d4" />
        <line x1="89" y1="88" x2="50" y2="42" stroke="#34d399" />
      </svg>

      {/* The four nodes — attached to the front, not side panels. */}
      <div className="ufront-nodes">
        {NODES.map((n) => (
          <button
            key={n.key}
            type="button"
            className={`ufront-node ufront-node-${n.key}${activeNode === n.key ? ' active' : ''}`}
            style={{ ['--node-color' as string]: n.color }}
            onClick={() => onOpenNode(n.key)}
            aria-pressed={activeNode === n.key}
            data-testid={n.testId}
          >
            <span className="ufront-node-icon" aria-hidden="true">{n.icon}</span>
            <span className="ufront-node-label">{n.label}</span>
            <span className="ufront-node-urdu">{n.urdu}</span>
            {n.key === 'memory' && memoryCount > 0 && (
              <span className="ufront-node-badge">{memoryCount}</span>
            )}
          </button>
        ))}
      </div>

      {awarenessBubble && (
        <AwarenessBubble
          line={awarenessBubble.line}
          thinkingLabel={awarenessThinkingLabel}
          onSpeakNow={onAwarenessSpeakNow}
          onDismiss={onAwarenessDismiss}
        />
      )}

      <div className="ufront-orb-row">
        <div
          className={`unique-orb-wrap${isSpeaking || isPreparingVoice ? ' tappable' : ''}`}
          onClick={onOrbClick}
          title={isSpeaking || isPreparingVoice ? 'رکنے کے لیے دبائیں' : undefined}
        >
          <AiOrb isSpeaking={isSpeaking} isThinking={isThinking} size={orbSize} persona={persona} />
        </div>
        {speakingText && (isSpeaking || isPreparingVoice) && (
          <FaceLine
            text={speakingText}
            label={persona === 'uniqa' ? '💛 یونیکا بول رہی ہے…' : '🤖 یونیک بول رہا ہے…'}
            persona={persona}
          />
        )}
      </div>

      <div className="unique-name">
        <span className={`unique-name-text${persona === 'uniqa' ? ' uniqa' : ''}`}>
          {persona === 'uniqa' ? 'یونیکا' : 'یونیک'}
        </span>
        <span
          className="unique-name-sub"
          dir="rtl"
          style={{ color: persona === 'uniqa' ? '#f0a6c8' : undefined }}
        >
          {persona === 'uniqa' ? '💛 یونیکا حاضر ہے' : 'یونیک حاضر ہے'}
          {tone === 'serious' ? ' · سنجیدہ لہجہ' : tone === 'romantic' ? ' · رومینٹک لہجہ' : ''}
        </span>
        <span className="unique-name-sub" dir="rtl" data-testid="text-avatar-status">{heroStatus}</span>
        <span className={`uface-state uface-state-${faceState}`} dir="rtl" data-testid="face-state">
          <span className="uface-state-dot" aria-hidden="true" />
          {faceStateLabel}
        </span>
        {(isSpeaking || isThinking || isPreparingVoice) && (
          <button
            type="button"
            className="ustop-btn"
            onClick={onStopSpeech}
            data-testid="button-stop-speech"
            aria-label="بولنا یا کام روکیں"
            title="رکو — Esc بھی یہی کرتا ہے"
          >
            ⏹ رکو
          </button>
        )}
      </div>

      {/* START AI / TERMINATE — the assistant's power pill. */}
      <button
        type="button"
        className={`ufront-power${isActive ? ' active' : ''}`}
        onClick={isActive ? onTerminate : onStartAI}
        data-testid="button-ai-power"
        title={isActive ? 'کام اور آواز روکیں' : 'یونیکا کو چالو کریں — وہ سنے گی'}
      >
        <span aria-hidden="true">🎙️</span>
        <span>{isActive ? 'TERMINATE' : 'START AI'}</span>
      </button>

      {/* 📞 کال — کہیں سے بھی (Stonic Remote-style): the front door to
          the call screen. The signalling lives in DevicePairing. */}
      <button
        type="button"
        className="ufront-call"
        onClick={onOpenCall}
        data-testid="button-open-call"
        title="فون سے یونیک کو کال کریں — لیپ ٹاپ آن ہو تو کہیں سے بھی"
      >
        <span aria-hidden="true">📞</span>
        <span>کال کریں — کہیں سے بھی</span>
      </button>

      <div className="unique-wave">
        <VoiceWaveform mode={waveMode} height={56} />
      </div>
      {voiceStatus || recording ? (
        <div className="unique-voice-status" dir="rtl" data-testid="status-continuous-voice">
          <span className="unique-voice-pulse" aria-hidden="true" />
          <span>{recording ? `ریکارڈ ہو رہا ہے · ${recordingLabel}` : voiceStatus}</span>
        </div>
      ) : null}
      {attachedImage ? (
        <div className="unique-attach-preview" dir="ltr">
          {attachedImage.startsWith('data:video/') ? (
            <video src={attachedImage} className="unique-attach-thumb" muted />
          ) : (
            <img src={attachedImage} alt="منسلک فائل" className="unique-attach-thumb" />
          )}
          <button
            type="button"
            className="unique-attach-remove"
            onClick={onClearAttach}
            aria-label="فائل ہٹائیں"
          >
            ✕
          </button>
          <span className="unique-attach-hint">{attachedImage.startsWith('data:video/') ? 'ویڈیو تیار ہے — سوال لکھیں یا بھیج دیں 🎬' : 'تصویر تیار ہے — سوال لکھیں یا بھیج دیں 📷'}</span>
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// AgentTown — the team at work, bottom-centre of the front.
// ---------------------------------------------------------------------------

export function AgentTown({
  tasks,
  boardEntries,
  persona,
  uniqaStatus,
  onOpenAgent,
  onOpenOffice,
}: {
  tasks: AgentTaskState[] | null;
  boardEntries: BoardEntry[];
  persona: 'unique' | 'uniqa';
  uniqaStatus: string;
  onOpenAgent: (key: string) => void;
  onOpenOffice: () => void;
}) {
  const working = (tasks ?? []).filter((t) => t.status === 'working');
  const bubbles = working.slice(0, 3);
  return (
    <section className="utown" data-testid="agent-town" dir="rtl" aria-label="ایجنٹ ٹاؤن — میری ٹیم">
      <div className="utown-title">🏢 ایجنٹ ٹاؤن — میری ٹیم</div>
      {bubbles.length > 0 ? (
        <div className="utown-bubbles">
          {bubbles.map((t) => (
            <span key={t.key} className="utown-bubble" data-testid={`agent-bubble-${t.key}`}>
              <span aria-hidden="true">{t.icon}</span>
              <span>{t.detail ? `${t.label}: ${t.detail}` : `${t.label} کام کر رہا ہے`}</span>
            </span>
          ))}
        </div>
      ) : (
        <p className="utown-quiet">
          {persona === 'uniqa' ? `💛 یونیکا: ${uniqaStatus}` : 'سب ایجنٹ تیار ہیں — کوئی کام دیں تو وہ یہیں اپنی اسکرین کے ساتھ دکھے گا۔'}
        </p>
      )}
      <div className="utown-chips">
        <button
          type="button"
          className="utown-chip utown-manager"
          onClick={() => onOpenAgent('uniqa')}
          data-testid="agent-chip-uniqa"
          title="یونیکا — مینیجر — اس کی اسکرین دیکھیں"
        >
          <span className="utown-dot idle" aria-hidden="true" />
          <span aria-hidden="true">💛</span>
          <span className="utown-name">یونیکا</span>
          <span className="utown-state">مینیجر</span>
        </button>
        {AGENT_DEFS.map((def: AgentDef) => {
          const state = tasks?.find((t) => t.key === def.key);
          const isWorking = state?.status === 'working';
          const doneToday = boardEntries.filter((e) => e.agentKey === def.key).length;
          return (
            <button
              key={def.key}
              type="button"
              className={`utown-chip${isWorking ? ' working' : ''}`}
              onClick={() => onOpenAgent(def.key)}
              data-testid={`agent-chip-${def.key}`}
              title={`${agentLabel(def)} — اس کی اسکرین دیکھیں`}
            >
              <span className={`utown-dot${isWorking ? ' working' : ''}`} aria-hidden="true" />
              <span aria-hidden="true">{def.icon}</span>
              <span className="utown-name">{def.person}</span>
              <span className="utown-state">
                {isWorking ? 'کام کر رہا ہے' : doneToday > 0 ? `آج ${doneToday} مکمل` : 'فارغ'}
              </span>
            </button>
          );
        })}
        <button type="button" className="utown-office" onClick={onOpenOffice} data-testid="button-office-scene">
          🏢 دفتر
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// AgentWorkView — an agent's OWN live work/browser view over the front.
// Live search is real: Wikipedia's public OpenSearch API (CORS-enabled).
// ---------------------------------------------------------------------------

type WikiResult = { title: string; desc: string; url: string };

async function searchWiki(query: string): Promise<WikiResult[]> {
  const isUrdu = /[\u0600-\u06FF]/.test(query);
  const lang = isUrdu ? 'ur' : 'en';
  const url =
    `https://${lang}.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}` +
    `&limit=6&namespace=0&format=json&origin=*`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Wikipedia ${res.status}`);
  const data: unknown = await res.json();
  if (!Array.isArray(data) || !Array.isArray(data[1]) || !Array.isArray(data[2]) || !Array.isArray(data[3])) {
    return [];
  }
  const titles = data[1] as unknown[];
  const descs = data[2] as unknown[];
  const urls = data[3] as unknown[];
  return titles.map((t, i) => ({
    title: String(t ?? ''),
    desc: String(descs[i] ?? ''),
    url: String(urls[i] ?? ''),
  })).filter((r) => r.title && r.url);
}

export type AgentWorkSubject = {
  key: string;
  icon: string;
  label: string;
  blurb: string;
  detail?: string;
  status: 'working' | 'done' | 'failed' | 'idle';
};

export function AgentWorkView({
  subject,
  boardEntries,
  onClose,
}: {
  subject: AgentWorkSubject;
  boardEntries: BoardEntry[];
  onClose: () => void;
}) {
  const initialQuery = subject.detail || subject.blurb;
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<WikiResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchedQuery, setSearchedQuery] = useState('');
  const doneToday = boardEntries.filter((e) => e.agentKey === subject.key);

  const runSearch = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setSearching(true);
    setSearchError('');
    try {
      const out = await searchWiki(trimmed);
      setResults(out);
      setSearchedQuery(trimmed);
    } catch {
      setResults([]);
      setSearchError('تلاش نہیں ہو سکی — انٹرنیٹ چیک کریں اور دوبارہ کوشش کریں۔');
    } finally {
      setSearching(false);
    }
  };

  // Live on open: the agent searches its own task right away.
  const firstRunRef = useRef(false);
  useEffect(() => {
    if (firstRunRef.current) return;
    firstRunRef.current = true;
    void runSearch(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusLabel =
    subject.status === 'working' ? 'کام کر رہا ہے'
    : subject.status === 'done' ? 'مکمل — رپورٹ چیٹ میں آ گئی ہے'
    : subject.status === 'failed' ? 'ناکام رہا'
    : 'فارغ';

  return (
    <div
      className="uwork-overlay"
      data-testid="agent-work-view"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="uwork-panel" role="dialog" aria-label={`${subject.label} کی اسکرین`}>
        <div className="uwork-head" dir="rtl">
          <span className="uwork-title">
            <span aria-hidden="true">{subject.icon}</span> {subject.label} کی اسکرین
          </span>
          <span className={`uwork-status uwork-status-${subject.status}`} dir="rtl">{statusLabel}</span>
          <button type="button" className="uwork-close" onClick={onClose} aria-label="بند کریں" data-testid="button-close-agent-work">
            ✕
          </button>
        </div>
        <div className="uwork-body" dir="rtl">
          <p className="uwork-task">
            <strong>کام:</strong> {subject.detail || subject.blurb}
          </p>
          <form
            className="uwork-search"
            onSubmit={(e) => {
              e.preventDefault();
              void runSearch(query);
            }}
          >
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="تلاش کریں…"
              aria-label="تلاش کریں"
              data-testid="input-agent-search"
            />
            <button type="submit" disabled={searching} data-testid="button-agent-search">
              {searching ? 'تلاش ہو رہی ہے…' : '🔎 تلاش'}
            </button>
            <button
              type="button"
              onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(query.trim() || subject.label)}`, '_blank', 'noopener')}
              data-testid="button-agent-google"
            >
              Google میں کھولیں
            </button>
          </form>
          {searchError ? (
            <p className="uwork-empty">{searchError}</p>
          ) : searching ? (
            <p className="uwork-empty">تلاش ہو رہی ہے…</p>
          ) : searchedQuery ? (
            results.length === 0 ? (
              <p className="uwork-empty">«{searchedQuery}» کے لیے کوئی نتیجہ نہیں ملا — کچھ اور لکھ کر دیکھیں۔</p>
            ) : (
              <ul className="uwork-results">
                {results.map((r) => (
                  <li key={r.url} className="uwork-result">
                    <a href={r.url} target="_blank" rel="noopener noreferrer" dir="auto">{r.title}</a>
                    {r.desc ? <span className="uwork-result-desc">{r.desc}</span> : null}
                    <span className="uwork-result-src">Wikipedia سے — لائیو</span>
                  </li>
                ))}
              </ul>
            )
          ) : null}
          {doneToday.length > 0 && (
            <div className="uwork-done">
              <div className="upanel-section-title">✅ آج مکمل کیے گئے کام</div>
              <ul className="upanel-list">
                {doneToday.slice(-5).map((e, i) => (
                  <li key={i} className="upanel-item">
                    <span className="upanel-item-text">{e.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="uwork-note">
            یہ ایجنٹ کی اپنی اسکرین ہے — جو کچھ یہ ڈھونڈتا ہے، وہ یہیں نظر آتا ہے۔ کام مکمل ہوتے ہی اس کی رپورٹ چیٹ میں آ جاتی ہے۔
          </p>
        </div>
      </div>
    </div>
  );
}
