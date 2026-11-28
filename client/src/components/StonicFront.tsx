/**
 * StonicFront — the front built from the Stonic video the user showed
 * (2026-11-24, 'The Journey Behind Stonic AI - Zero to Growth'):
 *
 *   - Front nodes ATTACHED to the front: MEMORY / SKILLS / VOICES /
 *     SETTING pill nodes with coloured lines converging into the
 *     central orb — NOT side panels. Clicking a node opens its panel
 *     as a dialog over the front.
 *   - Orb with a TERMINATE / START AI pill below it (mic icon).
 *   - Agent Town (below the chat box): agent chips with status dots and
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
import SilhouetteAvatar from './SilhouetteAvatar';
import FaceLine from './FaceLine';
import VoiceWaveform, { type WaveMode } from './VoiceWaveform';
import AwarenessBubble from './AwarenessBubble';
import { wakeWordReasonLabel } from '../lib/wake-word';
import type { WakeWordStatus } from '../lib/use-wake-word';
import { AGENT_DEFS, agentLabel, type AgentDef, type AgentTaskState } from '../lib/agent-team';
import { isRiskyStepLabel, narrateLineFor, type AgentStep } from '../lib/agent-steps';
import type { BoardEntry } from '../lib/task-board';

export type FrontNodeKey = 'memory' | 'skills' | 'character' | 'settings';

/** Front mode: 'new' = the silhouette panel (2026-11-28, user's
 *  screenshot), 'classic' = the previous cyan-girl face (AiOrb).
 *  A REAL persisted switch — both modes fully work. */
export type FrontMode = 'new' | 'classic';

/** Wake-word state, as the front shows it (from useWakeWord). */
export type WakeWordFrontState = {
  status: WakeWordStatus;
  reason: string;
  supported: boolean;
  listening: boolean;
  heardAt: number | null;
  heardText: string;
  /** Toggle listening on/off (Settings toggle calls the same). */
  onToggle: () => void;
};

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

/**
 * The four lines attached to the face (2026-11-25, FRONT-SIMPLE
 * RULE): thin lines, each with the character's OWN words written
 * ALONG it — Memory on one line, Skills on the next, and so on.
 * Clicking a line opens that thing's panel; otherwise nothing else
 * shows on the front. The MEMORY line carries the newest memory
 * when there is one, else her own words.
 */
const NODE_WORDS: Record<FrontNodeKey, { uniqa: string; unique: string }> = {
  memory: { uniqa: 'میں تمہاری ہر بات یاد رکھتی ہوں', unique: 'میں تمہاری ہر بات یاد رکھتا ہوں' },
  skills: { uniqa: 'میرے ہنر تمہارے کام آتے ہیں', unique: 'میرے ہنر تمہارے کام آتے ہیں' },
  character: { uniqa: 'میں یونیکا ہوں — تمہاری ساتھی', unique: 'میں یونیک ہوں — تمہارا معاون' },
  settings: { uniqa: 'سب کچھ یہیں سے بدلتا ہے', unique: 'سب کچھ یہیں سے بدلتا ہے' },
};

const NODES: { key: FrontNodeKey; icon: string; label: string; urdu: string; color: string; testId: string }[] = [
  { key: 'memory', icon: '🧠', label: 'MEMORY', urdu: 'میموری', color: '#22d3ee', testId: 'button-panel-memory' },
  { key: 'skills', icon: '📖', label: 'SKILLS', urdu: 'مہارتیں', color: '#34d399', testId: 'button-panel-skills' },
  { key: 'character', icon: '🎭', label: 'CHARACTER', urdu: 'کردار', color: '#fb7185', testId: 'button-panel-character' },
  { key: 'settings', icon: '⚙️', label: 'SETTING', urdu: 'سیٹنگز', color: '#60a5fa', testId: 'button-panel-settings' },
];

export function FrontStage({
  persona,
  tone,
  orbSize,
  isSpeaking,
  isThinking,
  isPreparingVoice,
  faceState,
  faceStateLabel,
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
  cameraLive,
  /** Stop Uniqa's camera look (the LIVE pill on the face). */
  onStopCameraLook,
  /** The newest memory, one short line — carried on the MEMORY
   *  line itself when there is one. */
  memoryLine,
  /** TERMINATE / START AI (Stonic screen, 2026-11-26 study): true
   *  while she is asleep/off. State lives in chat.tsx. */
  aiTerminated = false,
  /** Put her to sleep (TERMINATE pill). */
  onTerminate,
  /** Wake her (START AI button). */
  onStartAi,
  /** "What do you remember?" — asks her about her memory. */
  onAskMemory,
  /** Open Uniqa's own side browser (2026-11-28, user order). */
  onOpenBrowser,
  /** STAYED QUIET chip (study reel 6): true when she stayed quiet
   *  because it sounded like he was talking to someone else.
   *  The flag comes from useAwareness; the parent wires it. */
  stayedQuiet = false,
  /** Front mode (2026-11-28): 'new' = silhouette panel from the
   *  user's screenshot, 'classic' = the previous cyan-girl face.
   *  Both fully work; the switch is persisted by the parent. */
  frontMode = 'new',
  /** Switch new ↔ classic (real, persisted). */
  onFrontModeChange,
  /** Mic button in the silhouette bottom bar — same action as the
   *  composer mic (interrupt + listen, or start/stop recording). */
  onMicClick,
  /** "Hey Unique" wake-word state for the listening indicator. */
  wakeWord,
  /** Custom character (Phase 2): the active character's display
   *  name — shown under the face instead of یونیکا/یونیک when set.
   *  Default (unset) keeps the locked Uniqa/Unique names. */
  characterName,
}: {
  persona: 'unique' | 'uniqa';
  tone: 'neutral' | 'serious' | 'romantic';
  orbSize: number;
  isSpeaking: boolean;
  isThinking: boolean;
  isPreparingVoice: boolean;
  faceState: 'listening' | 'thinking' | 'speaking' | 'ready';
  faceStateLabel: string;
  speakingText: string | null;
  /** Custom character display name (Phase 2) — see above. */
  characterName?: string;
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
  /** True while Uniqa's own camera look is running (LIVE pill). */
  cameraLive: boolean;
  /** Stop the camera look (the face pill calls this). */
  onStopCameraLook: () => void;
  /** The newest memory, one short line (or null when there is none). */
  memoryLine: string | null;
  aiTerminated?: boolean;
  onTerminate?: () => void;
  onStartAi?: () => void;
  onAskMemory?: () => void;
  onOpenBrowser?: () => void;
  stayedQuiet?: boolean;
  frontMode?: FrontMode;
  onFrontModeChange?: (mode: FrontMode) => void;
  onMicClick?: () => void;
  wakeWord?: WakeWordFrontState;
}) {
  // While terminated she is asleep: the face dims, the status says
  // so, and the speaking side-box stays hidden.
  const shownFaceStateLabel = aiTerminated
    ? persona === 'uniqa'
      ? '😴 سو رہی ہے — START AI دبائیں'
      : '😴 سو رہا ہے — START AI دبائیں'
    : faceStateLabel;
  const effectivelySpeaking = isSpeaking && !aiTerminated;
  const effectivelyPreparing = isPreparingVoice && !aiTerminated;
  const isNewMode = frontMode === 'new';
  // Silhouette bottom-bar status (the reference panel's line — it
  // says "Uniqa is speaking", NEVER "Love").
  const silStatus = aiTerminated
    ? 'Uniqa is asleep — START AI'
    : effectivelySpeaking || effectivelyPreparing
      ? 'Uniqa is speaking'
      : recording
        ? 'Uniqa is listening…'
        : isThinking
          ? 'Uniqa is thinking…'
          : 'Uniqa is ready';
  const wakeLabel = wakeWord
    ? wakeWord.status === 'listening'
      ? '“Hey Unique” سن رہی ہے — بولیں'
      : wakeWord.status === 'heard'
        ? 'Hey Unique — جی، سن رہی ہوں'
        : wakeWord.status === 'waiting-gesture'
          ? '“Hey Unique” — مائیک کے لیے ایک بار کلک کریں'
          : wakeWord.status === 'off'
            ? '“Hey Unique” بند ہے — آن کرنے کے لیے دبائیں'
            : wakeWord.status === 'unsupported'
              ? '“Hey Unique” — اس براؤزر میں دستیاب نہیں'
              : `“Hey Unique” — ${wakeWordReasonLabel(wakeWord.reason)}`
    : '';
  return (
    <section className={`ufront-stage${isNewMode ? ' usil-mode-new' : ''}`} aria-label="فرنٹ">
      {awarenessBubble && (
        <AwarenessBubble
          line={awarenessBubble.line}
          thinkingLabel={awarenessThinkingLabel}
          onSpeakNow={onAwarenessSpeakNow}
          onDismiss={onAwarenessDismiss}
        />
      )}

      {/* Silhouette panel (2026-11-28, user's screenshot): the dark
          rounded panel holding the top bar, the wake-word indicator,
          the node pills + converging lines, and the avatar frame.
          Classic mode reuses the same shell with no panel styling,
          so the old face renders exactly as before. */}
      <div className={isNewMode ? 'usil-panel' : 'usil-panel-classic'}>
      {/* Top bar (reference): «new» + «classic» pills + gear. The
          pills are a REAL switch — new = silhouette panel, classic
          = the previous cyan-girl face, persisted. Gear opens the
          Settings rows. */}
      <div className="ufront-topbar" dir="ltr">
        <button
          type="button"
          className={`ufront-mode-pill${isNewMode ? ' active' : ''}`}
          onClick={() => onFrontModeChange?.('new')}
          aria-pressed={isNewMode}
          data-testid="button-front-mode-new"
          title="نیا سلیوٹ والا فرنٹ"
        >
          <span className="ufront-mode-dot" aria-hidden="true" /> new
        </button>
        <button
          type="button"
          className={`ufront-mode-pill${!isNewMode ? ' active' : ''}`}
          onClick={() => onFrontModeChange?.('classic')}
          aria-pressed={!isNewMode}
          data-testid="button-front-mode-classic"
          title="پرانا چہرے والا فرنٹ"
        >
          classic
        </button>
        <button
          type="button"
          className="ufront-gear"
          onClick={() => onOpenNode('settings')}
          data-testid="button-front-gear"
          aria-label="سیٹنگز کھولیں"
          title="سیٹنگز"
        >
          ⚙️
        </button>
      </div>

      {/* "Hey Unique" listening indicator — always visible, never
          silent: it says plainly whether she is listening, waiting
          for one click, off, or unsupported in this browser. Tap it
          to turn wake-word listening on/off. */}
      {wakeWord && (
        <button
          type="button"
          className={`uwake-indicator uwake-${wakeWord.status}`}
          onClick={wakeWord.onToggle}
          data-testid="wake-word-indicator"
          title="«Hey Unique» سننا آن / بند کریں — سیٹنگز میں بھی یہی سوئچ ہے"
        >
          <span className="uwake-dot" aria-hidden="true" />
          <span>{wakeLabel}</span>
        </button>
      )}

      {/* Face row (2026-11-25, Stonic front screenshot): node chips in a
          column on the left, elbow lines into the framed face panel,
          the speaking line in its small side box. */}
      <div className="ufront-face-row">
        <div className="ufront-face-core">
          {/* The four LINES attached to the face (FRONT-SIMPLE,
              2026-11-25, user's own words): the lines come OUT OF
              the face itself, radiating from it like Stonic's, and
              the option is written RIGHT ALONG each line — the
              words sit ON the line, which runs straight into the
              face panel. Clicking a line opens that thing's real
              panel (MEMORY = her real memory, SKILLS = real skills,
              and so on — working controls, never decoration). */}
          <div className="unode-lines">
            {NODES.map((n) => {
              const words =
                n.key === 'memory' && memoryLine
                  ? memoryLine.length > 52
                    ? `${memoryLine.slice(0, 52)}…`
                    : memoryLine
                  : NODE_WORDS[n.key][persona];
              return (
                <button
                  key={n.key}
                  type="button"
                  className={`unode-line${activeNode === n.key ? ' active' : ''}`}
                  style={{ ['--node-color' as string]: n.color }}
                  onClick={() => onOpenNode(n.key)}
                  aria-pressed={activeNode === n.key}
                  data-testid={n.testId}
                  title={`${n.urdu} کھولیں — اصل ڈیٹا دکھے گا`}
                >
                  <span className="unode-line-text">
                    <span className="unode-line-label">
                      <span aria-hidden="true">{n.icon}</span> {n.label} · {n.urdu}
                    </span>
                    <span className="unode-line-words" dir="rtl">{words}</span>
                  </span>
                  {n.key === 'memory' && memoryCount > 0 && (
                    <span className="unode-line-badge">{memoryCount}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* The face, in its glowing frame — NEW mode: Uniqa's
              glowing faceless silhouette (2026-11-28, user's
              screenshot) with the mic + status + power bar along
              the bottom, exactly like the reference. CLASSIC mode:
              the previous cyan-girl face (AiOrb) with its lip
              motion while speaking; tap it to interrupt. */}
          <div
            className={`uface-panel${effectivelySpeaking || effectivelyPreparing ? ' tappable' : ''}${aiTerminated ? ' terminated' : ''}${isNewMode ? ' usil-frame' : ''}`}
            onClick={onOrbClick}
            title={effectivelySpeaking || effectivelyPreparing ? 'رکنے کے لیے دبائیں' : undefined}
            data-testid="face-panel"
          >
            <span className="uface-panel-tag" aria-hidden="true">● LIVE</span>
            {cameraLive && (
              <button
                type="button"
                className="uface-cam-live"
                data-testid="camera-live-pill"
                title="کیمرہ آن ہے — یونیکا دیکھ رہی ہے — بند کرنے کے لیے دبائیں"
                onClick={(e) => {
                  e.stopPropagation();
                  onStopCameraLook();
                }}
              >
                <span className="uface-cam-dot" aria-hidden="true" />
                📷 کیمرہ لائیو — بند کریں
              </button>
            )}
            {isNewMode ? (
              <>
                <SilhouetteAvatar isSpeaking={effectivelySpeaking} terminated={aiTerminated} />
                {/* Bottom bar (reference): mic | speaking status |
                    power — all real. Mic = voice input, power =
                    TERMINATE / START AI. The status says "Uniqa is
                    speaking", never "Love". */}
                <div className="usil-bottombar" dir="ltr" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className={`usil-mic${recording ? ' recording' : ''}`}
                    onClick={() => onMicClick?.()}
                    disabled={!onMicClick}
                    data-testid="button-microphone-front"
                    aria-label={recording ? 'ریکارڈنگ روکیں' : 'آواز ریکارڈ کریں'}
                    title="آواز سے بولیں"
                  >
                    {recording ? '⏹' : '🎙️'}
                  </button>
                  <span className="usil-status" data-testid="face-state" title={shownFaceStateLabel}>
                    <span className="usil-status-bars" aria-hidden="true">▂▄▆</span>
                    {silStatus}
                  </span>
                  {aiTerminated ? (
                    <button
                      type="button"
                      className="usil-power"
                      onClick={() => onStartAi?.()}
                      data-testid="button-start-ai"
                      title="یونیکا کو جگائیں"
                    >
                      <span aria-hidden="true">⏻</span> START AI
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="usil-power"
                      onClick={() => onTerminate?.()}
                      data-testid="button-terminate"
                      title="یونیکا کو سلائیں — کچھ حذف نہیں ہوگا، صرف سو جائے گی"
                    >
                      <span aria-hidden="true">⏻</span> TERMINATE
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <AiOrb isSpeaking={effectivelySpeaking} isThinking={isThinking && !aiTerminated} size={orbSize} persona={persona} />
                <div className={`uface-panel-state uface-state-${aiTerminated ? 'ready' : faceState}`} dir="rtl" data-testid="face-state">
                  <span className="uface-state-dot" aria-hidden="true" />
                  {shownFaceStateLabel}
                </div>
              </>
            )}
          </div>
        </div>
        {speakingText && !aiTerminated && (effectivelySpeaking || effectivelyPreparing) && (
          <FaceLine
            text={speakingText}
            label={persona === 'uniqa' ? '💛 یونیکا بول رہی ہے…' : '🤖 یونیک بول رہا ہے…'}
            persona={persona}
          />
        )}
      </div>
      </div>

      {/* TERMINATE / START AI (Stonic screen, 2026-11-26 study) —
          the red pill under the avatar. In NEW mode the power pill
          lives in the silhouette bottom bar (reference), so this row
          keeps only the browser button; in CLASSIC mode the pill
          stays here exactly as before. TERMINATE puts her to sleep
          (face dims, status says so); START AI wakes her. Uses the
          existing .ufront-power CSS — red .active = TERMINATE. */}
      <div className="ufront-power-row" dir="rtl">
        {onOpenBrowser && (
          <button
            type="button"
            className="ufront-browser"
            onClick={onOpenBrowser}
            data-testid="button-open-side-browser"
            title="یونیکا کا اپنا براؤزر — سائٹ کھولیں یا تلاش کریں"
          >
            <span aria-hidden="true">🌐</span> براؤزر
          </button>
        )}
        {!isNewMode && (aiTerminated ? (
          <button
            type="button"
            className="ufront-power"
            onClick={onStartAi}
            data-testid="button-start-ai"
            title="یونیکا کو جگائیں"
          >
            <span aria-hidden="true">🎙️</span> START AI
          </button>
        ) : (
          <button
            type="button"
            className="ufront-power active"
            onClick={onTerminate}
            data-testid="button-terminate"
            title="یونیکا کو سلائیں — کچھ حذف نہیں ہوگا، صرف سو جائے گی"
          >
            <span aria-hidden="true">⏻</span> TERMINATE
          </button>
        ))}
      </div>

      {/* STAYED QUIET (study reel 6): she stayed quiet because it
          sounded like he was talking to someone else — wake word
          is her name. Shown only when the parent says so. */}
      {stayedQuiet && !aiTerminated && (
        <div className="uquiet-chip" dir="rtl" data-testid="stayed-quiet-chip">
          <span aria-hidden="true">🤫</span>
          <span>
            <strong>STAYED QUIET</strong> — لگ رہا تھا آپ کسی اور سے بات کر رہے ہیں۔ مجھے بلانے کے لیے «
            {persona === 'uniqa' ? 'یونیکا' : 'یونیک'}» کہیں۔
          </span>
        </div>
      )}

      <div className="unique-name">
        <span className={`unique-name-text${persona === 'uniqa' ? ' uniqa' : ''}`}>
          {characterName ?? (persona === 'uniqa' ? 'یونیکا' : 'یونیک')}
        </span>
        <span
          className="unique-name-sub"
          dir="rtl"
          style={{ color: persona === 'uniqa' ? '#67e8f9' : undefined }}
        >
          {characterName ? `💛 ${characterName} حاضر ہے` : persona === 'uniqa' ? '💛 یونیکا حاضر ہے' : 'یونیک حاضر ہے'}
          {tone === 'serious' ? ' · سنجیدہ لہجہ' : tone === 'romantic' ? ' · رومینٹک لہجہ' : ''}
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

      <div className="unique-wave">
        <VoiceWaveform mode={waveMode} height={36} />
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

      {/* "What do you remember?" (Stonic screen, 2026-11-26 study) —
          bottom of the centre panel: the question beside a small
          CSS/SVG 3D cube. Tapping it asks her about her memory. */}
      <button
        type="button"
        className="umem-prompt"
        onClick={onAskMemory}
        disabled={!onAskMemory}
        data-testid="button-ask-memory"
        title="یونیکا سے پوچھیں — تمہیں کیا یاد ہے؟"
      >
        <svg className="umem-cube" viewBox="0 0 48 48" aria-hidden="true">
          <polygon points="24,4 44,14 24,24 4,14" fill="#67e8f9" opacity="0.9" />
          <polygon points="4,14 24,24 24,44 4,34" fill="#0891b2" />
          <polygon points="44,14 24,24 24,44 44,34" fill="#155e75" />
          <polygon points="24,4 44,14 24,24 4,14" fill="none" stroke="#a5f3fc" strokeWidth="1.5" />
        </svg>
        <span className="umem-prompt-text" dir="ltr">What do you remember?</span>
        <span className="umem-prompt-urdu" dir="rtl">تمہیں کیا یاد ہے؟</span>
      </button>
    </section>
  );
}

// ---------------------------------------------------------------------------
// AgentTown — the team at work, below the globe (2026-11-26, user's
// order: agents sit on their seats under the map, seen working when
// he gives them a task). Each agent is a SEAT card: avatar circle on
// top, name below, status under it. A working seat shows its task
// (clamped to 2 lines) and the bubble above it carries the screen
// button; the auto-open effect in chat.tsx still fires from state,
// so moving the town here changes nothing about it.
// ---------------------------------------------------------------------------

export function AgentTown({
  tasks,
  boardEntries,
  onOpenAgent,
  onOpenOffice,
}: {
  tasks: AgentTaskState[] | null;
  boardEntries: BoardEntry[];
  onOpenAgent: (key: string) => void;
  onOpenOffice: () => void;
}) {
  const working = (tasks ?? []).filter((t) => t.status === 'working');
  const bubbles = working.slice(0, 3);
  return (
    <section className="utown" data-testid="agent-town" dir="rtl" aria-label="ایجنٹ ٹاؤن — میری ٹیم">
      <div className="utown-title">
        <span>🏢 ایجنٹ ٹاؤن</span>
        {working.length > 0 && <span className="utown-live" aria-label="کام جاری ہے"> ● کام جاری ہے</span>}
        <button type="button" className="utown-office-btn" onClick={onOpenOffice} data-testid="button-office-scene" title="دفتر دیکھیں">
          🏢 دفتر
        </button>
      </div>
      {bubbles.length > 0 && (
        <div className="utown-bubbles">
          {bubbles.map((t) => (
            <span key={t.key} className="utown-bubble" data-testid={`agent-bubble-${t.key}`}>
              <span aria-hidden="true">{t.icon}</span>
              <span>{t.detail ? `${t.label}: ${t.detail}` : `${t.label} کام کر رہا ہے`}</span>
              {/* The working agent's own browser, one tap away —
                  it also opens itself the moment the agent starts
                  working, and this button brings it back if it was
                  closed while the agent still works. */}
              <button
                type="button"
                className="utown-bubble-screen"
                onClick={() => onOpenAgent(t.key)}
                data-testid={`button-agent-screen-${t.key}`}
                title={`${t.label} کی اسکرین دیکھیں`}
              >
                👁️ اسکرین دیکھیں
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="utown-chips">
        <button
          type="button"
          className="utown-chip utown-manager"
          onClick={() => onOpenAgent('uniqa')}
          data-testid="agent-chip-uniqa"
          title="یونیکا — مینیجر — اس کی اسکرین دیکھیں"
        >
          <span className="utown-avatar">
            <span aria-hidden="true">💛</span>
            <span className="utown-dot idle" aria-hidden="true" />
          </span>
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
              <span className="utown-avatar">
                <span aria-hidden="true">{def.icon}</span>
                <span className={`utown-dot${isWorking ? ' working' : ''}`} aria-hidden="true" />
              </span>
              <span className="utown-name">{def.person}</span>
              <span className="utown-state">
                {isWorking
                  ? state?.detail
                    ? <span className="utown-state-task">{state.detail}</span>
                    : 'کام کر رہا ہے'
                  : doneToday > 0 ? `آج ${doneToday} مکمل` : 'فارغ'}
              </span>
            </button>
          );
        })}
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
  /** Phase 2 (computer-agent equivalent): the steps of this job,
   *  with the current one speaking its narration. When a step is
   *  risky the parent asks before it runs — the view only shows. */
  steps = [],
  /** Stop the job (the Stop button + Esc). Missing = no job running. */
  onStop,
}: {
  subject: AgentWorkSubject;
  boardEntries: BoardEntry[];
  onClose: () => void;
  steps?: AgentStep[];
  onStop?: () => void;
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

  // Esc: stop a running job, else close the view.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (subject.status === 'working' && onStop) onStop();
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [subject.status, onStop, onClose]);

  const currentStep = steps.find((s) => s.status === 'active') ?? steps.find((s) => s.status === 'pending');

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
          {subject.status === 'working' && onStop && (
            <button
              type="button"
              className="uwork-stop"
              onClick={onStop}
              data-testid="button-stop-agent-work"
              aria-label="کام روکیں"
              title="کام روکیں — Esc بھی یہی کرتا ہے"
            >
              ⏹ روکیں
            </button>
          )}
          <button type="button" className="uwork-close" onClick={onClose} aria-label="بند کریں" data-testid="button-close-agent-work">
            ✕
          </button>
        </div>
        <div className="uwork-body" dir="rtl">
          <p className="uwork-task">
            <strong>کام:</strong> {subject.detail || subject.blurb}
          </p>
          {steps.length > 0 && (
            <div className="uwork-steps" data-testid="agent-work-steps">
              <div className="upanel-section-title">📋 کام کے مراحل</div>
              <ol className="uwork-steps-list">
                {steps.map((s) => (
                  <li key={s.id} className={`uwork-step uwork-step-${s.status}`}>
                    <span aria-hidden="true">
                      {s.status === 'done' ? '✅' : s.status === 'active' ? '🔄' : s.status === 'failed' ? '❌' : '⏳'}
                    </span>
                    <span className="uwork-step-label">{s.label}</span>
                    {isRiskyStepLabel(s.label) && <span className="uwork-step-risky">⚠️ احتیاط والا مرحلہ</span>}
                  </li>
                ))}
              </ol>
              {currentStep && (
                <p className="uwork-narration" data-testid="agent-work-narration">
                  💬 {narrateLineFor(currentStep)}
                </p>
              )}
            </div>
          )}
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
