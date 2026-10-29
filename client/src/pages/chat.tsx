import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import {
  AudioLines,
  Bot,
  Clock3,
  Mic,
  MicOff,
  Plus,
  Send,
  Shield,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import {
  synthesizeMairaSpeech,
  synthesizeEdgeSpeech,
  useSendMairaChatMessage,
  getGeminiKeys,
  TTS_PLAYBACK_RATE,
} from '@/lib/api';
import { synthesizeSalmanClientSide, synthesizeUniqaClientSide } from '@/lib/edge-tts';
import {
  runVoiceReply,
  isDuplicateHeard,
  failureReasonText,
  legDiagnosticText,
  type VoiceOutcome,
} from '@/lib/voice-player';
import {
  type Persona,
  type ToneMode,
  PERSONA_STORAGE_KEY,
  TONE_STORAGE_KEY,
  readStoredPersona,
  readStoredTone,
  personaDisplayName,
  pickUrduMaleVoiceFrom,
  pickUrduFemaleVoiceFrom,
  detectPersonaSummon,
  detectToneCommand,
  pickLine,
  UNIQA_GREETINGS,
  UNIQUE_GREETINGS,
  BANTER_TO_UNIQA,
  BANTER_TO_UNIQUE,
} from '@/lib/persona';
import {
  parseMemoryCommand,
  applyMemoryCommand,
  memoryConfirmation,
} from '@/lib/memory';
import {
  learnFromText,
  loadLearnings,
  buildRecallBlock,
  formatLearningsList,
} from '@/lib/learnings';
import { loadLastDocument } from '@/lib/doc-pdf';
import { isVideoMakerStatusQuery, loadVideoMakerJob, shouldInterceptVideoMakerStatus, videoMakerStatusText } from '@/lib/video-maker';
import VideoJobIndicator from '@/components/VideoJobIndicator';
import { parseSurahReference, surahDisplayName } from '@/lib/surah-names';
import {
  loadBoardEntries,
  recordBoardCompletion,
  isRecordableAction,
  formatBoardTime,
  type BoardEntry,
} from '@/lib/task-board';
import {
  collectBackup,
  serializeBackup,
  backupFileName,
  parseBackup,
  summarizeBackup,
  applyBackup,
  parseBackupCommand,
  type BrainBackup,
  type BackupSummary,
} from '@/lib/backup';
import DevicePairing, { type ConversationHandover, type RemoteCommand, type CallUiState, type CallControl } from '@/components/DevicePairing';
import { queryAllPermissions, requestAllPermissions } from '@/lib/permissions';
import { registerAudioStop, stopOtherAudio } from '@/lib/audio-bus';
import { parseWebsiteCommand } from '@/lib/voice-commands';
import { useGestures } from '@/hooks/useGestures';
import { GESTURE_LABELS, type GestureName } from '@/lib/gestures';
import AppBuilder from '@/components/AppBuilder';
import ToolResults from '@/components/ToolResults';
import { AgentTeamStrip, AgentTeamScene, AgentOfficePanel } from '@/components/AgentTeam';
import {
  detectAgentTasks,
  workingCards,
  finalizeCards,
  agentForActionType,
  AGENT_DEFS,
  type AgentDef,
  type AgentTaskState,
} from '@/lib/agent-team';
import MediaTools, { type MediaToolName, type HubSection, resolveToolOpen } from '@/components/MediaTools';
import AiOrb from '@/components/AiOrb';
import VoiceWaveform, { type WaveMode } from '@/components/VoiceWaveform';
import StatusPanel from '@/components/StatusPanel';
import MapWidget from '@/components/MapWidget';
import WhatsAppSender from '@/components/WhatsAppSender';
import QuranReader from '@/components/QuranReader';
import type { ChatAction } from '@/lib/api';

type ChatRole = 'user' | 'assistant';
type ChatMessage = { id: string; role: ChatRole; content: string; createdAt: string; image?: string };
type Conversation = { id: string; title: string; updatedAt: string; messages: ChatMessage[] };

// TEAM CONTEXT (2026-10-24, his standing order): when he asks any team
// member about their work («حسن کیا کر رہا ہے؟», «میڈیا کی رپورٹ دو»),
// the brain must answer in that member's own first person, in FULL
// spoken detail — name, duty, capabilities, today's REAL completed
// tasks and current status. The brain cannot know any of that from
// the chat history alone, so this block rides with every send: the
// seven duties (single source: AGENT_DEFS), today's real board pins
// (only server-confirmed completions, never invented), the in-flight
// strip, and the builder's live job. When nothing is recorded for a
// member, the brain says plainly that they have no task today yet.
function buildTeamBlock(
  entries: BoardEntry[],
  team: AgentTaskState[] | null,
  build: { title: string; startedAt: number } | null,
): string | undefined {
  const duties = AGENT_DEFS.map((d) => `${d.person} (${d.duty}): ${d.blurb}`).join(' | ');
  const parts = [`Team: ${duties}`];
  const today = entries.slice(-20);
  if (today.length) {
    parts.push(`Aaj ke mukammal kaam: ${today.map((e) => `${e.person} — ${e.label} (${formatBoardTime(e.at)})`).join('; ')}`);
  }
  if (team) {
    const working = team.filter((t) => t.status === 'working');
    if (working.length) {
      parts.push(`Abhi kaam mein: ${working.map((t) => `${t.label}${t.detail ? ` (${t.detail})` : ''}`).join('; ')}`);
    }
  }
  if (build) parts.push(`Builder ka jaari kaam: ${build.title}`);
  return parts.join(' || ');
}

// Router-hijack guard (2026-10-22): local canned commands (focus views,
// surah recitation, website opens) may fire ONLY on command-shaped
// utterances — short, the way an order is actually phrased. A long or
// conversational message must ALWAYS fall through to the chat brain;
// a canned line must never answer it. (His ~100-word plan request was
// answered «جی، قرآن پاک کھول رہا ہوں۔» — the class of bug this kills,
// together with the matching server-side gate in brain.js.)
const COMMAND_WORD_LIMIT = 12;
function countWords(text: string): number {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}
function isCommandShapedText(text: string, limit = COMMAND_WORD_LIMIT): boolean {
  const n = countWords(text);
  return n > 0 && n <= limit;
}

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: {
    resultIndex: number;
    results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
  }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: new () => BrowserSpeechRecognition;
  webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
};
const STORAGE_KEY = 'maira-ai-conversations-v1';
const suggestions = [
  'آج کے دن کی منصوبہ بندی میں مدد کریں',
  'کسی بات کو آسان الفاظ میں سمجھائیں',
  'ایک اچھا پیغام لکھنے میں مدد کریں',
  'Mujhe kuch samajhna hai',
];

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function readConversations(): Conversation[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is Conversation =>
      Boolean(item && typeof item.id === 'string' && typeof item.title === 'string' && Array.isArray(item.messages)),
    );
  } catch {
    return [];
  }
}

function renderMessageContent(content: string): ReactNode {
  const parts = content.split(/(https?:\/\/[^\s]+)/g);
  if (parts.length === 1) return content;
  return (
    <>
      {parts.map((part, index) => (/^https?:\/\//.test(part) ? (
        <a key={index} href={part} target="_blank" rel="noopener noreferrer" className="message-link" dir="ltr">{part}</a>
      ) : (
        <span key={index}>{part}</span>
      )))}
    </>
  );
}

function getErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data?: unknown }).data;
    if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
      return data.error;
    }
  }
  return 'پیغام بھیجنے میں مسئلہ ہوا۔ براہِ کرم دوبارہ کوشش کریں۔';
}

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>(readConversations);
  const [activeId, setActiveId] = useState<string | null>(() => readConversations()[0]?.id ?? null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  // SPEECH NOTICE (2026-10-26 truncation fix): a VISIBLE banner for a
  // reply that ended early — never only the 24px X icon's tooltip
  // (the old setError rendering, which the user missed with Settings
  // open). Set for dropped chunks and for an audible reply stopped
  // by tap / stop-phrase / barge-in / chat switch; cleared on the
  // next send and by its own dismiss button. Never set for a reply
  // the user stopped before it spoke, and never for a fresh send.
  const [speechNotice, setSpeechNotice] = useState('');
  // Text offered for replay when a reply ends `failed`/`partial`
  // (2026-10-26 voice rebuild: a failed reply must never end in
  // silence with no way back — the banner carries a Replay button
  // for exactly this text; cleared on the next send / success / stop).
  const [speechReplayText, setSpeechReplayText] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [storageError, setStorageError] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  // Chat language selector (top bar): 'auto' = detect from typed text.
  const [chatLang, setChatLang] = useState(() => {
    try { return localStorage.getItem('unique-ai-chat-lang') || 'auto'; }
    catch { return 'auto'; }
  });
  // PERSONAS (Master Plan Phase 2): who is "present" — Unique (male,
  // the default, Salman voice) or Uniqa (female companion, her own
  // voice). She speaks ONLY when summoned by name or picked in
  // Settings; the default on first run is Unique. Tone (لہجہ) is
  // independent: serious/romantic until changed. Both persist.
  const [persona, setPersona] = useState<Persona>(() => readStoredPersona());
  const [tone, setTone] = useState<ToneMode>(() => readStoredTone());
  const personaRef = useRef(persona);
  const toneRef = useRef(tone);
  // Banter gate: at most once per session per direction (see
  // handlePersonaCommand) — refs, deliberately not persisted.
  const banterUsedRef = useRef<Set<string>>(new Set());
  function changePersona(next: Persona) {
    personaRef.current = next;
    setPersona(next);
    try { localStorage.setItem(PERSONA_STORAGE_KEY, next); } catch { /* ignore */ }
  }
  function changeTone(next: ToneMode) {
    toneRef.current = next;
    setTone(next);
    try { localStorage.setItem(TONE_STORAGE_KEY, next); } catch { /* ignore */ }
  }
  // True while the server TTS reply is being fetched/buffered — the orb shows
  // "preparing" until audio actually starts playing (onplaying), so the UI
  // never claims to be speaking during the network wait.
  const [isPreparingVoice, setIsPreparingVoice] = useState(false);
  const [gesturesEnabled, setGesturesEnabled] = useState(false);
  // App settings (persisted to localStorage)
  const [appSettings, setAppSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('unique-ai-settings');
      if (saved) return JSON.parse(saved);
    } catch {}
    return { locationEnabled: true, voiceEnabled: true, continuousVoice: false, gesturesEnabled: false };
  });
  const [appBuild, setAppBuild] = useState<{ description: string } | null>(null);
  const [toolAction, setToolAction] = useState<ChatAction | null>(null);
  // Helper-agent team (Task D): when ONE message runs several data
  // tools in parallel, the server returns `actions` (plural) — rendered
  // as a stack of result cards — and this strip shows one live card per
  // agent. `agentTeamSceneOpen` shows the team roster on the chat
  // screen (the 🤖 rail button). There is NO tools grid any more
  // (Phase سادگی): every capability is reached by voice/chat through
  // the brain, and media/document UIs open as overlays from its
  // open_tool actions.
  const [toolActions, setToolActions] = useState<ChatAction[] | null>(null);
  const [agentTeam, setAgentTeam] = useState<AgentTaskState[] | null>(null);
  const [agentTeamSceneOpen, setAgentTeamSceneOpen] = useState(false);
  const agentPredictedRef = useRef<AgentDef[]>([]);
  // Office scene (Phase 4): today's task board (lib/task-board) and
  // احمد's live build — the scene reads these plus `agentTeam` above,
  // so scene and strip share ONE source of truth.
  const [boardEntries, setBoardEntries] = useState<BoardEntry[]>(() => {
    try { return loadBoardEntries(window.localStorage); } catch { return []; }
  });
  const [buildLive, setBuildLive] = useState<{ title: string; startedAt: number } | null>(null);
  // Call (Phase 4): DevicePairing owns the signalling; these mirror
  // just enough of it for sendMessage to reroute turns mid-call.
  const callControlRef = useRef<CallControl | null>(null);
  const callUiRef = useRef<CallUiState>({ phase: 'idle', role: null, peerName: '' });
  const prevCallPhaseRef = useRef<CallUiState['phase']>('idle');
  // Resolver for the reply text of a turn that arrived AS a call
  // utterance: set by handleCallUtterance, fired where the reply is
  // finalized (and on the failure path with the failure text itself —
  // the same words this device speaks locally).
  const pendingCallReplyRef = useRef<((text: string | null) => void) | null>(null);
  // Brain backup (Phase 4): restore file picker + pending confirm.
  const backupInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingRestore, setPendingRestore] = useState<{ fileName: string; summary: BackupSummary; data: BrainBackup } | null>(null);
  // Always-current mirrors for async callbacks (call handlers run
  // from DevicePairing's poll loop, outside React's render cycle).
  const conversationsRef = useRef<Conversation[]>([]);
  const activeIdRef = useRef<string | null>(null);
  const [mediaTool, setMediaTool] = useState<MediaToolName | null>(null);
  // Which section of a hub tool (تصویر ٹولز / ویڈیو ٹولز) to land on when a
  // voice/chat command names a specific feature; undefined = first section.
  const [toolSection, setToolSection] = useState<HubSection | undefined>(undefined);
  // Device pairing (Task 6b): panel visibility + a join code arriving
  // via a scanned QR link (?pair=CODE), pre-filled for one-tap joining.
  const [pairingOpen, setPairingOpen] = useState(false);
  const [pairingJoinCode, setPairingJoinCode] = useState('');
  // One-time contextual permissions offer (Task 7): shown once when a
  // capability the app uses is still un-granted, so the user can allow
  // everything in one tap instead of meeting prompts tool by tool.
  const [showPermHint, setShowPermHint] = useState(false);
  const [permHintBusy, setPermHintBusy] = useState(false);
  // Focus mode (user's simple-display vision): name a thing — "نقشہ دکھاؤ",
  // "WhatsApp کھولو" — and ONLY that thing fills the screen until واپس.
  const [focusView, setFocusView] = useState<null | 'map' | 'whatsapp' | 'quran'>(null);
  // Quran voice requests: each command sends a fresh REQUEST naming the
  // surah to open (and whether to recite it). The generic «تلاوت سناؤ»
  // asks for Al-Fatiha; a NAMED surah («سورۃ ناس سناؤ») asks for that
  // surah — the old bump-only signal could not carry the name, so the
  // reader always played Al-Fatiha or nothing at all.
  const [quranAutoplayReq, setQuranAutoplayReq] = useState<{ signal: number; surah: number; speak: boolean } | null>(null);
  const quranSignalRef = useRef(0);
  function requestQuran(surah: number, speakRecitation: boolean) {
    quranSignalRef.current += 1;
    setQuranAutoplayReq({ signal: quranSignalRef.current, surah, speak: speakRecitation });
  }
  const [toolPrefill, setToolPrefill] = useState<{ phone?: string } | null>(null);
  // Continuous voice mode (hands-free): listen -> auto-send on silence -> auto-speak reply.
  const [continuousVoice, setContinuousVoice] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('');
  const chatMutation = useSendMairaChatMessage();
  const timerRef = useRef<number | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const recognizedTextRef = useRef('');
  // Continuous-mode refs (avoid stale closures inside recognition callbacks).
  const continuousVoiceRef = useRef(false);
  const continuousRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const continuousTextRef = useRef('');
  const silenceTimerRef = useRef<number | null>(null);
  const continuousIntendedRef = useRef(false);
  // True while a spoken turn is being answered (sent + reply speaking).
  // Blocks the mic from restarting mid-turn; cleared when the app goes idle.
  const turnInFlightRef = useRef(false);
  // True for the WHOLE span of one assistant reply's speech — set by
  // playAssistantMessage when it commits to speaking, cleared by
  // resumeContinuousAfterTts. The instantaneous flags (isSpeaking /
  // isPreparingVoice) flicker false in the gaps between audio chunks
  // while the remaining chunks are still being synthesized, and every
  // mic-reopen path used to read those gaps as "the reply is over" and
  // reopen the mic MID-REPLY — a core part of the phone live mic's
  // on/off cycling («کبھی بند، کبھی آن»). startContinuousListening now
  // refuses to start while this is set.
  const ttsActiveRef = useRef(false);
  // The ONE pending live-mic reopen timer. Every reopen path (session
  // onend, post-reply resume, the idle recovery effect) goes through
  // scheduleLiveMicReopen, so at most one reopen is ever armed and a
  // pause / stop / new turn can cancel it — previously three
  // independent timers raced to reopen the mic.
  const liveReopenTimerRef = useRef<number | null>(null);
  // SPEECH TICKET (barge-in foundation, 2026-10-22): a monotonically
  // increasing token that owns the right to make sound. Every send takes
  // a ticket; every new playAssistantMessage takes one; interruptSpeech()
  // takes one — instantly orphaning the previous owner. Every place that
  // can START a sound (chunk loops, the eager-prefetch player, the
  // browser-voice sentence chain) checks its ticket is still current
  // before making noise. This is what stopSpeaking() alone could never
  // do: pausing the current <audio> element resolves its promise, and
  // the old loops simply walked on to the next chunk — a reply could
  // not be stopped, it talked over the user (his on-device report).
  const speechTicketRef = useRef(0);
  // The text of the reply currently being spoken — the barge-in detector
  // compares candidate speech against it, so the AI hearing its OWN
  // voice through the speakers (echo) is not mistaken for the user.
  const currentSpeechTextRef = useRef('');
  // Barge-in listener: a SEPARATE recognition that runs only while a
  // reply speaks in live mode, purely to hear the user start talking.
  // On confirmation it is ADOPTED as the live session (same object —
  // the user is mid-sentence, a restart would eat his words), so its
  // mode flips from 'detect' to 'capture' and the normal turn machinery
  // takes over its results.
  const bargeInRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const bargeInModeRef = useRef<'off' | 'detect' | 'capture'>('off');
  const bargeInEpochRef = useRef(0);
  const bargeInCandidateRef = useRef<{ firstAt: number; lastAt: number; text: string; finals: string }>({
    firstAt: 0, lastAt: 0, text: '', finals: '',
  });
  const bargeInRestartsRef = useRef(0);
  const bargeInEmptyEndsRef = useRef(0);
  const bargeInGotResultRef = useRef(false);
  // The ticket of the speech span the current listener belongs to — a
  // new span resets the restart/unavailable verdicts, a stale listener
  // from a dead span never restarts.
  const bargeInSpanTicketRef = useRef(0);
  const bargeInUnavailableRef = useRef(false);
  const bargeInRestartTimerRef = useRef<number | null>(null);
  // Always-current interruptSpeech for the audio bus registration.
  const interruptSpeechRef = useRef<() => void>(() => {});
  // Phone live mic: how many sessions in a row ended without any speech —
  // drives the restart backoff that stops the mic blinking on/off.
  const phoneEmptyEndsRef = useRef(0);
  // When the current live-mic session started (ms) — lets finishLiveSession
  // tell a platform refusal (session died almost at once, restart loops
  // are pointless) from a natural idle end (Android closes quiet
  // sessions every few seconds — those must reopen at once, or the
  // growing backoff leaves multi-second dead gaps in which his words
  // are missed and the mic reads as switching itself off and on).
  const listenStartedAtRef = useRef(0);
  // PHONE mic-fix refs (2026-10-21): Android Chrome's speech engine returns
  // each phrase as a separate "final" and ends single-shot sessions at
  // brief pauses, so a phone utterance arrives as several fragments across
  // several sessions. These refs let the phone paths accumulate fragments
  // and send ONE merged message per utterance (see schedulePhoneTurnSend /
  // the one-shot mobile sessions below). Desktop paths never touch them.
  const phoneTurnTimerRef = useRef<number | null>(null);
  // Bumped whenever a live-mic session is paused/stopped/replaced, so late
  // callbacks from a dead session can never dispatch a duplicate turn.
  const listenEpochRef = useRef(0);
  const oneShotSendTimerRef = useRef<number | null>(null);
  const oneShotRestartsRef = useRef(0);
  const oneShotActiveRef = useRef(false);
  const oneShotFinishRef = useRef(false);
  // Latest interim (not-yet-final) transcript of the one-shot mic — the
  // fallback when Android never delivers a final result for the session.
  const oneShotInterimRef = useRef('');
  // Always-current send/command functions for recognition callbacks: a
  // recognition object can live across many React renders, and the copies
  // captured at creation time go stale (the isPending guard read false
  // forever, sends forked conversations or were dropped). Phone paths call
  // these refs; desktop paths keep calling the functions directly.
  const sendMessageRef = useRef<((text: string, fromVoice?: boolean) => Promise<void>) | null>(null);
  const voiceCommandRef = useRef<((text: string) => boolean) | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // TTS prefetch: start synthesizing the first sentence while text still streams,
  // so voice begins almost immediately after the reply completes.
  // VOICE-OWNER SNAPSHOT (2026-10-25 role-swap fix): the prefetch
  // entry carries the persona that OWNED this reply, so the eager
  // first chunk can never be synthesized in a different gender than
  // the rest of the reply if the user switches persona mid-stream.
  const ttsPrefetchRef = useRef<{ text: string; promise: Promise<{ audioBase64: string; mimeType: string } | null>; eagerPlayed: boolean; playPromise: Promise<{ heard: boolean; blocked: boolean }> | null; ticket: number; female: boolean } | null>(null);
  // TTS health counters (2026-10-25 NEVER-DOWN fix): these are
  // DIAGNOSTIC ONLY now. They used to mute the Gemini leg for the
  // whole session after a quota/auth answer or 3 soft failures — one
  // dead key then silenced BOTH personas until reload, even when
  // other saved keys or the Edge legs could still speak. Nothing may
  // read these refs to skip a leg any more: every chunk retries the
  // full leg order fresh (see synthesizeWithTimeout).
  const serverTtsFailsRef = useRef(0);
  const serverTtsDownRef = useRef(false);
  // PER-REPLY FAIL-FAST CIRCUIT (2026-10-26, user instruction: fix the
  // voice itself, change NO voice): the evening recurrence proved a
  // dead leg is often dead for the whole reply, not seconds — Gemini
  // TTS quota dies by evening, Render Edge throttles for minutes.
  // Re-asking those legs on EVERY chunk (3 resilient passes + 2
  // extended passes = 9 full chain runs, each burning up to a 20s
  // Edge cap) is what made a reply speak line-by-line minutes late
  // and still drop. So, per reply ticket only (never session, never
  // across replies): a Gemini quota/auth answer marks Gemini dead
  // for this reply, and an Edge failure marks Edge dead for 60s.
  // Later chunks skip the dead leg at once instead of burning
  // another 20s+ on it. A new ticket, or new keys, resets it. No
  // voice, chain order, or picker changes — only dead legs are
  // skipped, and only for this reply.
  const replyCircuitRef = useRef<{ ticket: number; geminiDead: boolean; edgeDeadUntil: number }>({ ticket: -1, geminiDead: false, edgeDeadUntil: 0 });
  // Last classified leg failure for THIS reply ('quota' | 'auth' |
  // 'network' | 'edge' | ''), recorded by synthesizeWithTimeout on
  // total chain failure so the voice engine's terminal banner can
  // state the reason in plain words instead of a silent drop.
  // Diagnostic only — it never gates a leg (see NEVER-DOWN above).
  const lastVoiceFailureRef = useRef('');
  // NIGHT BACKUP leg diagnostic (2026-10-27): which legs failed
  // during THIS reply, for the terminal banner only. Recorded by
  // synthesizeWithTimeout + the browser-voice paths below, reset
  // at every playAssistantMessage start. Diagnostic only — it
  // never gates a leg, never carries a key or transcript.
  const lastLegFailuresRef = useRef<{ gemini: string; edge: boolean; browser: boolean }>({ gemini: '', edge: false, browser: false });
  // UNIQA voice health (2026-10-24 fix, user-approved): her server-Edge
  // leg (Uzma) carries NO session lockout any more. The old 2-strike
  // rule muted that leg for the whole session after 2 transient
  // failures (the known Render Edge throttling), leaving her silent
  // on Chrome devices while Unique — whose chain has no such lockout
  // — kept speaking. Now the server leg is retried on every chunk,
  // exactly like Unique's, and the per-chunk resilient retries
  // (650ms / 2000ms) give transient throttling room to clear.
  // SESSION VOICE WARM-UP (2026-10-22, defect: mixed voices at start).
  // At session start every leg of the voice chain is cold: the Render
  // server may be asleep (its routes can eat their whole timeout
  // budget just waking), and the client Edge leg must spend one
  // handshake attempt learning that Chrome's UA is rejected before its
  // 60s fail-fast memo exists. Those costs used to land on the user's
  // FIRST replies — each chunk/reply independently re-probed the cold
  // legs and landed on whichever answered first: one reply fell to the
  // browser voice, the next to Gemini, and only once everything was
  // warm did the chosen voice (Salman) run steadily — exactly his
  // report: «شروع شروع سے دو سے تین آوازیں آتی ہیں، پھر ایک ہی آواز
  // چلتی ہے». The fix: warm the chain ONCE, on the first user
  // interaction — one tiny discarded synthesis wakes the server and
  // arms the client-leg memo before any real reply is spoken — and
  // the first spoken reply WAITS for that probe to settle (bounded by
  // the chain's own leg timeouts) instead of racing cold legs.
  const voiceWarmupStartedRef = useRef(false);
  const voiceWarmupPromiseRef = useRef<Promise<void> | null>(null);
  // True once ANY server-leg audio has actually played this session
  // (or the warm-up probe was answered by a server leg): from then on
  // the chain's verdicts are warm and fallbacks behave as before.
  const sessionVoiceReadyRef = useRef(false);
  // Fingerprint of the user's saved keys at the last TTS attempt. If the
  // keys CHANGE (user pastes fresh ones in Settings), the "server TTS is
  // down" verdict from earlier failures must be forgotten — otherwise the
  // app keeps refusing to even try the new, working keys until a reload
  // (root cause of "keys are ✅ but voice never came", found 2026-10-20).
  const ttsKeysFingerprintRef = useRef<string | null>(null);
  const streamedTextRef = useRef('');
  // Attached image (base64 data URL) for vision — sent with the next message.
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const serverAudioRef = useRef<HTMLAudioElement | null>(null);
  // Mobile audio unlock (2026-10-20 deep audit): Android Chrome rejects
  // audio.play() that is not tied to a recent user tap, so spoken replies
  // were silently dying on phones (synthesis succeeded, playback blocked).
  // One persistent element, unlocked by the user's own taps, is reused for
  // every chunk on phones. Desktop keeps its original per-chunk element.
  const persistentAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioUnlockedRef = useRef(false);
  const playbackBlockedRef = useRef(false);
  const playbackStartedRef = useRef(false);
  const isPreparingVoiceRef = useRef(false);
  const lastSpokenRef = useRef<{ text: string; at: number } | null>(null);
  const activeConversation = conversations.find((conversation) => conversation.id === activeId);
  const busy = chatMutation.isPending;
  conversationsRef.current = conversations;
  activeIdRef.current = activeId;

  // Hand gestures (Phase 2): camera-based commands, all client-side.
  const {
    videoRef: gestureVideoRef,
    status: gestureStatus,
    statusMessage: gestureStatusMessage,
    activeGesture,
  } = useGestures({
    enabled: gesturesEnabled,
    onGesture: (gesture: Exclude<GestureName, 'none'>) => {
      if (gesture === 'open_palm') {
        interruptSpeech(); // "رکو" — stop the voice AND its whole queue
      } else if (gesture === 'fist') {
        toggleRecording(); // mic on/off
      } else if (gesture === 'thumbs_up') {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      } else if (gesture === 'point') {
        textareaRef.current?.focus();
      } else if (gesture === 'wave') {
        setGesturesEnabled(false);
      } else if (gesture === 'clap') {
        // 👏 Clap = wake up Unique AI (like the viral "Maya AI" hand-clap
        // activation): start listening if the mic isn't already on.
        if (!recording) toggleRecording();
      }
    },
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [conversations]);

  // Pre-warm browser TTS voices on app load so the fallback voice is ready
  // instantly when server TTS is down. Also "unlocks" speechSynthesis on
  // browsers that require a user gesture (silent utterance).
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const warmUp = () => {
      try {
        window.speechSynthesis.getVoices();
      } catch { /* ignore */ }
    };
    warmUp();
    window.speechSynthesis.addEventListener('voiceschanged', warmUp);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', warmUp);
  }, []);

  // Session voice warm-up: the FIRST tap or keypress of the session
  // fires the one-time probe (see warmUpVoiceChain) so the server is
  // awake and the client Edge leg's verdict is known long before the
  // first reply needs its voice.
  useEffect(() => {
    const warm = () => warmUpVoiceChain();
    window.addEventListener('pointerdown', warm, { once: true });
    window.addEventListener('keydown', warm, { once: true });
    return () => {
      window.removeEventListener('pointerdown', warm);
      window.removeEventListener('keydown', warm);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Permissions hint: check states once on load (reading state never
  // prompts); offer the one-tap warm-up only if something is missing
  // and the user hasn't dismissed the offer before.
  useEffect(() => {
    let cancelled = false;
    try {
      if (localStorage.getItem('unique-ai-perm-hint-dismissed') === '1') return;
    } catch { /* ignore */ }
    void queryAllPermissions().then((states) => {
      if (cancelled) return;
      const missing = Object.values(states).some((state) => state === 'prompt');
      if (missing) setShowPermHint(true);
    });
    return () => { cancelled = true; };
  }, []);

  function dismissPermHint() {
    setShowPermHint(false);
    try {
      localStorage.setItem('unique-ai-perm-hint-dismissed', '1');
    } catch { /* ignore */ }
  }

  async function warmUpFromHint() {
    setPermHintBusy(true);
    try {
      await requestAllPermissions();
    } finally {
      setPermHintBusy(false);
      dismissPermHint();
    }
  }

  // Device pairing link (QR scan): /?pair=123456 opens the pairing
  // panel with the join code pre-filled, then the param is cleaned.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const pair = (params.get('pair') || '').replace(/\D/g, '');
      if (pair.length === 6) {
        setPairingJoinCode(pair);
        setPairingOpen(true);
        params.delete('pair');
        const qs = params.toString();
        window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
      }
    } catch { /* ignore */ }
  }, []);

  // ---- Device pairing callbacks (Task 6b) ----
  function getPairingConversation(): ConversationHandover | null {
    const active = conversations.find((conversation) => conversation.id === activeId);
    if (!active) return null;
    return {
      title: active.title,
      messages: active.messages
        .filter((message) => typeof message.content === 'string' && message.content.trim())
        .map((message) => ({ role: message.role, content: message.content })),
    };
  }

  function handleReceivedConversation(handover: ConversationHandover, fromName: string) {
    const now = new Date().toISOString();
    const incoming: Conversation = {
      id: createId(),
      title: handover.title || '📱 موصول گفتگو',
      updatedAt: now,
      messages: (handover.messages || []).map((message) => ({
        id: createId(),
        role: (message.role === 'user' ? 'user' : 'assistant') as ChatRole,
        content: String(message.content || ''),
        createdAt: now,
      })),
    };
    if (incoming.messages.length === 0) return;
    setConversations((current) => [incoming, ...current]);
    setActiveId(incoming.id);
    void playAssistantMessage(`📱 ${fromName} سے گفتگو موصول ہوئی — سامنے آ گئی ہے۔`);
  }

  function handleRemoteCommand(command: RemoteCommand) {
    const labels: Record<string, string> = {
      open_quran: 'قرآن پاک', open_map: 'نقشہ',
    };
    // The tools grid is gone (Phase سادگی) — an open_tools command from
    // an older paired build gets a graceful spoken note, not a dead end.
    if (command.action === 'open_tools') {
      void playAssistantMessage('📱 دوسری ڈیوائس نے ٹولز کھولنے کو کہا تھا — اب ٹولز کا الگ خانہ نہیں رہا، سارے کام یہیں آواز سے ہوتے ہیں۔ جو چاہیے بس کہہ دیں۔');
      return;
    }
    if (command.action === 'open_quran') setFocusView('quran');
    else if (command.action === 'open_map') setFocusView('map');
    else if (command.action === 'open_tool' && command.tool) {
      setToolSection(undefined);
      setMediaTool(command.tool as MediaToolName);
    } else return;
    void playAssistantMessage(`📱 دوسری ڈیوائس کے کہنے پر ${labels[command.action] || 'ٹول'} کھول دیا ہے۔`);
  }

  // ---- Call (Phase 4) ----
  // DevicePairing owns the signalling; chat.tsx owns brains + voice.
  // Caller side: sendMessage reroutes turns into the call (below),
  // replies land in handleCallReply. Callee side: utterances are
  // injected as ordinary messages by handleCallUtterance, and the
  // reply TEXT travels back over the relay so the caller hears it too.

  /** Append one call turn to this device's transcript (a «📞 کال»
   *  conversation is created if there is none yet). */
  function appendCallTranscript(role: ChatRole, content: string) {
    let conversation = conversationsRef.current.find((c) => c.id === activeIdRef.current);
    if (!conversation) {
      conversation = {
        id: createId(),
        title: '📞 کال',
        updatedAt: new Date().toISOString(),
        messages: [],
      };
      setConversations((current) => [conversation!, ...current]);
      setActiveId(conversation.id);
    }
    const id = conversation.id;
    const now = new Date().toISOString();
    updateConversation(id, (item) => ({
      ...item,
      updatedAt: now,
      messages: [...item.messages, { id: createId(), role, content, createdAt: now }],
    }));
  }

  function handleCallStateChange(state: CallUiState) {
    callUiRef.current = state;
    const prev = prevCallPhaseRef.current;
    prevCallPhaseRef.current = state.phase;
    // Spoken transitions (voice-first user may not be looking): once
    // when the call connects, once when it ends — never on mount
    // (prev starts 'idle', the first mirror call is also 'idle').
    if (prev !== 'active' && state.phase === 'active') {
      void playAssistantMessage('📞 کال جُڑ گئی ہے۔');
    } else if (prev === 'active' && state.phase === 'idle') {
      void playAssistantMessage('📞 کال ختم ہو گئی۔');
    }
  }

  /**
   * Callee side: one spoken turn from the caller. It goes through the
   * NORMAL sendMessage — so tools, the builder, everything works on
   * the call, which is the entire point — and resolves with the reply
   * text. Two capture paths, whichever fires first: (a) the mutation
   * hooks in sendMessage (success + failure), (b) a transcript
   * watcher for turns answered by LOCAL commands (persona, memory,
   * backup…), which append their exchange without a server round-trip.
   * A 100s cap returns an honest «دیر لگ گئی» line instead of silence.
   */
  async function handleCallUtterance(text: string): Promise<string | null> {
    for (let i = 0; i < 20 && chatMutation.isPending; i++) {
      await new Promise((r) => setTimeout(r, 1000));
    }
    const before = new Set<string>();
    const active = conversationsRef.current.find((c) => c.id === activeIdRef.current);
    for (const m of active?.messages || []) before.add(m.id);
    return new Promise<string | null>((resolve) => {
      let settled = false;
      let watch = 0;
      let cap = 0;
      const finish = (value: string | null) => {
        if (settled) return;
        settled = true;
        window.clearInterval(watch);
        window.clearTimeout(cap);
        if (pendingCallReplyRef.current === finish) pendingCallReplyRef.current = null;
        resolve(value);
      };
      pendingCallReplyRef.current = finish;
      let lastSeen = '';
      let stablePolls = 0;
      watch = window.setInterval(() => {
        const conv = conversationsRef.current.find((c) => c.id === activeIdRef.current);
        const fresh = (conv?.messages || []).filter(
          (m) => m.role === 'assistant' && !before.has(m.id) && m.content.trim(),
        );
        const latest = fresh[fresh.length - 1];
        if (!latest) return;
        if (latest.content === lastSeen) {
          stablePolls += 1;
          if (stablePolls >= 2) finish(latest.content);
        } else {
          lastSeen = latest.content;
          stablePolls = 0;
        }
      }, 700);
      cap = window.setTimeout(
        () => finish('معذرت، جواب بنانے میں کافی دیر لگ گئی — ایک بار پھر کہہ دیں۔'),
        100_000,
      );
      void sendMessage(text);
    });
  }

  /** Caller side: the callee's reply arrived — show it and SPEAK it
   *  here, with this device's own persona voice chain (Salman for
   *  Unique, Uniqa's chain when she is present — playAssistantMessage
   *  already routes by the current persona). */
  function handleCallReply(text: string) {
    appendCallTranscript('assistant', text);
    void playAssistantMessage(text);
  }

  // ---- Task board (Phase 4): pin REAL completions only ----
  function recordCompletionsForActions(actions: { type: string }[], detail: string) {
    try {
      let entries: BoardEntry[] | null = null;
      for (const action of actions) {
        if (!isRecordableAction(action.type)) continue;
        const def = agentForActionType(action.type);
        if (!def) continue;
        entries = recordBoardCompletion(window.localStorage, {
          agentKey: def.key,
          person: def.person,
          icon: def.icon,
          label: detail,
        });
      }
      if (entries) setBoardEntries(entries);
    } catch { /* the board is a courtesy — never break a reply over it */ }
  }

  // Mobile only: unlock the persistent audio element on the user's own
  // taps, so spoken replies can play later without a fresh tap (Android
  // Chrome's autoplay policy). Desktop registers nothing — untouched.
  useEffect(() => {
    if (!isMobileTurnMode()) return;
    const unlock = () => {
      if (audioUnlockedRef.current) return;
      try {
        if (!persistentAudioRef.current) persistentAudioRef.current = new Audio();
        const el = persistentAudioRef.current;
        el.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
        void el.play().then(() => {
          audioUnlockedRef.current = true;
          el.pause();
          el.currentTime = 0;
        }).catch(() => { /* still locked — the next tap retries */ });
      } catch { /* ignore */ }
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    return () => window.removeEventListener('pointerdown', unlock);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [activeConversation?.messages.length, busy]);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    oneShotActiveRef.current = false;
    if (oneShotSendTimerRef.current !== null) window.clearTimeout(oneShotSendTimerRef.current);
    if (phoneTurnTimerRef.current !== null) window.clearTimeout(phoneTurnTimerRef.current);
    recognitionRef.current?.stop();
    // Continuous voice mode cleanup.
    continuousIntendedRef.current = false;
    stopBargeInListener();
    clearLiveReopenTimer();
    if (silenceTimerRef.current !== null) window.clearTimeout(silenceTimerRef.current);
    try { continuousRecognitionRef.current?.stop(); } catch { /* already stopped */ }
  }, []);

  // Keep the ref in sync so recognition callbacks always see the live value.
  useEffect(() => {
    continuousVoiceRef.current = continuousVoice;
  }, [continuousVoice]);

  // Sync app settings to individual states + persist to localStorage.
  const settingsInitRef = useRef(false);
  useEffect(() => {
    try { localStorage.setItem('unique-ai-settings', JSON.stringify(appSettings)); } catch {}
    setGesturesEnabled(appSettings.gesturesEnabled);
    // Continuous voice has ONE source of truth: continuousIntendedRef.
    // The Settings toggle must start/stop the REAL mic, not just flip the
    // indicator (deep-audit fix 2026-10-20: before, it only changed state —
    // the app could look like it was listening while hearing nothing, or
    // keep listening while the toggle showed off). On first load, never
    // auto-start the mic — browsers need a user tap anyway — so a persisted
    // ON is normalized back to OFF instead.
    if (!settingsInitRef.current) {
      settingsInitRef.current = true;
      if (appSettings.continuousVoice) {
        setAppSettings((s: any) => ({ ...s, continuousVoice: false }));
      }
      return;
    }
    const want = appSettings.continuousVoice;
    if (want === continuousIntendedRef.current) {
      setContinuousVoice(want);
      return;
    }
    if (want) {
      interruptSpeech();
      continuousIntendedRef.current = true;
      setContinuousVoice(true);
      startContinuousListening();
    } else {
      stopContinuousListening();
      setContinuousVoice(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appSettings]);

  // Rail tooltip helpers: custom tooltips (data-tip) hide on click so they
  // never get stuck on screen; they come back on next hover.
  function hideTipOnClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.currentTarget.classList.add('no-tip');
  }
  function restoreTipOnLeave(e: React.MouseEvent<HTMLButtonElement>) {
    e.currentTarget.classList.remove('no-tip');
  }

  function startNewChat() {
    // Leaving this chat silences its reply — a voice from a chat the
    // user has already left must never keep talking over the new one.
    interruptSpeech('chat-switch');
    // Toggle: if we're already on an empty new chat, go BACK to the most
    // recent conversation with messages. Uses the persisted conversations
    // list (survives refresh) — NOT a ref (which is wiped on reload).
    if (activeConversation && activeConversation.messages.length === 0) {
      const previous = conversations
        .filter((c) => c.id !== activeConversation.id && c.messages.length > 0)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      if (previous) {
        setActiveId(previous.id);
      }
      setDraft('');
      setError('');
      setShowHistory(false);
      window.setTimeout(() => textareaRef.current?.focus(), 30);
      return;
    }
    const conversation: Conversation = {      id: createId(),
      title: 'نئی گفتگو',
      updatedAt: new Date().toISOString(),
      messages: [],
    };
    setConversations((current) => [conversation, ...current]);
    setActiveId(conversation.id);
    setDraft('');
    setError('');
    setShowHistory(false);
    window.setTimeout(() => textareaRef.current?.focus(), 30);
  }

  function updateConversation(id: string, updater: (conversation: Conversation) => Conversation) {
    setConversations((current) => current.map((conversation) =>
      conversation.id === id ? updater(conversation) : conversation,
    ).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  }

  function toneConfirmation(next: ToneMode): string {
    const fem = personaRef.current === 'uniqa';
    if (next === 'serious') return fem ? 'ٹھیک ہے، اب سے سنجیدگی سے بات کروں گی۔' : 'ٹھیک ہے، اب سے سنجیدگی سے بات کروں گا۔';
    if (next === 'romantic') return 'اچھا جی 💛 اب نرم، محبت بھرے لہجے میں بات ہوگی۔';
    return fem ? 'ٹھیک ہے، معمول کے لہجے میں واپس آ گئی۔' : 'ٹھیک ہے، معمول کے لہجے میں واپس آ گیا۔';
  }

  /**
   * Persona summons + tone orders (Phase 2) — local, command-shaped
   * only (the detectors in lib/persona enforce the shapes). Returns:
   *  - 'handled' → the message was a pure order; a local exchange was
   *    appended and spoken by the (possibly new) persona.
   *  - a string  → a name-prefixed request («یونیکا، کہانی سناؤ»): the
   *    persona switched; the caller sends THIS rest as the message.
   *  - null      → not a persona/tone order; normal flow continues.
   */
  function handlePersonaCommand(textValue: string): 'handled' | string | null {
    const summon = detectPersonaSummon(textValue, personaRef.current);
    if (summon) {
      changePersona(summon.target);
      if (!summon.pure) {
        // The rest might itself be a pure tone order («یونیکا، رومینٹک
        // ہو جاؤ») — apply it as the new persona instead of sending it
        // to the brain as a message.
        const restTone = detectToneCommand(summon.rest);
        if (restTone) {
          changeTone(restTone);
          const conf = toneConfirmation(restTone);
          appendWebsiteCommandExchange(textValue, conf);
          playAssistantMessage(conf);
          setDraft('');
          return 'handled';
        }
        return summon.rest;
      }
      // Pure summon: the INCOMING persona greets. Banter (Stonic-style
      // teasing about the other persona) is modest by design: never in
      // serious tone, at most once per session per direction, and only
      // sometimes — the plain greeting is the default.
      const dir = summon.target === 'uniqa' ? 'to-uniqa' : 'to-unique';
      let greeting: string;
      if (toneRef.current !== 'serious' && !banterUsedRef.current.has(dir) && Math.random() < 0.6) {
        banterUsedRef.current.add(dir);
        greeting = pickLine(summon.target === 'uniqa' ? BANTER_TO_UNIQA : BANTER_TO_UNIQUE);
      } else {
        greeting = pickLine(summon.target === 'uniqa' ? UNIQA_GREETINGS : UNIQUE_GREETINGS);
      }
      appendWebsiteCommandExchange(textValue, greeting);
      playAssistantMessage(greeting);
      setDraft('');
      return 'handled';
    }
    const toneCmd = detectToneCommand(textValue);
    if (toneCmd && toneCmd !== toneRef.current) {
      changeTone(toneCmd);
      const conf = toneConfirmation(toneCmd);
      appendWebsiteCommandExchange(textValue, conf);
      playAssistantMessage(conf);
      setDraft('');
      return 'handled';
    }
    return null;
  }

  /**
   * Memory voice commands (Phase 2 — his spec): «یہ یاد رکھو» saves,
   * «… بھول جاؤ» / «ڈیلیٹ کر دو» deletes, «ساری میموری ڈیلیٹ کر دو»
   * clears — on the app's existing notes store, with a spoken
   * confirmation naming what was saved or forgotten. Parsing lives in
   * lib/memory (command-shaped only; long messages parse to null and
   * reach the brain untouched).
   */
  function handleMemoryCommand(textValue: string): boolean {
    const cmd = parseMemoryCommand(textValue);
    if (!cmd) return false;
    if (cmd.type === 'show') {
      // «تم نے کیا سیکھا؟» (Round 5) — list what the shared learning
      // brain holds about this person, spoken and on screen.
      let listing: string;
      try {
        listing = formatLearningsList(loadLearnings(window.localStorage), personaRef.current === 'uniqa');
      } catch {
        return false; // storage unavailable — let the brain answer instead
      }
      appendWebsiteCommandExchange(textValue, listing);
      playAssistantMessage(listing);
      setDraft('');
      return true;
    }
    let outcome;
    try {
      outcome = applyMemoryCommand(window.localStorage, cmd);
    } catch {
      return false; // storage unavailable — let the brain answer instead
    }
    const confirmation = memoryConfirmation(cmd, outcome, personaRef.current === 'uniqa');
    appendWebsiteCommandExchange(textValue, confirmation);
    playAssistantMessage(confirmation);
    setDraft('');
    return true;
  }

  // ---- Brain backup / restore (Phase 4) ----
  // «بیک اپ بنا دو» downloads ONE JSON file with the whole brain
  // (lib/backup — API keys NEVER included, by design); «بیک اپ واپس
  // لاؤ» opens the file picker (the pick itself is the user's tap —
  // a browser rule, said out loud in the reply). A picked file is
  // validated first and restored ONLY after the confirm dialog,
  // which names what will be replaced.

  function downloadBrainBackup(): BackupSummary {
    const data = collectBackup(window.localStorage);
    const blob = new Blob([serializeBackup(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = backupFileName(new Date());
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    return summarizeBackup(data);
  }

  function handleBackupCommand(textValue: string): boolean {
    const cmd = parseBackupCommand(textValue);
    if (!cmd) return false;
    if (cmd === 'create') {
      const summary = downloadBrainBackup();
      const reply = `🧠 دماغ کا بیک اپ تیار ہے — فائل ڈاؤن لوڈ ہو گئی ہے (${summary.conversations} گفتگوئیں، ${summary.notes} یادیں${summary.learnings ? `، ${summary.learnings} سیکھی ہوئی باتیں` : ''})۔ اسے USB میں رکھ لیں۔ ایک ضروری بات: اس فائل میں آپ کی API keys شامل نہیں ہیں — بحالی پر وہ ایک بار دوبارہ ڈالنی ہوں گی۔`;
      appendWebsiteCommandExchange(textValue, reply);
      playAssistantMessage('🧠 بیک اپ تیار ہے — فائل ڈاؤن لوڈ ہو گئی ہے۔ یاد رکھیں، اس فائل میں API keys شامل نہیں ہیں۔');
      setDraft('');
      return true;
    }
    const reply = 'ٹھیک ہے — بیک اپ فائل چنیں: فائل چننے کا خانہ کھل رہا ہے، USB سے اپنی بیک اپ فائل منتخب کریں۔ فائل چننا آپ کے اپنے ہاتھ سے ہوگا — یہ براؤزر کا اصول ہے۔ فائل پہلے جانچی جائے گی، اور بحالی آپ کی تصدیق کے بعد ہی ہوگی۔';
    appendWebsiteCommandExchange(textValue, reply);
    playAssistantMessage('بیک اپ فائل منتخب کریں — فائل چننے کا خانہ کھل رہا ہے۔');
    setDraft('');
    window.setTimeout(() => backupInputRef.current?.click(), 60);
    return true;
  }

  async function handleBackupFilePicked(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // same file can be picked again after a cancel
    if (!file) return;
    const text = await file.text().catch(() => '');
    const parsed = parseBackup(text);
    if (!parsed.ok) {
      // Honest error, state untouched — parse validated NOTHING was
      // applied (apply only ever runs from the confirm button).
      setError(parsed.error);
      void playAssistantMessage(parsed.error);
      return;
    }
    setPendingRestore({ fileName: file.name, summary: summarizeBackup(parsed.data), data: parsed.data });
  }

  function confirmBackupRestore() {
    if (!pendingRestore) return;
    try {
      applyBackup(window.localStorage, pendingRestore.data);
    } catch {
      setError('بحالی میں مسئلہ ہوا — آپ کا موجودہ ڈیٹا ویسا کا ویسا ہے۔');
      setPendingRestore(null);
      return;
    }
    setPendingRestore(null);
    // A full reload is the honest way to «زندہ کرنا»: every store,
    // persona, setting and screen re-reads the restored brain.
    window.location.reload();
  }

  async function sendMessage(textValue: string, fromVoice = false) {
    let text = textValue.trim();
    if (!text && !attachedImage) return;
    // CALL (Phase 4): while THIS device is the CALLER in a live call,
    // everything said or typed here is a spoken turn for the OTHER
    // device's Unique — never a local message. It is appended to this
    // device's call transcript, sent over the relay, and the reply
    // comes back through handleCallReply (spoken here by this
    // device's own persona voice chain). Checked before every local
    // command: a name-call or memory order spoken INTO a call belongs
    // to the callee's assistant, not this device.
    const callUi = callUiRef.current;
    if (text && !attachedImage && callUi.phase === 'active' && callUi.role === 'caller') {
      appendCallTranscript('user', text);
      const sentOk = callControlRef.current?.sendUtterance(text) ?? false;
      setDraft('');
      if (!sentOk) {
        setError('کال پر بات نہیں بھیجی جا سکی — رابطہ ختم لگ رہا ہے۔ کال ختم کر کے دوبارہ کوشش کریں۔');
      }
      return;
    }
    // Never swallow a send in silence: if a reply is still being fetched,
    // say so on screen. (This guard used to drop voice messages without a
    // trace whenever an earlier request was slow or stuck.)
    if (chatMutation.isPending) {
      setError('پچھلا جواب ابھی آ رہا ہے — چند لمحے انتظار کریں، پھر دوبارہ بولیں۔');
      return;
    }
    // Persona summons + tone orders (Phase 2) run first: a name-call
    // («یونیکا کو بلاؤ») switches who is present; a name-prefixed
    // request switches and forwards its rest as the message.
    if (!attachedImage) {
      const pc = handlePersonaCommand(text);
      if (pc === 'handled') return;
      if (typeof pc === 'string') text = pc;
    }
    // Focus commands work from BOTH typed text and voice: name a thing
    // (نقشہ / WhatsApp / قرآن / ٹولز) and it alone fills the screen.
    if (!attachedImage && handleFocusCommand(text)) return;
    // Website commands work from typed text too — not just voice.
    // (Voice paths already check this before calling sendMessage.)
    if (!fromVoice && !attachedImage && handleVoiceWebsiteCommand(text)) return;
    // Memory voice commands (Phase 2): «یہ یاد رکھو» / «بھول جاؤ» /
    // «ساری میموری ڈیلیٹ کر دو» — handled on the notes store locally.
    if (!attachedImage && handleMemoryCommand(text)) return;
    // Brain backup (Phase 4): «بیک اپ بنا دو» downloads the brain
    // file; «بیک اپ واپس لاؤ» opens the restore picker. Runs AFTER
    // memory so «یہ یاد رکھو … بیک اپ …» stays a note-save.
    if (!attachedImage && handleBackupCommand(text)) return;
    // «PDF ڈاؤن لوڈ دو» for a document a tool just generated: served
    // locally with a real download card (see handleDocumentDownloadRequest).
    if (!attachedImage && handleDocumentDownloadRequest(text)) return;
    // Video Maker status («میرا کام کہاں تک پہنچا؟» while a video job
    // exists): answered LOCALLY from the maker's real job store, never
    // from a chat-only promise. This is the fix for Uniqa's empty
    // "just a moment, link coming" replies — a chat reply cannot know
    // a job's state, but this store can. Intercepts whenever a video
    // job exists, unless the question clearly names an app/game;
    // otherwise the server's builder-status path runs untouched.
    if (!attachedImage && handleVideoMakerStatusQuery(text)) return;
    // Learning memory (Round 5): every message that reaches the brain
    // is also quietly mined for durable facts about this person
    // (name / likes / facts — lib/learnings). Fully silent: no card,
    // no announcement — the knowledge simply shows in later replies.
    try {
      learnFromText(window.localStorage, text, 'auto');
    } catch {
      // storage unavailable — the reply matters, not the learning
    }
    setError('');
    setSpeechNotice('');
    setSpeechReplayText(null);
    let conversation = activeConversation;
    if (!conversation) {
      conversation = {
        id: createId(),
        title: text.length > 42 ? `${text.slice(0, 42).trim()}…` : text,
        updatedAt: new Date().toISOString(),
        messages: [],
      };
      setConversations((current) => [conversation!, ...current]);
      setActiveId(conversation.id);
    }
    const id = conversation.id;
    const userMessage: ChatMessage = { id: createId(), role: 'user', content: text || '📷 تصویر بھیجی', createdAt: new Date().toISOString(), ...(attachedImage ? { image: attachedImage } : {}) };
    const previousMessages = conversation.messages;
    const sentMessages = [...previousMessages, userMessage];
    updateConversation(id, (item) => ({
      ...item,
      title: item.messages.length === 0 ? (text.length > 42 ? `${text.slice(0, 42).trim()}…` : text) : item.title,
      updatedAt: userMessage.createdAt,
      messages: sentMessages,
    }));
    setDraft('');
    // Helper-agent team (Task D): predict whether this message asks
    // for SEVERAL data tools at once. If so, the team strip appears on
    // the chat screen with «کام کر رہا ہے…» cards — and is FINALIZED
    // only from the actions the server actually returns (below). A
    // plain chat reply discards the strip: no fake activity, ever.
    const predictedAgents = attachedImage ? [] : detectAgentTasks(text);
    agentPredictedRef.current = predictedAgents;
    if (predictedAgents.length >= 2) {
      setAgentTeam(workingCards(predictedAgents, text.slice(0, 90)));
    } else {
      setAgentTeam(null);
    }
    const imageToSend = attachedImage;
    setAttachedImage(null);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    // Create the assistant message placeholder immediately for streaming
    const assistantId = createId();
    const assistantPlaceholder: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
    };
    updateConversation(id, (item) => ({
      ...item,
      updatedAt: assistantPlaceholder.createdAt,
      messages: [...item.messages, assistantPlaceholder],
    }));
    // This send owns a fresh speech ticket: any older reply still
    // speaking is orphaned (its chunk loops stop at their next check),
    // and an interrupt during streaming orphans THIS send's speech.
    const speechTicket = ++speechTicketRef.current;
    // VOICE-OWNER SNAPSHOT (2026-10-25 role-swap fix): the persona
    // that OWNS this reply is captured ONCE, here, at send time. The
    // old code re-read personaRef at prefetch time AND again at
    // playback time — if the user switched persona mid-stream, the
    // eager first chunk spoke in one gender and the rest of the
    // reply in the other (the reported «کبھی لڑکے والی آواز، کبھی
    // لڑکی کی» flip inside a single reply). Every voice decision
    // for this reply now uses sendFemale, never the live persona.
    const sendFemale = personaRef.current === 'uniqa';
    // Reset TTS prefetch for this new message
    ttsPrefetchRef.current = null;
    streamedTextRef.current = '';
    try {
      let result = await chatMutation.mutateAsync({
        data: {
          messages: sentMessages.slice(-30).map(({ role, content, image }) => ({ role, content, ...(image ? { image } : {}) })),
          stream: true,
          language: chatLang === 'auto' ? undefined : chatLang,
          // Persona + tone (Phase 2): the brain knows WHO is speaking
          // (Unique / Uniqa) and the tone the user set — it answers as
          // that persona, in that register.
          persona: personaRef.current,
          tone: toneRef.current,
          // Learned-memory recall (Round 5): a compact block of what
          // the app has learned about this person rides along, so the
          // whole team (Unique / Uniqa / every agent) answers with
          // that knowledge — name first, capped, never instructions.
          memory: buildRecallBlock(loadLearnings(window.localStorage)) || undefined,
          // Team-work context (2026-10-24): today's real team state so
          // any member asked about their work can answer in full
          // spoken detail from facts, never invention or refusal.
          team: buildTeamBlock(boardEntries, agentTeam, buildLive),
          onDelta: (delta: string) => {
            // Append streamed text to the placeholder message in real time
            updateConversation(id, (item) => ({
              ...item,
              messages: item.messages.map((m) =>
                m.id === assistantId ? { ...m, content: m.content + delta } : m
              ),
            }));
            // TTS prefetch: once the first chunk streams in, start synthesizing
            // it in the background. EAGER: play the moment audio is ready —
            // don't wait for the full response to finish streaming.
            streamedTextRef.current += delta;
            if (!ttsPrefetchRef.current && appSettings.voiceEnabled) {
              const firstSentence = extractFirstSentence(streamedTextRef.current);
              if (firstSentence && firstSentence.length >= 20) {
                const entry = {
                  text: firstSentence,
                  // Owner snapshot, NOT the live persona (role-swap fix).
                  promise: synthesizeWithTimeout(firstSentence, 12000, sendFemale),
                  eagerPlayed: false,
                  playPromise: null as Promise<{ heard: boolean; blocked: boolean }> | null,
                  ticket: speechTicket,
                  female: sendFemale,
                };
                ttsPrefetchRef.current = entry;
                setIsPreparingVoice(true);
                entry.promise.then((audio) => {
                  const pf = ttsPrefetchRef.current;
                  // Only play if this is still the current message's prefetch
                  // (a new message would have reset the ref) AND its speech
                  // ticket is still current — an interrupt that landed
                  // while the text was still streaming must keep this
                  // audio silent forever.
                  if (pf === entry && !pf.eagerPlayed && audio && appSettings.voiceEnabled && entry.ticket === speechTicketRef.current) {
                    pf.eagerPlayed = true;
                    currentSpeechTextRef.current = streamedTextRef.current;
                    pf.playPromise = playAudioChunk(audio.audioBase64, audio.mimeType, entry.ticket);
                  }
                }).catch(() => {});
              }
            }
          },
        },
      });
      // Replace placeholder content with final text (ensures exact match)
      updateConversation(id, (item) => ({
        ...item,
        updatedAt: new Date().toISOString(),
        messages: item.messages.map((m) =>
          m.id === assistantId ? { ...m, content: result.text } : m
        ),
      }));
      // CALL (Phase 4): if this turn arrived as a call utterance, hand
      // the final reply text back — DevicePairing relays it to the
      // caller, whose device speaks it there too.
      if (pendingCallReplyRef.current) {
        const resolveCall = pendingCallReplyRef.current;
        pendingCallReplyRef.current = null;
        resolveCall(result.text);
      }
      // Helper-agent team (Task D): the server ran several data tools
      // in parallel and returned every action. Finalize the strip from
      // the REAL actions (done ✓ / ناکام), and stack the result cards.
      if (result.actions && result.actions.length >= 2) {
        // Brain-taught learning (Round 5): a save_note inside a team
        // batch also feeds the learning store — silently.
        for (const a of result.actions) {
          if (a.type === 'save_note' && typeof a.text === 'string') {
            try { learnFromText(window.localStorage, a.text, 'told'); } catch { /* bonus only */ }
          }
        }
        setToolActions(result.actions as ChatAction[]);
        setAgentTeam(finalizeCards(agentPredictedRef.current, result.actions.map((a) => a.type), text.slice(0, 90)));
        recordCompletionsForActions(result.actions, text);
      } else if (result.actions && result.actions.length === 1) {
        // Server collapsed to a single executed action — treat it like
        // a normal single action below, and drop the predicted strip
        // (only one agent really ran; no team to show).
        const singleAction = result.actions[0];
        result = { ...result, action: singleAction };
        setAgentTeam(null);
        recordCompletionsForActions([singleAction], text);
      } else if (agentPredictedRef.current.length >= 2) {
        // Predicted a team, but the reply is plain chat — the strip
        // must not claim work that never happened.
        setAgentTeam(null);
      }
      // A direct singular action (no actions[] array): if an agent
      // genuinely completed work, pin it on today's board too.
      if (!result.actions?.length && result.action) {
        recordCompletionsForActions([result.action], text);
      }
      // Smart-brain action (Phase 2): open a website or run a tool.
      if (result.action?.type === 'open_url') {
        // Never window.open here: this runs AFTER an async fetch, so the
        // browser's popup blocker kills the tab (no user activation
        // left) and the user was left with a dead reply — or worse, a
        // raw percent-encoded URL pasted into the chat (his laptop
        // report 2026-10-21). Show a tappable in-app card instead: the
        // tap IS a user gesture, so the site always opens, and the chat
        // text stays clean Urdu with no raw URL.
        setToolAction({ type: 'open_link', url: result.action.url, displayName: result.action.displayName });
      } else if (result.action?.type === 'android_app') {
        setAppBuild({ description: result.action.description });
      } else if (result.action?.type === 'build_app') {
        // احمد's build (Phase 3): light his cabin in the office scene
        // from the REAL job — the card below polls its true status.
        // The board pins the completion only when the card watches
        // the job reach «done» (handleBuildReady), never at order
        // time; the live light goes out on any terminal state
        // (handleBuildSettled / handleBuildFailed).
        setBuildLive({ title: result.action.title || text.slice(0, 40), startedAt: Date.now() });
        setToolAction(result.action as ChatAction);
      } else if (result.action?.type === 'open_tool') {
        // The server may still name a legacy image/video tool — land on
        // its hub + matching section; unknown ids are ignored gracefully.
        const open = resolveToolOpen(result.action.tool);
        if (open) {
          setMediaTool(open.tool);
          setToolSection(open.section);
        }
        if (result.action.phone) {
          setToolPrefill({ phone: result.action.phone });
        }
      } else if (result.action) {
        // Brain-taught learning (Round 5): when the brain saves a
        // note (save_note), the taught statement ALSO feeds the
        // learning store — silently: no extra card, no announcement;
        // the note card below stays the only visible result.
        if (result.action.type === 'save_note' && typeof result.action.text === 'string') {
          try {
            learnFromText(window.localStorage, result.action.text, 'told');
          } catch {
            // learning is a silent bonus; the note card is the result
          }
        }
        // Professional toolbox actions: search, weather, videos, timer, notes, etc.
        setToolAction(result.action as ChatAction);
      }
      // The assistant speaks EVERY reply aloud automatically — no mic or button needed.
      // Owner snapshot travels with the reply (role-swap fix).
      void playAssistantMessage(result.text, speechTicket, sendFemale);
    } catch (sendError) {
      // Remove the streaming placeholder on failure
      setAgentTeam(null);
      setIsPreparingVoice(false);
      updateConversation(id, (item) => ({
        ...item,
        messages: item.messages.filter((m) => m.id !== assistantId),
      }));
      const failureMessage = getErrorMessage(sendError);
      // CALL (Phase 4): a call utterance whose turn failed still gets
      // an answer on the caller — the same failure words this device
      // is about to speak locally, never silence.
      if (pendingCallReplyRef.current) {
        const resolveCall = pendingCallReplyRef.current;
        pendingCallReplyRef.current = null;
        resolveCall(failureMessage);
      }
      // Speak WHY it failed, in Urdu — in hands-free use the user may never
      // look at the screen, and a silent failure reads as "the app is
      // dead". The spoken path also resumes the live mic for the next
      // turn. setError runs after, because playAssistantMessage clears
      // the error banner on entry.
      void playAssistantMessage(failureMessage, speechTicket, sendFemale);
      setError(failureMessage);
    }
  }

  function appendWebsiteCommandExchange(userText: string, assistantText: string) {
    let conversation = activeConversation;
    if (!conversation) {
      conversation = {
        id: createId(),
        title: userText.length > 42 ? `${userText.slice(0, 42).trim()}…` : userText,
        updatedAt: new Date().toISOString(),
        messages: [],
      };
      setConversations((current) => [conversation!, ...current]);
      setActiveId(conversation.id);
    }
    const id = conversation.id;
    const now = new Date().toISOString();
    const userMessage: ChatMessage = { id: createId(), role: 'user', content: userText, createdAt: now };
    const assistantMessage: ChatMessage = { id: createId(), role: 'assistant', content: assistantText, createdAt: now };
    updateConversation(id, (item) => ({
      ...item,
      title: item.messages.length === 0 ? (userText.length > 42 ? `${userText.slice(0, 42).trim()}…` : userText) : item.title,
      updatedAt: now,
      messages: [...item.messages, assistantMessage],
    }));
  }

  // Document download requests («ڈاؤن لوڈ لنک دو», «PDF دو», "download
  // my CV") for the document a tool generated most recently (CV /
  // invoice / assignment — the tools remember it via lib/doc-pdf).
  // Served entirely on-device: a spoken confirmation plus a download
  // card whose button builds the REAL PDF in the browser. This is the
  // fix for his report that asking in chat for his CV's PDF ended at
  // "میرے پاس permission نہیں ہے" — the file was on his own device all
  // along; the chat just never connected the request to it. When no
  // document has been generated yet, the request falls through to the
  // normal chat flow untouched.
  function handleDocumentDownloadRequest(textValue: string): boolean {
    const text = textValue.trim();
    if (!text || text.length > 120) return false;
    const namesDoc = /(pdf|پی\s?ڈی\s?ایف|سی\s?وی|cv|ریزیومے|resume|انوائس|invoice|اسائنمنٹ|assignment|فائل|دستاویز)/i.test(text);
    const wantsFile = /(ڈاؤن\s?لوڈ|ڈاؤنلوڈ|download)/i.test(text)
      || (/(لنک|فائل)\s*(دو|دے\s?دو|بھیج|بھیجو|چاہیے)/.test(text) && namesDoc)
      || (namesDoc && /(دو|دے\s?دو|بھیج|بھیجو|چاہیے|لاؤ|لادو)/.test(text) && /(pdf|پی\s?ڈی\s?ایف)/i.test(text));
    if (!wantsFile) return false;
    const doc = loadLastDocument();
    if (!doc) return false;
    const reply = `یہ رہی آپ کی فائل — «${doc.title}» 👇 نیچے دیے گئے بٹن سے PDF ڈاؤن لوڈ کر لیں۔`;
    appendWebsiteCommandExchange(text, reply);
    setToolAction({ type: 'doc_download', title: doc.title, filename: doc.filename, html: doc.html });
    playAssistantMessage(reply);
    return true;
  }

  // Video Maker status: «میرا کام کہاں تک پہنچا؟» / «میری ویڈیو بن گئی؟»
  // answered from the maker's REAL job state in localStorage.
  // LIVE-TEST FIX (2026-10-29): the old rule let a generic question
  // about a DONE video job fall through to Gemini, which errored and
  // gave no status at all. Now (see shouldInterceptVideoMakerStatus
  // in lib/video-maker.ts): any video job — building, rendering,
  // done or failed — intercepts a status question, UNLESS the
  // question clearly names an app/game/software (then the server
  // builder path runs untouched). The reply opens the Video Maker
  // panel so a finished video's download button is one tap away —
  // and a "done" answer never invents a link: the file lives only
  // in the session that rendered it, which the reply says plainly.
  function handleVideoMakerStatusQuery(textValue: string): boolean {
    const text = textValue.trim();
    if (!text || !isVideoMakerStatusQuery(text)) return false;
    let job = null as ReturnType<typeof loadVideoMakerJob>;
    try {
      job = loadVideoMakerJob(window.localStorage);
    } catch {
      return false;
    }
    if (!shouldInterceptVideoMakerStatus(text, job)) return false;
    const reply = videoMakerStatusText(job);
    let conversation = activeConversation;
    if (!conversation) {
      conversation = {
        id: createId(),
        title: text.length > 42 ? `${text.slice(0, 42).trim()}…` : text,
        updatedAt: new Date().toISOString(),
        messages: [],
      };
      setConversations((current) => [conversation!, ...current]);
      setActiveId(conversation.id);
    }
    const id = conversation.id;
    const now = new Date().toISOString();
    updateConversation(id, (item) => ({
      ...item,
      updatedAt: now,
      messages: [
        ...item.messages,
        { id: createId(), role: 'user' as const, content: text, createdAt: now },
        { id: createId(), role: 'assistant' as const, content: reply, createdAt: now },
      ],
    }));
    setMediaTool('video_tools');
    setToolSection('video_maker');
    void playAssistantMessage(reply);
    return true;
  }

  // Brain builder (Phase 3): the build card watched احمد's job reach
  // "done" — announce it in the conversation and SPEAK the ready
  // line. Fires once per watched build (the card guards re-fires);
  // a build the user only asks about afterwards is announced by that
  // reply's own text, not from here.
  function handleBuildReady(title: string) {
    const text = `آپ کی چیز ریڈی ہو گئی ہے — «${title}» 🎉 نیچے کارڈ سے کھولیں یا ڈاؤن لوڈ کر لیں۔`;
    if (activeId) {
      const now = new Date().toISOString();
      updateConversation(activeId, (item) => ({
        ...item,
        updatedAt: now,
        messages: [...item.messages, { id: createId(), role: 'assistant' as const, content: text, createdAt: now }],
      }));
    }
    void playAssistantMessage('آپ کی چیز ریڈی ہو گئی ہے۔');
    // Office scene + board (Phase 4): احمد's build is truly done —
    // his cabin light goes out and the completion is pinned on
    // today's board (this is the ONLY place a build is recorded:
    // watched reaching «done», never at order time).
    setBuildLive(null);
    try {
      const def = agentForActionType('build_app');
      if (def) {
        setBoardEntries(recordBoardCompletion(window.localStorage, {
          agentKey: def.key,
          person: def.person,
          icon: def.icon,
          label: `«${title}» بنائی`,
        }));
      }
    } catch { /* board is a courtesy */ }
  }

  /** A build ended without a product (failed/vanished): احمد's
   *  cabin light goes out; nothing is pinned on the board. */
  function handleBuildFailed() {
    setBuildLive(null);
  }

  /** A build card saw its job reach ANY terminal state (including a
   *  status-replay card mounted after completion): the live light
   *  must not outlive the job. */
  function handleBuildSettled() {
    setBuildLive(null);
  }

  function handleVoiceWebsiteCommand(recognizedText: string): boolean {
    const command = parseWebsiteCommand(recognizedText);
    if (!command) return false;
    // An UNRECOGNIZED name is not a website to open — it is a search
    // request. The old path built a google.com/search URL and tried to
    // window.open it; the popup blocker killed the tab and the raw
    // percent-encoded URL landed in the chat as the "reply" (user's
    // laptop screenshot 2026-10-21). Let it fall through to the normal
    // chat pipeline instead: the brain answers in chat and its results
    // render as in-app cards (search_results / youtube_results, or a
    // tappable open_link card) — never a raw URL in the message text.
    if (command.isSearchFallback) return false;

    let confirmation: string;
    if (command.prefillText) {
      // Check if the URL has the text pre-filled (wa.me, youtube search, etc.)
      const urlHasPrefill = command.url.includes(encodeURIComponent(command.prefillText).slice(0, 20))
        || command.url.includes('text=') || command.url.includes('search_query=') || command.url.includes('?q=');
      if (urlHasPrefill) {
        confirmation = `جی، ${command.displayName} کھول رہا ہوں — آپ کا ٹیکسٹ پہلے سے لکھا ہوگا۔`;
      } else {
        // Site doesn't support URL pre-fill — copy to clipboard, user pastes.
        try {
          navigator.clipboard.writeText(command.prefillText);
          confirmation = `جی، ${command.displayName} کھول رہا ہوں — آپ کا ٹیکسٹ کاپی کر لیا ہے، وہاں paste کر دیں۔`;
        } catch {
          confirmation = `جی، ${command.displayName} کھول رہا ہوں — ٹیکسٹ یہ ہے: ${command.prefillText}`;
        }
      }
    } else {
      // (Search fallbacks returned earlier — this is always a known site.)
      confirmation = `جی، ${command.displayName} کھول رہا ہوں۔`;
    }

    let opened = false;
    try {
      opened = window.open(command.url, '_blank', 'noopener,noreferrer') !== null;
    } catch {
      opened = false;
    }
    if (!opened) {
      // Voice commands carry no user activation, so the popup blocker
      // usually stops this open. The old reply pasted the raw URL into
      // the chat ("یہ لنک خود کھول لیں: https://…%D8%A7…") — exactly
      // what the user complained about. Now: a clean spoken/chat
      // message (NO raw URL) plus a tappable in-app card; the tap is a
      // real user gesture, so the site opens from it every time.
      setToolAction({ type: 'open_link', url: command.url, displayName: command.displayName });
    }
    const assistantText = opened
      ? confirmation
      : `${confirmation} — نیا ٹیب خود نہ کھل سکا، نیچے «${command.displayName} کھولیں» کے بٹن سے کھول لیں۔`;
    appendWebsiteCommandExchange(recognizedText, assistantText);
    playAssistantMessage(assistantText);
    return true;
  }

  /**
   * Focus commands — the user's "one thing at a time" vision: name a thing
   * (map / WhatsApp / Quran) and ONLY that thing fills the screen. These
   * are SCENES, not tools — the tools grid itself is gone (Phase سادگی):
   * «ٹولز کھولو» is no longer a local command at all and simply reaches
   * the brain, which explains that everything is done by voice here.
   * Saying "واپس" (or "بند کرو") closes a scene and returns to the
   * simple display.
   */
  function handleFocusCommand(recognizedText: string): boolean {
    // Close/back — only meaningful when a focus view is open, and only
    // as a SHORT command: a long message that happens to contain
    // «واپس» is conversation, not a close order.
    if (focusView && isCommandShapedText(recognizedText, 6) && /(واپس|پیچھے|بند کرو|بند کر|back|close)/i.test(recognizedText)) {
      setFocusView(null);
      const msg = 'ٹھیک ہے، واپس آ گئے۔';
      appendWebsiteCommandExchange(recognizedText, msg);
      playAssistantMessage(msg);
      return true;
    }
    // CLASS GATE (router-hijack fix): every canned command below —
    // named-surah recitation, generic تلاوت, focus opens — fires ONLY
    // on a command-shaped (short) utterance. Anything longer passes
    // through to the brain untouched, even if it names a surah, the
    // Quran or a map in passing.
    if (!isCommandShapedText(recognizedText)) return false;
    // NAMED-SURAH commands («سورۃ ناس پڑھ کر سناؤ», "Surah Yaseen sunao",
    // «سورت 114 سناؤ»): the focus routing below only knew the word
    // «قرآن», so a surah named WITHOUT that word fell through to the
    // brain — which just replied «قرآن پاک کھول رہا ہوں» and nothing
    // played; and the old autoplay always played Al-Fatiha regardless
    // of the name. Parse the surah explicitly and route it, from the
    // main chat AND when the reader is already open (a fresh request
    // re-opens the reader on the named surah).
    const reciteIntent = /(سناؤ|سناو|سنا دو|سنا دیں|تلاوت|پڑھ کر سنا|پڑھو|پڑھیں|سننا|recite|recitation|play|sunao|suna do|parho|tilawat)/i.test(recognizedText);
    const openIntent = /(کھول|کھولو|دکھا|open)/i.test(recognizedText);
    const namedSurah = parseSurahReference(recognizedText);
    const mentionsSurahWord = /(سورت|سورۃ|سورة|سورہ|surah)/i.test(recognizedText);
    const mentionsQuranWord = /(قرآن|quran)/i.test(recognizedText);
    if (namedSurah && (reciteIntent || openIntent)) {
      const reply = reciteIntent
        ? `📖 ${surahDisplayName(namedSurah)} سنائی جا رہی ہے — اردو ترجمے کی تلاوت شروع ہو رہی ہے۔ واپس آنے کے لیے «واپس» کہیں۔`
        : `📖 ${surahDisplayName(namedSurah)} کھول دی ہے۔ واپس آنے کے لیے «واپس» کہیں۔`;
      appendWebsiteCommandExchange(recognizedText, reply);
      playAssistantMessage(reply);
      setFocusView('quran');
      requestQuran(namedSurah, reciteIntent);
      setDraft('');
      return true;
    }
    if (reciteIntent && (mentionsQuranWord || mentionsSurahWord || /تلاوت/.test(recognizedText))) {
      // No name given: «کوئی بھی سورت سناؤ» → a short COMPLETE surah
      // (An-Nas) rather than nothing; the generic «تلاوت سناؤ» keeps its
      // established Al-Fatiha autoplay.
      const target = mentionsSurahWord ? 114 : 1;
      const reply = target === 114
        ? `📖 ${surahDisplayName(114)} سنائی جا رہی ہے — اردو ترجمے کی تلاوت شروع ہو رہی ہے۔ واپس آنے کے لیے «واپس» کہیں۔`
        : '📖 قرآن پاک سامنے ہے — تلاوت سنائی جا رہی ہے۔ واپس آنے کے لیے «واپس» کہیں۔';
      appendWebsiteCommandExchange(recognizedText, reply);
      playAssistantMessage(reply);
      setFocusView('quran');
      requestQuran(target, true);
      setDraft('');
      return true;
    }
    const hasVerb = /(دکھا|دکھاؤ|کھول|کھولو|اوپن|کرو|کر دو|show|open|چاہیے|لگاؤ|بتاؤ)/i.test(recognizedText);
    const isShort = recognizedText.trim().split(/\s+/).length <= 6;
    // A no-verb QUESTION about a thing («ٹول باکس میں کیا ہوتا ہے») is a
    // chat question for Gemini, not a command to open that thing.
    const isQuestion = /(کیا|کیوں|کب|کہاں|کیسے)/.test(recognizedText);
    // "Recite for me" — the user asked to HEAR the Quran, so merely opening
    // the reader is not enough; QuranReader auto-plays on the bump below.
    const wantsRecite = /(سناؤ|تلاوت|پڑھو|سننا|recite|listen)/i.test(recognizedText);
    const focusTargets: Array<[RegExp, 'map' | 'whatsapp' | 'quran', string, string]> = [
      [/(نقشہ|نقشے|\bmap\b)/i, 'map', '🗺️ نقشہ', '🗺️ نقشہ سامنے ہے — جگہ تلاش کریں یا راستہ دیکھیں۔ واپس آنے کے لیے «واپس» کہیں یا ✕ دبائیں۔'],
      [/(واٹس ایپ|واٹس‌ایپ|whatsapp)/i, 'whatsapp', '💬 WhatsApp', '💬 WhatsApp سامنے ہے — نمبر اور پیغام لکھ کر بھیجیں۔ واپس آنے کے لیے «واپس» کہیں۔'],
      [/(قرآن|quran)/i, 'quran', '📖 قرآن پاک', '📖 قرآن پاک سامنے ہے — سورت منتخب کریں۔ واپس آنے کے لیے «واپس» کہیں۔'],
    ];
    for (const [pattern, view, , reply] of focusTargets) {
      const gateOk = hasVerb || (isShort && !isQuestion) || (view === 'quran' && wantsRecite);
      if (pattern.test(recognizedText) && gateOk) {
        // Repeat-fire guard: if this view is ALREADY open, the same
        // canned open line must not be emitted again for a new input —
        // the message falls through to the brain and gets a real
        // answer. (An explicit recitation request while the reader is
        // open still fires — that IS the command's content.)
        if (focusView === view && !(view === 'quran' && wantsRecite)) {
          return false;
        }
        setFocusView(view);
        if (view === 'quran' && wantsRecite) {
          requestQuran(1, true);
        }
        appendWebsiteCommandExchange(recognizedText, reply);
        playAssistantMessage(reply);
        return true;
      }
    }
    return false;
  }

  function deleteConversation(id: string) {
    if (!window.confirm('کیا اس آلے سے یہ گفتگو حذف کرنی ہے؟')) return;
    if (activeId === id) interruptSpeech('chat-switch'); // don't let a deleted chat keep talking
    setConversations((current) => current.filter((conversation) => conversation.id !== id));
    if (activeId === id) setActiveId(null);
  }

  function clearHistory() {
    if (!conversations.length || !window.confirm('کیا اس browser میں محفوظ تمام گفتگوئیں حذف کرنی ہیں؟')) return;
    setConversations([]);
    setActiveId(null);
    setShowHistory(false);
  }

  function pickUrduMaleVoice(): SpeechSynthesisVoice | undefined {
    // ABSOLUTE rule (user demand): NEVER a female voice on Unique's
    // turns. A browser voice is used ONLY when its name EXPLICITLY
    // signals male — on Samsung devices the first Urdu voice is
    // Google's FEMALE Urdu voice with NO female marker in its name, so
    // "not obviously female" is not good enough and positional
    // fallbacks (first Urdu/Hindi/any voice) kept letting her speak.
    // No explicit male marker → undefined: silence + an on-screen Urdu
    // reason is correct, a female voice never is. The implementation
    // (female names excluded FIRST — "female" contains "male", the
    // substring trap that let a female voice through in 2026-10-22 —
    // then a standalone "male" word or a known male name; Urdu →
    // Hindi → any) lives in lib/persona, shared verbatim so the
    // separation from Uniqa's picker is unit-proven there.
    return pickUrduMaleVoiceFrom(window.speechSynthesis.getVoices());
  }

  function pickUrduFemaleVoice(): SpeechSynthesisVoice | undefined {
    // UNIQA's browser fallback — the exact mirror of the male rule:
    // explicitly-male names (standalone "male", Salman/Asad/Salim) are
    // rejected FIRST, an explicit female signal is required, and no
    // qualifying voice means silence rather than Unique's voice ever
    // speaking her words.
    return pickUrduFemaleVoiceFrom(window.speechSynthesis.getVoices());
  }

  function stopSpeaking() {
    if (serverAudioRef.current) {
      serverAudioRef.current.pause();
      serverAudioRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    setIsPreparingVoice(false);
  }

  // THE hard stop (barge-in / tap-to-interrupt / «رکو» / chat switch):
  // unlike stopSpeaking() — which only silences the sound of the current
  // instant — this orphans the whole speech: the ticket bump means no
  // queued chunk, no pending eager audio and no browser-voice sentence
  // can ever start after this call, the speech span closes at once, and
  // in live mode the mic is invited back so the user's new turn can be
  // captured (the barge-in adoption path has already moved its session
  // into continuousRecognitionRef, which this deliberately never stops).
  // STOP REASON (2026-10-26 truncation fix): when a reply that was
  // already audible stops, the user must SEE why it stopped — a
  // silent ticket bump after the eager first line read exactly like
  // the one-line truncation bug. Only labelled call sites set a
  // banner, and only when something was actually speaking; every
  // other interruptSpeech() call keeps its old silent behaviour.
  type InterruptReason = 'stop-phrase' | 'barge-in' | 'tap' | 'chat-switch' | 'chat-cleared';
  function interruptReasonText(reason: InterruptReason): string {
    switch (reason) {
      case 'stop-phrase': return 'جواب آپ کے «رکو» کہنے پر روک دیا گیا — باقی حصہ اسکرین پر موجود ہے۔';
      case 'barge-in': return 'جواب اس لیے روک دیا گیا کہ آپ نے بیچ میں بولنا شروع کر دیا — باقی حصہ اسکرین پر موجود ہے۔';
      case 'tap': return 'جواب آپ کے ٹیپ کرنے پر روک دیا گیا — باقی حصہ اسکرین پر موجود ہے۔';
      case 'chat-switch': return 'جواب گفتگو بدلنے پر روک دیا گیا — باقی حصہ اسکرین پر موجود ہے۔';
      case 'chat-cleared': return 'جواب گفتگو صاف کرنے پر روک دیا گیا — باقی حصہ اسکرین پر موجود ہے۔';
    }
  }
  function interruptSpeech(reason?: InterruptReason) {
    const wasAudible = ttsActiveRef.current || isSpeaking;
    speechTicketRef.current += 1;
    ttsPrefetchRef.current = null;
    stopBargeInListener();
    stopSpeaking();
    ttsActiveRef.current = false;
    currentSpeechTextRef.current = '';
    setSpeechReplayText(null); // a stop is not a failure — no stale replay offer
    lastSpokenRef.current = null; // the interrupted reply may be replayed fresh later
    if (reason && wasAudible) setSpeechNotice(interruptReasonText(reason));
    if (continuousIntendedRef.current) scheduleLiveMicReopen(500);
  }

  // Whole-reply browser voice (2026-10-26 voice rebuild): the
  // SINGLE awaited browser-voice path, replacing the old
  // speakNow/speakWithBrowser pair (which were fire-and-forget and
  // reported failure only via the tiny-X setError channel). Resolves
  // `{ heard: true }` only when a sentence actually started sounding
  // (utterance onstart); `{ heard: false }` with a plain reason when
  // no qualifying voice of THIS persona's gender exists on the
  // device, or every sentence failed. The strict pickers are
  // unchanged — the other gender's voice is never used, and the
  // caller (the voice engine) turns a failure into a readable
  // banner + Replay offer, never into silence.
  async function speakBrowserWhole(text: string, ticket?: number, female = false): Promise<{ heard: boolean; reason: string }> {
    if (!appSettings.voiceEnabled) { ttsActiveRef.current = false; return { heard: false, reason: 'voice-off' }; }
    if (!('speechSynthesis' in window)) {
      ttsActiveRef.current = false;
      return { heard: false, reason: 'no-speech-synthesis' };
    }
    const stale = () => ticket !== undefined && ticket !== speechTicketRef.current;
    if (stale()) return { heard: false, reason: 'stopped' };
    const synth = window.speechSynthesis;
    // Chrome loads voices asynchronously; wait (once, bounded) for
    // the list instead of speaking into silence.
    let voices = synth.getVoices();
    if (voices.length === 0) {
      voices = await new Promise<SpeechSynthesisVoice[]>((resolve) => {
        let settled = false;
        const go = () => {
          if (settled) return;
          settled = true;
          synth.removeEventListener('voiceschanged', go);
          resolve(synth.getVoices());
        };
        synth.addEventListener('voiceschanged', go);
        setTimeout(go, 1500);
      });
    }
    if (stale()) return { heard: false, reason: 'stopped' };
    const voice = female ? pickUrduFemaleVoice() : pickUrduMaleVoice();
    if (!voice) {
      ttsActiveRef.current = false;
      setIsPreparingVoice(false);
      setIsSpeaking(false);
      return { heard: false, reason: 'no-browser-voice' };
    }
    // Chrome bug workarounds (kept from speakNow): cancel() then
    // immediate speak() often fails silently, and synthesis can get
    // stuck paused — settle, then resume.
    synth.cancel();
    try { synth.resume(); } catch { /* ignore */ }
    await new Promise((r) => setTimeout(r, 150));
    if (stale()) return { heard: false, reason: 'stopped' };
    setIsPreparingVoice(false);
    const cleanText = text.slice(0, 4000).trim();
    const sentences = cleanText.match(/[^۔.!?\n]+[۔.!?\n]*/g)?.map((s) => s.trim()).filter(Boolean) || [cleanText];
    let heard = false;
    startBargeInListener();
    for (const sentence of sentences) {
      if (stale()) break;
      const started: boolean = await new Promise((resolve) => {
        const utterance = new SpeechSynthesisUtterance(sentence);
        utterance.lang = voice.lang || 'ur-PK';
        utterance.rate = 1.25;
        utterance.volume = 1;
        utterance.pitch = female ? 1.0 : 0.9;
        utterance.voice = voice;
        let sentenceHeard = false;
        utterance.onstart = () => { sentenceHeard = true; setIsSpeaking(true); };
        utterance.onend = () => { setIsSpeaking(false); resolve(sentenceHeard); };
        utterance.onerror = () => {
          // A stop cancels synthesis: that is the ticket dying,
          // not a per-sentence failure — the loop's stale check
          // above stops it there.
          setIsSpeaking(false);
          resolve(sentenceHeard);
        };
        try { synth.resume(); } catch { /* ignore */ }
        synth.speak(utterance);
      });
      if (started) heard = true;
    }
    setIsSpeaking(false);
    return { heard, reason: heard ? '' : 'browser-failed' };
  }

  // Per-CHUNK browser-voice rescue (dropout hardening, 2026-10-23):
  // when one chunk's server chain fails even after its retry, THAT
  // chunk alone is spoken by the browser voice of the SAME persona —
  // the reply never loses the chunk's words and later chunks still get
  // their server voice. Promise-based (unlike the whole-reply
  // speakBrowserWhole) so the caller's chunk queue waits for the chunk
  // to finish before moving on. Resolves false when no qualifying
  // voice exists on this device (the standing notice below explains
  // why) or when the speech ticket died mid-chunk. The picker is the
  // same STRICT one speakBrowserWhole uses — the other gender never speaks.
  function speakChunkWithBrowserVoice(text: string, female: boolean, ticket: number): Promise<boolean> {
    return new Promise((resolve) => {
      if (ticket !== speechTicketRef.current) { resolve(false); return; }
      if (!('speechSynthesis' in window)) { resolve(false); return; }
      const synth = window.speechSynthesis;
      const stale = () => ticket !== speechTicketRef.current;
      const speak = () => {
        if (stale()) { resolve(false); return; }
        const voice = female ? pickUrduFemaleVoice() : pickUrduMaleVoice();
        if (!voice) {
          // No voice of THIS persona's gender on this device — silence
          // with the reason on screen beats the wrong-gender voice.
          setError(female
            ? 'یونیکا کی آواز تیار نہیں ہو سکی (Gemini key چیک کریں) اور اس ڈیوائس میں اس کے لیے اردو آواز انسٹال نہیں۔ Settings میں key چیک کریں۔'
            : 'مردانہ آواز تیار نہیں ہو سکی (Gemini key چیک کریں) اور اس ڈیوائس میں اردو آواز انسٹال نہیں۔ Settings میں key دوبارہ چیک کریں۔');
          resolve(false);
          return;
        }
        const sentences = text.match(/[^۔.!?\n]+[۔.!?\n]*/g)?.map((s) => s.trim()).filter(Boolean) || [text.trim()];
        let idx = 0;
        let spoke = false;
        const next = () => {
          if (stale() || idx >= sentences.length) { resolve(spoke); return; }
          const utterance = new SpeechSynthesisUtterance(sentences[idx]);
          idx += 1;
          utterance.lang = voice.lang || 'ur-PK';
          utterance.rate = 1.25;
          utterance.volume = 1;
          utterance.pitch = female ? 1.0 : 0.9;
          utterance.voice = voice;
          // Playback-verified (2026-10-26 rebuild): onstart, not
          // onend, proves the chunk actually started sounding.
          utterance.onstart = () => { spoke = true; };
          utterance.onend = () => { next(); };
          utterance.onerror = () => {
            // A stop cancels synthesis (interruptSpeech → cancel()):
            // that is the ticket dying, not a per-sentence failure.
            if (stale()) { resolve(false); return; }
            next(); // one bad sentence never swallows the chunk
          };
          try { synth.resume(); } catch { /* ignore */ }
          synth.speak(utterance);
        };
        // Live mode must hear the user over a browser-voice chunk
        // exactly as over the server voice (same hook as speakBrowserWhole).
        startBargeInListener();
        next();
      };
      // Chrome loads voices asynchronously; the list is often empty on
      // the first call — wait for it once, like speakBrowserWhole does.
      if (synth.getVoices().length === 0) {
        let settled = false;
        const onVoices = () => {
          if (settled) return;
          settled = true;
          synth.removeEventListener('voiceschanged', onVoices);
          speak();
        };
        synth.addEventListener('voiceschanged', onVoices);
        setTimeout(onVoices, 1500);
      } else {
        speak();
      }
    });
  }

  // Extract the first speakable chunk (ending with ۔ ! ? . or newline) for TTS prefetch.
  // Triggers early (~20 chars + sentence boundary) so voice starts ASAP.
  // Falls back to first 120 chars if no sentence boundary found yet.
  function extractFirstSentence(text: string): string {
    const match = text.match(/^(.{20,}?[۔.!?\n])/);
    if (match) return match[1].trim();
    if (text.length >= 120) return text.slice(0, 120).trim();
    return '';
  }

  // Play a base64 audio chunk; resolves when playback ends or fails.
  // When a speech ticket is supplied, a chunk whose ticket went stale
  // (interrupted / superseded) NEVER starts — and if the ticket dies
  // mid-play the chunk aborts at once instead of playing out.
  // PLAYBACK-VERIFIED (2026-10-26 voice rebuild): resolves
  // `{ heard: true }` ONLY when audio actually started playing
  // (onplaying fired); a play() rejection or a pre-play error
  // resolves `{ heard: false, blocked: true }` — synthesis alone
  // never counts as heard any more.
  function playAudioChunk(audioBase64: string, mimeType: string, ticket?: number): Promise<{ heard: boolean; blocked: boolean }> {
    return new Promise((resolve) => {
      if (ticket !== undefined && ticket !== speechTicketRef.current) {
        resolve({ heard: false, blocked: false });
        return;
      }
      try {
        const bytes = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: mimeType || 'audio/wav' });
        const url = URL.createObjectURL(blob);
        // Phone: reuse the tap-unlocked persistent element (see the unlock
        // effect) — a fresh element per chunk gets its play() rejected by
        // Android Chrome's autoplay policy. Desktop: original behavior.
        const usePersistent = isMobileTurnMode();
        if (usePersistent && !persistentAudioRef.current) {
          persistentAudioRef.current = new Audio();
        }
        const audio = usePersistent ? persistentAudioRef.current! : new Audio();
        audio.src = url;
        // Every server voice is a natural male voice — Gemini Charon/
        // Fenrir (audio/wav) and Edge Salman (audio/mpeg) alike. Playback
        // runs at TTS_PLAYBACK_RATE (1.1x) with preservesPitch: the user
        // asked for a slightly faster speaking pace (2026-10-21), and
        // pitch-preserved rate change keeps the voice natural. (This is
        // NOT the old 1.08x pitch-down hack for the removed female
        // Google-TTS fallback — that resampled the audio itself and must
        // never touch Salman's Edge voice, which is also MP3.)
        audio.preservesPitch = true;
        audio.playbackRate = TTS_PLAYBACK_RATE;
        serverAudioRef.current = audio;
        let startedPlaying = false;
        audio.onplaying = () => {
          if (ticket !== undefined && ticket !== speechTicketRef.current) {
            // Interrupted in the instant playback began — abort.
            try { audio.pause(); } catch { /* ignore */ }
            done();
            return;
          }
          startedPlaying = true;
          playbackStartedRef.current = true;
          // A server-leg voice is really playing: the chain is warm
          // for the rest of this session (see the warm-up refs).
          sessionVoiceReadyRef.current = true;
          setIsPreparingVoice(false);
          setIsSpeaking(true);
          // Sound is really coming out: in live mode the barge-in
          // listener must be awake from this moment (this also covers
          // the eager chunk, which plays before playAssistantMessage).
          startBargeInListener();
        };
        const done = () => {
          setIsPreparingVoice(false);
          setIsSpeaking(false);
          URL.revokeObjectURL(url);
          if (serverAudioRef.current === audio) serverAudioRef.current = null;
          resolve({ heard: startedPlaying, blocked: false });
        };
        audio.onended = done;
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          if (serverAudioRef.current === audio) serverAudioRef.current = null;
          // An error before onplaying means nothing was heard; an
          // error after playing started still counts as heard.
          resolve({ heard: startedPlaying, blocked: false });
          setIsPreparingVoice(false);
          setIsSpeaking(false);
          if (serverAudioRef.current === audio) serverAudioRef.current = null;
        };
        audio.play().catch(() => {
          // Blocked (autoplay policy) or failed before starting —
          // record it so the engine falls back to the browser voice
          // on desktop exactly as on phones (old code gated this
          // check to mobile only).
          playbackBlockedRef.current = true;
          URL.revokeObjectURL(url);
          if (serverAudioRef.current === audio) serverAudioRef.current = null;
          setIsPreparingVoice(false);
          setIsSpeaking(false);
          resolve({ heard: false, blocked: true });
        });
      } catch {
        resolve({ heard: false, blocked: false });
      }
    });
  }

  // Fire the one-time session warm-up probe (see the refs above): a
  // single tiny synthesis through the normal chain, its audio thrown
  // away. Idempotent — later calls return at once. Triggered by the
  // first user interaction and again (harmlessly) at the top of
  // playAssistantMessage, so a session that somehow starts speaking
  // without a prior tap still warms before its second reply.
  function warmUpVoiceChain() {
    if (voiceWarmupStartedRef.current) return;
    voiceWarmupStartedRef.current = true;
    if (!appSettings.voiceEnabled) return;
    voiceWarmupPromiseRef.current = synthesizeWithTimeout('السلام علیکم', 12000, personaRef.current === 'uniqa')
      .then((audio) => {
        if (audio) sessionVoiceReadyRef.current = true;
      })
      .catch(() => { /* the probe is best-effort; real replies retry the chain themselves */ });
  }

  // Wrapper: synthesize with per-leg timeouts so a hung TTS request
  // can't lock the UI. Voice chain depends on the selected voice:
  //  - 'Salman' (default, PRIMARY): (1) client-side Edge TTS (Salman)
  //    straight from this browser — fast, free, no key, NO daily quota;
  //    (2) server Edge TTS (same Salman voice via our server — slower,
  //    Microsoft throttles datacenter IPs); (3) Gemini TTS as backup.
  //  - 'Charon'/'Fenrir': Gemini TTS first (original behavior), then
  //    client-side Salman, then server Edge, before giving up.
  // Each leg runs only if the previous one failed, and each keeps its
  // own timeout budget (client leg: timeoutMs; server Edge: its 20s
  // internal cap; Gemini: its per-key 15s cap) — no single outer race
  // cutting the fallback legs off before they can start.
  // If all legs fail, the Gemini classification (quota/auth/network)
  // explains WHY in Urdu. NEVER-DOWN (2026-10-25): NO leg is ever
  // muted for the session — a transient failure must never silence
  // later chunks; every chunk retries the full order fresh.
  // Returns null on failure (caller falls back to browser voice).
  function synthesizeWithTimeout(text: string, timeoutMs = 12000, female = false): Promise<{ audioBase64: string; mimeType: string } | null> {
    // Keys changed since the last attempt? Reset the diagnostic
    // counters — the new keys may work even if the old failed. (No
    // leg is ever skipped on these counters any more — 2026-10-25.)
    try {
      const fp = getGeminiKeys().join('|');
      if (ttsKeysFingerprintRef.current !== fp) {
        ttsKeysFingerprintRef.current = fp;
        serverTtsDownRef.current = false;
        serverTtsFailsRef.current = 0;
      }
    } catch { /* ignore */ }
    // Per-reply circuit: a new speech ticket starts fresh; an old
    // reply's dead-leg verdicts never leak into the next reply.
    // (New keys also reset it, via the fingerprint block above
    // combined with the ticket check on the next reply.)
    if (replyCircuitRef.current.ticket !== speechTicketRef.current) {
      replyCircuitRef.current = { ticket: speechTicketRef.current, geminiDead: false, edgeDeadUntil: 0 };
    }
    const circuit = replyCircuitRef.current;
    // ── UNIQA's voice chain (Phase 2) ─────────────────────────────────
    // STRICTLY separate from Unique's chain below: Salman's legs are
    // NEVER in her chain and her legs are never in his — no accidental
    // cross-gender audio, ever. UNIQA-ONLY ORDER (2026-10-24, user-
    // approved): Gemini Sulafat FIRST, then server Edge (Uzma), then
    // client Edge (Uzma) last; if all fail, the caller falls back to
    // the strict female browser picker. WHY this order: on 2026-10-24
    // the server Edge leg answered 502 for BOTH voices from Render
    // (throttled datacenter IP) and the client Edge leg can never
    // connect from Chrome/ChromeOS (UA rejection) — so putting Edge
    // first burned 20s+ per chunk before Gemini, the leg proven to
    // speak for Unique on the same laptop, ever got a chance, and
    // Uniqa was heard as silent. Unique's chain below is UNTOUCHED
    // by this change.
    if (female) {
      const runUniqaChain = async (): Promise<{ audioBase64: string; mimeType: string } | null> => {
        // Leg 1: Gemini — Sulafat, her female voice. NEVER-DOWN
        // (2026-10-25): NO session mute — this leg is attempted on
        // EVERY chunk, and api.ts rotates through ALL saved keys per
        // call. A quota/auth answer kills only that key for this call
        // (api.ts moves on to the next key); it never mutes Uniqa, and
        // never Unique. A Gemini failure here must NOT end the chain
        // — Edge legs below still get their chance on this same chunk.
        // Fail-fast (2026-10-26): a quota/auth answer in this reply
        // means Gemini will not revive for later chunks — skip it
        // at once instead of re-asking a dead key per chunk.
        if (!circuit.geminiDead) {
          try {
            const r = await synthesizeMairaSpeech({ text, female: true });
            serverTtsFailsRef.current = 0;
            if (r) return r;
          } catch (e: any) {
            if (e?.data?.errorType === 'quota' || e?.data?.errorType === 'auth') {
              circuit.geminiDead = true;
              lastLegFailuresRef.current.gemini = e.data.errorType;
            } else {
              lastLegFailuresRef.current.gemini = e?.data?.errorType || 'network';
              serverTtsFailsRef.current += 1;
            }
          }
        }
        // Leg 2: server-side Edge — Uzma (POST /api/tts/edge with
        // voice:'uniqa'). NO session lockout (2026-10-24 fix): this leg
        // is attempted on every chunk — a transient Edge failure must
        // never mute her for the session. Fail-fast (2026-10-26):
        // Edge throttling lasts minutes, so if it failed in this
        // reply within the last 60s, do not burn another 20s cap
        // on it for this chunk — the client Edge leg below (real in
        // an Edge browser, fail-fast memoised in Chrome) still runs.
        if (Date.now() >= circuit.edgeDeadUntil) {
          try {
            const r = await synthesizeEdgeSpeech({ text, voice: 'uniqa' });
            if (r) return r;
          } catch {
            circuit.edgeDeadUntil = Date.now() + 60000;
            lastLegFailuresRef.current.edge = true;
            /* fall through to client Edge */
          }
        }
        // Leg 3: client-side Edge — Uzma synthesized in this browser.
        // On his Chrome devices Microsoft rejects the handshake exactly
        // as for Salman (the shared module memoizes that failure and
        // fails fast), so this is only a real leg in an Edge browser.
        try {
          const r = await synthesizeUniqaClientSide(text, timeoutMs);
          if (r) return r;
        } catch {
          lastLegFailuresRef.current.edge = true;
          /* fall through to browser fallback */
        }
        lastVoiceFailureRef.current = circuit.geminiDead ? 'quota' : 'edge';
        setError('⚠️ یونیکا کی آواز وقتی طور پر نہیں بن سکی — Settings میں Gemini key چیک کریں یا تھوڑی دیر بعد پھر کوشش کریں۔');
        return null;
      };
      return runUniqaChain();
    }
    // Selected voice: 'Salman' | 'Charon' | 'Fenrir'. Default is 'Salman'
    // (Edge). Note: Google (female) voice option was removed per user
    // demand 2026-10-19 — a stale 'Google' selection migrates to 'Salman'.
    let selection = 'Salman';
    try {
      const stored = localStorage.getItem('unique-ai-voice');
      if (stored === 'Charon' || stored === 'Fenrir' || stored === 'Salman') {
        selection = stored;
      } else if (stored === 'Google') {
        localStorage.setItem('unique-ai-voice', 'Salman');
      }
    } catch { /* ignore */ }
    const tryBoth = async (): Promise<{ audioBase64: string; mimeType: string } | null> => {
      // Gemini leg. NEVER-DOWN (2026-10-25): attempted on every chunk
      // with all saved keys in rotation — never muted for the session.
      // Its classified error is captured, not shown yet — the Edge leg
      // may still save this reply.
      let geminiErr: any = null;
      // NEVER-DOWN (2026-10-25): no session gate — Gemini is attempted
      // on every chunk, rotating through all saved keys per call.
      const attemptGemini = async (): Promise<{ audioBase64: string; mimeType: string } | null> => {
        try {
          const result = await synthesizeMairaSpeech({ text });
          serverTtsFailsRef.current = 0;
          return result;
        } catch (e: any) {
          geminiErr = e;
          lastLegFailuresRef.current.gemini = e?.data?.errorType || 'network';
          // Fail-fast (2026-10-26): quota/auth will not revive
          // for later chunks of this reply — skip Gemini then.
          if (e?.data?.errorType === 'quota' || e?.data?.errorType === 'auth') {
            circuit.geminiDead = true;
          }
          return null;
        }
      };
      // Salman-leg failures are CAPTURED, not swallowed: when Salman is
      // the selected voice, its classified failure is the honest reason
      // to surface (below) — swallowing it made Salman failures totally
      // invisible, so the user only ever heard Gemini and concluded
      // Salman never ran. A failure here is transient (network); it
      // must NOT set serverTtsDownRef or mute anything.
      let salmanErr: any = null;
      // Client-side Edge leg — Salman synthesized in THIS browser
      // over a direct WebSocket (see lib/edge-tts). No key, no quota,
      // and fast because residential IPs aren't throttled like
      // Render's.
      const attemptClientEdge = async (): Promise<{ audioBase64: string; mimeType: string } | null> => {
        try {
          return await synthesizeSalmanClientSide(text, timeoutMs);
        } catch (e: any) {
          if (!salmanErr) salmanErr = e;
          lastLegFailuresRef.current.edge = true;
          return null;
        }
      };
      // Server Edge leg — same Salman voice via /api/tts/edge. No key,
      // no quota, but slow when Microsoft throttles the datacenter IP.
      // Same transient-failure semantics as the client leg.
      const attemptEdge = async (): Promise<{ audioBase64: string; mimeType: string } | null> => {
        try {
          return await synthesizeEdgeSpeech({ text });
        } catch (e: any) {
          if (!salmanErr) salmanErr = e;
          lastLegFailuresRef.current.edge = true;
          // Fail-fast (2026-10-26): Edge throttling lasts minutes —
          // mark it dead for 60s of this reply, not for the session.
          circuit.edgeDeadUntil = Date.now() + 60000;
          return null;
        }
      };
      let result: { audioBase64: string; mimeType: string } | null = null;
      let spokeViaGemini = false;
      if (selection === 'Salman') {
        result = await attemptClientEdge();
        if (!result && Date.now() >= circuit.edgeDeadUntil) result = await attemptEdge();
        if (!result && !circuit.geminiDead) {
          result = await attemptGemini();
          spokeViaGemini = !!result;
        }
      } else {
        if (!circuit.geminiDead) result = await attemptGemini();
        if (!result) result = await attemptClientEdge();
        if (!result && Date.now() >= circuit.edgeDeadUntil) result = await attemptEdge();
      }
      // Gemini bookkeeping (2026-10-25 NEVER-DOWN): a quota/auth answer
      // is NO LONGER a session mute — the next chunk retries all keys
      // fresh. (The female Google voice is NEVER a fallback — user
      // demand.) Nothing is recorded here that gates a later chunk.
      if (result) {
        // Salman was selected but only Gemini could speak: SAY so on
        // screen instead of staying silent — otherwise the user hears
        // the wrong voice with no explanation (his laptop report:
        // «جیمینائی کے بغیر آواز نہیں آتی», with no sign Salman ran).
        if (selection === 'Salman' && spokeViaGemini && salmanErr) {
          setError('⚠️ سلمان کی آواز اس براؤزر سے نہیں بن سکی — یہ جواب Gemini کی آواز میں سنایا گیا ہے۔');
        }
        return result;
      }
      // All legs failed — explain WHY the male voice stopped. When
      // Salman is the selected voice and the Salman legs failed, THEIR
      // classification is the reason: blaming the Gemini key's quota
      // for a Salman failure sent the user fixing keys that were never
      // the problem (Salman needs no key at all). Gemini's
      // classification is used only when the Salman legs recorded
      // nothing.
      const errorType = (selection === 'Salman' && salmanErr?.data?.errorType)
        || geminiErr?.data?.errorType
        || 'network';
      const reasonMsg =
        errorType === 'quota'
          ? '⚠️ تمہاری key کی آج کی حد ختم ہو گئی ہے — نئی key لگاؤ یا کل انتظار کرو۔'
          : errorType === 'auth'
            ? '⚠️ تمہاری key میں مسئلہ ہے — Settings میں key دوبارہ چیک کرو۔'
            : errorType === 'network'
              ? '⚠️ نیٹ سست ہے — مردانہ آواز بنانے میں دیر ہو رہی ہے۔ دوبارہ کوشش کرو۔'
              : '⚠️ مردانہ آواز وقتی طور پر بند ہے — دوبارہ کوشش کرو۔';
      // Show the reason (stays visible so the user knows what to fix).
      lastVoiceFailureRef.current = errorType;
      setError(reasonMsg);
      // Diagnostic counter only (2026-10-25): soft failures are counted
      // but NEVER mute a later chunk — return null and let the caller
      // try the browser voice for this chunk, then retry the full
      // chain fresh on the next chunk. Judged on GEMINI's own error
      // type, not the surfaced one.
      const geminiErrorType = geminiErr?.data?.errorType;
      if (geminiErr && geminiErrorType !== 'quota' && geminiErrorType !== 'auth') {
        serverTtsFailsRef.current += 1;
      }
      return null;
    };
    // No outer race: each leg carries its own timeout budget, and a
    // single 12s cap would kill the fallback legs before they start.
    return tryBoth();
  }

  async function playAssistantMessage(text: string, ticket: number = ++speechTicketRef.current, femaleOverride?: boolean) {
    setError('');
    setSpeechReplayText(null);
    if (!appSettings.voiceEnabled) {
      setIsPreparingVoice(false);
      return;
    }
    // Orphaned before it began: an interrupt (or a newer speech) took
    // the ticket while this reply was still streaming/fetching. Speak
    // nothing — the interrupter owns the mic and the span state.
    if (ticket !== speechTicketRef.current) {
      if (continuousIntendedRef.current) pokeLiveListening();
      return;
    }
    // One voice at a time across the app: silence the Quran reader if
    // it is speaking (it does the same to us when it starts).
    stopOtherAudio('chat');
    // The persona captured ONCE for this whole reply: it was spoken TO
    // this persona, so it is spoken BY this persona's voice chain —
    // even if the user switches persona mid-reply. VOICE-OWNER
    // SNAPSHOT (2026-10-25 role-swap fix): a streaming reply passes
    // its send-time owner in (femaleOverride); the old code re-read
    // personaRef here, AFTER streaming finished — so a mid-stream
    // persona switch made the rest of the reply speak in the NEW
    // persona's gender while the eager first chunk already spoke in
    // the old one. Non-streaming callers (confirmations, greetings)
    // are generated in the current persona, so they keep the default.
    const female = femaleOverride ?? personaRef.current === 'uniqa';
    const speechStale = () => ticket !== speechTicketRef.current;
    // FIRST-REPLY HOLD (2026-10-22): if this is the session's first
    // spoken reply and the warm-up probe is still in flight, wait for
    // it to settle before synthesizing anything — its verdicts (server
    // awake, client-leg memo armed) are what make THIS reply land on
    // the selected voice instead of racing cold legs into whichever
    // fallback answers first. The wait is bounded by the chain's own
    // per-leg timeouts, and the eager-prefetch path below re-checks
    // the ticket after it, so an interrupt during the wait still
    // silences this reply completely.
    warmUpVoiceChain();
    if (!sessionVoiceReadyRef.current && voiceWarmupPromiseRef.current) {
      await voiceWarmupPromiseRef.current.catch(() => {});
      if (speechStale()) return;
    }
    // Duplicate suppression lives in the voice engine (only a HEARD
    // text suppresses a repeat — a failed text stays replayable).
    // This entry point records NOTHING as heard before playback:
    // lastSpokenRef is updated only from a heard terminal outcome
    // below, so the message "سنیں" button always works after a failure.
    lastVoiceFailureRef.current = '';
    lastLegFailuresRef.current = { gemini: '', edge: false, browser: false };
    playbackBlockedRef.current = false;
    playbackStartedRef.current = false;
    // Check for eager prefetch BEFORE stopping — don't kill our own eager audio
    // that started playing during streaming (only if it matches this reply).
    const prefetch = ttsPrefetchRef.current;
    ttsPrefetchRef.current = null; // consume once
    // Defense in depth: an eager chunk synthesized for the OTHER
    // persona's gender must never play, even if a ticket is reused.
    const prefetchMatches = !!(prefetch && prefetch.ticket === ticket && prefetch.female === female && text.startsWith(prefetch.text) && prefetch.text.length >= 20);
    const hasEagerAudio = !!(prefetchMatches && prefetch!.eagerPlayed && prefetch!.playPromise);
    if (!hasEagerAudio) {
      stopSpeaking(); // also stops any stale/non-matching eager audio
    }
    // Hands-free mode: pause the mic while the reply plays (no echo).
    pauseContinuousForTts();
    // Open this reply's speech span: from here until
    // resumeContinuousAfterTts, NO path may reopen the live mic — not
    // even in the silent gaps between audio chunks while the remaining
    // chunks are still being synthesized (the on/off cycling fix).
    ttsActiveRef.current = true;
    currentSpeechTextRef.current = text;
    // From this moment, in live mode, the barge-in listener watches for
    // the user starting to speak over the reply (it also (re)starts on
    // the first chunk's onplaying and for the browser-voice path).
    startBargeInListener();
    // Show "preparing" while the audio is fetched; isSpeaking flips on only
    // when playback actually begins (audio.onplaying below).
    if (!hasEagerAudio) {
      setIsPreparingVoice(true);
    }
    // ONE terminal outcome per reply (2026-10-26 voice rebuild):
    // the engine computes spoken / partial / failed / stopped from
    // the WHOLE reply — no restChunks.length gate, no dependence on
    // "something already spoke" to show a failure. A failed or
    // partial reply ALWAYS lands in the readable banner channel
    // (speechNotice) with a Replay offer; setError (tiny X) is
    // never the sole record of a voice failure any more.
    const finish = (outcome: VoiceOutcome) => {
      setIsPreparingVoice(false);
      if (outcome.terminal === 'stopped') {
        // The user (or a newer reply) stopped it. interruptSpeech
        // already set a labelled banner if audio had actually
        // started — never overwrite it with a failure banner, and
        // never offer replay for a deliberate stop.
        setSpeechReplayText(null);
        return;
      }
      if (outcome.terminal === 'duplicate-heard' || outcome.terminal === 'voice-off') {
        ttsActiveRef.current = false;
        resumeContinuousAfterTts();
        return;
      }
      // Only a HEARD reply is recorded — a failed reply stays
      // replayable within (and beyond) the 8s duplicate window.
      if (outcome.heard) {
        lastSpokenRef.current = { text, at: Date.now() };
      }
      if (outcome.terminal === 'spoken') {
        setSpeechReplayText(null);
      } else if (outcome.terminal === 'partial') {
        setSpeechNotice(`⚠️ جواب کا کچھ حصہ آواز میں نہیں سنایا جا سکا — ${outcome.failureReason ? `${outcome.failureReason} ` : ''}باقی حصہ اسکرین پر موجود ہے، اسے پڑھ لیں۔`);
        setSpeechReplayText(text);
      } else if (outcome.terminal === 'failed') {
        setSpeechNotice(`⚠️ یہ جواب آواز میں نہیں سنایا جا سکا — ${outcome.failureReason} باقی حصہ اسکرین پر موجود ہے۔`);
        setSpeechReplayText(text);
      }
      resumeContinuousAfterTts();
    };
    try {
      const outcome = await runVoiceReply(
        {
          text,
          config: { persona: female ? 'uniqa' : 'unique', female },
          prefetch: prefetchMatches && prefetch
            ? {
                text: prefetch.text,
                promise: prefetch.promise,
                eagerPlayed: prefetch.eagerPlayed,
                playPromise: prefetch.playPromise,
              }
            : null,
          lastHeard: lastSpokenRef.current,
          now: Date.now(),
          voiceEnabled: appSettings.voiceEnabled,
        },
        {
          synthesize: (c) => synthesizeWithTimeout(c, 12000, female),
          playAudio: async (a) => (await playAudioChunk(a.audioBase64, a.mimeType, ticket)).heard,
          speakBrowserChunk: async (c) => {
            const heard = await speakChunkWithBrowserVoice(c, female, ticket);
            if (!heard && !speechStale()) lastLegFailuresRef.current.browser = true;
            return heard;
          },
          speakBrowserWhole: async (t) => {
            const whole = await speakBrowserWhole(t, ticket, female);
            if (!whole.heard && whole.reason !== 'stopped' && whole.reason !== 'voice-off') lastLegFailuresRef.current.browser = true;
            return whole.heard;
          },
          isStale: speechStale,
          shouldSkipExtendedRetry: () => replyCircuitRef.current.ticket === speechTicketRef.current && replyCircuitRef.current.geminiDead && Date.now() < replyCircuitRef.current.edgeDeadUntil,
          // RUK-RUK FIX (2026-10-27): same dead-legs verdict, applied
          // per chunk — once this reply has proven Gemini dead AND
          // Edge dead, later chunks must not re-burn 3 chain passes
          // on those legs. The first failed chunk still tries its
          // full chain (that is what proves the legs dead); every
          // chunk after it costs one pass, then moves on — silence
          // between lines, not minutes of it. Live legs are never
          // fail-fasted, and a new ticket resets the circuit.
          failFast: () => replyCircuitRef.current.ticket === speechTicketRef.current && replyCircuitRef.current.geminiDead && Date.now() < replyCircuitRef.current.edgeDeadUntil,
          wasPlaybackBlocked: () => playbackBlockedRef.current,
          failureDetail: () => lastVoiceFailureRef.current,
          legDiagnostic: () => legDiagnosticText(lastLegFailuresRef.current),
          onChunkWaiting: () => setSpeechNotice('⏳ جواب کا ایک حصہ آواز میں دوبارہ بنایا جا رہا ہے — تھوڑا انتظار کریں، جواب بیچ میں نہیں رکے گا۔'),
          onChunkWaitingEnd: () => setSpeechNotice(''),
        },
      );
      finish(outcome);
      return;
    } catch {
      // The engine never rejects by design; if a dependency throws
      // anyway, fall back to the awaited whole browser voice once,
      // then to the same single terminal failure banner — never to
      // a fire-and-forget call and never to silence.
      setIsPreparingVoice(false);
      if (speechStale()) return;
      const whole = await speakBrowserWhole(text, ticket, female).catch(() => ({ heard: false, reason: 'browser-failed' }));
      if (speechStale()) return;
      if (whole.heard) {
        finish({ terminal: 'spoken', heard: true, dropped: 0, totalChunks: 0, failureReason: '' });
      } else {
        if (whole.reason !== 'stopped' && whole.reason !== 'voice-off') lastLegFailuresRef.current.browser = true;
        const diag = legDiagnosticText(lastLegFailuresRef.current);
        finish({ terminal: 'failed', heard: false, dropped: 0, totalChunks: 0, failureReason: diag || failureReasonText(lastVoiceFailureRef.current) });
      }
    }
  }


  // ------------------------------------------------------------------
  // Live mic (hands-free conversation): one tap turns it on, the user
  // speaks, the reply auto-speaks while the mic is closed (no echo), then
  // the mic reopens for the next turn; one more tap turns it off.
  // Two engines by screen size (see isMobileTurnMode): phones run
  // turn-based single-shot sessions because Android Chrome's
  // continuous=true flickers on/off by itself; laptops keep the original
  // continuous + silence-timer flow that already works there.
  // ------------------------------------------------------------------
  const busyRef = useRef(false);
  useEffect(() => {
    busyRef.current = chatMutation.isPending;
  }, [chatMutation.isPending]);

  // Keep the always-current send/command refs fresh for recognition
  // callbacks (see the ref declarations at the top of the component).
  useEffect(() => {
    sendMessageRef.current = sendMessage;
    voiceCommandRef.current = handleVoiceWebsiteCommand;
    interruptSpeechRef.current = interruptSpeech;
  });

  // Audio focus: when the Quran reader starts speaking it silences the
  // chat voice through this registration (and playAssistantMessage does
  // the same to it) — the two voices can never overlap again.
  useEffect(() => registerAudioStop('chat', () => interruptSpeechRef.current()), []);

  function clearSilenceTimer() {
    if (silenceTimerRef.current !== null) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }

  function clearLiveReopenTimer() {
    if (liveReopenTimerRef.current !== null) {
      window.clearTimeout(liveReopenTimerRef.current);
      liveReopenTimerRef.current = null;
    }
  }

  // Single owner of every live-mic reopen: arming a reopen replaces any
  // pending one, and the eventual start re-checks every guard at fire
  // time (intended, not speaking, no turn in flight, TTS span closed) —
  // so duplicated or stale schedules can never produce a start/stop
  // flicker, and the mic can only ever reopen ONCE per quiet moment.
  function scheduleLiveMicReopen(delayMs: number) {
    clearLiveReopenTimer();
    liveReopenTimerRef.current = window.setTimeout(() => {
      liveReopenTimerRef.current = null;
      if (continuousIntendedRef.current) startContinuousListening();
    }, delayMs);
  }

  // Image attach for vision: read as base64 data URL. Shared by the
  // file picker and by PASTE (screenshots are usually pasted, not
  // picked — his main use is showing the AI a screenshot of another
  // app and asking how it works).
  function acceptMediaFile(file: File) {
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (!isImage && !isVideo) {
      setError('صرف تصویر یا ویڈیو والی فائل بھیجیں۔');
      return;
    }
    const maxSize = isVideo ? 20 * 1024 * 1024 : 4 * 1024 * 1024;
    if (file.size > maxSize) {
      setError(isVideo ? 'ویڈیو 20MB سے چھوٹی ہونی چاہیے۔' : 'تصویر 4MB سے چھوٹی ہونی چاہیے۔');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setAttachedImage(dataUrl);
      setError('');
    };
    reader.onerror = () => setError('فائل پڑھنے میں مسئلہ ہوا۔');
    reader.readAsDataURL(file);
  }

  function handleImagePick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    acceptMediaFile(file);
  }

  // Paste a screenshot/image straight into the composer (Ctrl+V or
  // long-press paste): the clipboard file goes through the very same
  // validation + vision path as a picked file. Plain-text pastes are
  // untouched (no file on the clipboard → the default paste proceeds).
  function handleComposerPaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = event.clipboardData?.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) return;
    event.preventDefault();
    acceptMediaFile(file);
  }

  // Live mic has two engines, chosen by screen size:
  // - Phone (<=640px): TURN-BASED single-shot sessions (below) — Android
  //   Chrome's continuous mode flickers on/off by itself, so phones get
  //   the stable one-utterance-per-turn flow.
  // - Laptop/desktop: the ORIGINAL continuous flow with the 2s silence
  //   timer (scheduleSilenceSend) — untouched, exactly as it was, because
  //   it already works well there (user instruction 2026-10-20: do not
  //   change anything on the laptop side).
  function isMobileTurnMode() {
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches;
  }

  // DESKTOP path (original): accumulate finals, send after ~2s of silence.
  function scheduleSilenceSend() {
    clearSilenceTimer();
    silenceTimerRef.current = window.setTimeout(() => {
      silenceTimerRef.current = null;
      const text = continuousTextRef.current.trim();
      continuousTextRef.current = '';
      if (!text || !continuousIntendedRef.current || busyRef.current) return;
      // Pause listening while we send + get the reply, to avoid self-trigger.
      pauseContinuousForTts();
      const handledAsWebsiteCommand = handleVoiceWebsiteCommand(text);
      if (!handledAsWebsiteCommand) void sendMessage(text, true);
      // Note: sendMessage -> playAssistantMessage will resume listening
      // via resumeContinuousAfterTts() when the reply finishes speaking.
      // If the send fails, resume here so we don't go silent.
      window.setTimeout(() => {
        if (continuousIntendedRef.current && !isSpeakingRef.current && !busyRef.current) {
          startContinuousListening();
        }
      }, 4000);
    }, 2000);
  }

  // PHONE path: one full turn of the live-mic conversation — the user
  // finished speaking, so send the transcript NOW and let the reply play.
  // Listening resumes when the reply finishes (resumeContinuousAfterTts /
  // recovery effect).
  //
  // ROOT-CAUSE FIX (2026-10-21): the old phone handler dispatched a turn on
  // the FIRST final result of a session. Android Chrome's engine, however,
  // delivers a single spoken sentence as SEVERAL final results (often one
  // per phrase, across several auto-ended sessions), so the user's speech
  // was committed as tiny fragment messages ("اے یونیک", "ہے یونیک", …) and
  // re-sent cumulatively. Now finals only ACCUMULATE (continuousTextRef);
  // schedulePhoneTurnSend merges everything and dispatches exactly once
  // after ~1.4s without a new fragment — a real end-of-utterance signal.
  function clearPhoneTurnTimer() {
    if (phoneTurnTimerRef.current !== null) {
      window.clearTimeout(phoneTurnTimerRef.current);
      phoneTurnTimerRef.current = null;
    }
  }

  function schedulePhoneTurnSend() {
    clearPhoneTurnTimer();
    phoneTurnTimerRef.current = window.setTimeout(() => {
      phoneTurnTimerRef.current = null;
      // The app got busy/speaking in the meantime (e.g. a typed send) —
      // wait for the next quiet moment instead of dropping the speech.
      if (busyRef.current || isSpeakingRef.current || isPreparingVoiceRef.current) {
        schedulePhoneTurnSend();
        return;
      }
      const text = continuousTextRef.current.trim();
      continuousTextRef.current = '';
      if (!text) return;
      dispatchContinuousTurn(text);
    }, 1400);
  }

  function dispatchContinuousTurn(text: string) {
    const clean = text.trim();
    if (!clean || !continuousIntendedRef.current) return;
    // One turn at a time: a late fragment from a dying session must never
    // stack a second send on top of the turn already being answered.
    if (turnInFlightRef.current) return;
    turnInFlightRef.current = true;
    clearPhoneTurnTimer();
    clearLiveReopenTimer();
    // Pause listening while we send + get the reply, to avoid self-trigger.
    pauseContinuousForTts();
    const handledAsWebsiteCommand = voiceCommandRef.current
      ? voiceCommandRef.current(clean)
      : handleVoiceWebsiteCommand(clean);
    if (!handledAsWebsiteCommand) {
      void (sendMessageRef.current ? sendMessageRef.current(clean, true) : sendMessage(clean, true));
    }
    // If nothing ends up speaking (voice off / error), the recovery effect
    // below restarts listening once the app is idle again.
  }

  const isSpeakingRef = useRef(false);
  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  useEffect(() => {
    isPreparingVoiceRef.current = isPreparingVoice;
  }, [isPreparingVoice]);

  // Live-mic recovery (PHONE turn-based path only — the desktop path keeps
  // its original resume logic): whenever a turn fully settles (reply sent
  // AND spoken, or nothing spoke at all — voice off / error / website
  // command), release the turn lock and reopen the mic for the next turn.
  const busyState = chatMutation.isPending;
  useEffect(() => {
    if (!isMobileTurnMode()) return;
    if (!continuousIntendedRef.current) return;
    if (busyState || isSpeaking || isPreparingVoice) return;
    if (turnInFlightRef.current) {
      turnInFlightRef.current = false;
    }
    // Route the reopen through the single scheduler with a settle delay
    // instead of starting immediately: this effect re-fires on EVERY
    // speaking/preparing flicker (each audio chunk ending flips
    // isSpeaking false while the next chunk is still being synthesized),
    // and an immediate start here reopened the mic in those gaps,
    // mid-reply. The scheduler dedupes repeat fires into one pending
    // reopen, and startContinuousListening re-checks ttsActiveRef at
    // fire time, so the mic stays shut until the reply is truly over.
    if (!continuousRecognitionRef.current) scheduleLiveMicReopen(600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busyState, isSpeaking, isPreparingVoice]);

  // Shared by the normal live session AND an adopted barge-in session:
  // accumulate one recognition event's results into the turn buffer and
  // arm the platform's send scheduler. Behavior is exactly the original
  // onresult body of startContinuousListening (moved, not changed).
  function accumulateLiveResult(
    event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> },
    mobileTurn: boolean,
    markFinal: () => void,
  ) {
    if (!mobileTurn) {
      // DESKTOP (original flow): accumulate final text, send on silence.
      let gotSpeech = false;
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (!result) continue;
        gotSpeech = true;
        if (result.isFinal) {
          continuousTextRef.current += `${result[0]?.transcript ?? ''} `;
        }
      }
      if (gotSpeech) {
        setVoiceStatus('سن رہا ہوں…');
        scheduleSilenceSend();
      }
      return;
    }
    // PHONE (turn-based, fixed 2026-10-21): a final result is only a
    // FRAGMENT of the turn — Android splits one sentence into several
    // finals. Accumulate from resultIndex (never re-read old results)
    // and let the debounce in schedulePhoneTurnSend decide when the
    // utterance is really over. Nothing is sent from here.
    let gotFinal = false;
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      if (result?.isFinal) {
        continuousTextRef.current += `${result[0]?.transcript ?? ''} `;
        gotFinal = true;
      }
    }
    if (gotFinal) {
      markFinal();
      phoneEmptyEndsRef.current = 0;
      setVoiceStatus('سن رہا ہوں…');
      schedulePhoneTurnSend();
    }
  }

  // Shared session-end handling (the original onend body of
  // startContinuousListening, moved verbatim): clear identity, then —
  // when the app is idle and live mode still intends to listen — reopen
  // the mic through the single scheduler with the phone flap backoff.
  function finishLiveSession(recognition: BrowserSpeechRecognition, mobileTurn: boolean, sessionGotFinal: boolean) {
    if (continuousRecognitionRef.current === recognition) {
      continuousRecognitionRef.current = null;
    }
    // Desktop clears its silence timer here (original). The PHONE turn
    // timer must survive session ends — fragments of one utterance
    // arrive across several sessions, and clearing it on the first
    // session end is exactly what used to split them apart.
    if (!mobileTurn) clearSilenceTimer();
    // Session ended with nothing sent (silence): keep waiting for the
    // user to speak, as long as live mic is on and no turn is in flight.
    // (turnInFlight only ever becomes true on the phone path; on the
    // desktop path this is the original auto-restart, just quicker.)
    if (
      continuousIntendedRef.current &&
      !turnInFlightRef.current &&
      !isSpeakingRef.current &&
      !isPreparingVoiceRef.current &&
      !busyRef.current
    ) {
      // PHONE: when this session's speech is already waiting to be
      // sent (turn timer armed / fragments accumulated), do NOT
      // reopen here at all — the dispatch → reply → resume chain
      // owns the next opening. The old restart (400ms) always beat
      // the send timer (1400ms), so the mic blinked open and shut
      // around every single turn and could catch the reply's start.
      if (mobileTurn && (phoneTurnTimerRef.current !== null || continuousTextRef.current.trim())) {
        return;
      }
      // PHONE flap guard (revised 2026-10-24): two different empty ends
      // need two different restarts, and the old code treated them as
      // one — after a few quiet ends the backoff reached 3s, so the
      // mic sat dead for seconds at a time while live mode was on:
      // the user's «kabhi on, kabhi off, khud hi» on his phone.
      //   • INSTANT end (session died < 1.5s after starting, nothing
      //     heard): the platform is refusing to listen — restarting
      //     at once loops forever, so back off (up to 3s).
      //   • NATURAL end (session lived a while, then Android closed
      //     the idle session as it does every few seconds): reopen
      //     at once (400ms) — a growing gap here is only dead air in
      //     which his words are missed. Real speech resets the count.
      // Desktop keeps its original 400ms restart, untouched.
      let restartDelay = 400;
      if (mobileTurn) {
        if (!sessionGotFinal && !continuousTextRef.current.trim()) {
          const lifetimeMs = Date.now() - (listenStartedAtRef.current || 0);
          if (lifetimeMs < 1500) {
            phoneEmptyEndsRef.current += 1;
            restartDelay = Math.min(400 + phoneEmptyEndsRef.current * 800, 3000);
          } else {
            phoneEmptyEndsRef.current = 0;
            restartDelay = 400;
          }
        }
      }
      scheduleLiveMicReopen(restartDelay);
    }
  }

  // ------------------------------------------------------------------
  // BARGE-IN (2026-10-22; ECHO-HARDENED 2026-10-24; DESKTOP BAR RAISED 2026-10-26): while a reply speaks
  // in live mode, a separate listen-only recognition watches for the
  // user starting to talk. The detection bar is deliberately
  // conservative — tuned to NEVER kill a reply over a stray word or
  // the AI's own echo:
  //   • speech must be SUSTAINED (>= 800ms of arriving results), and
  //   • at least 5 words, of which at least 3 do NOT appear in the
  //     reply being spoken and >= 50% are novel (echo of the AI's own
  //     voice through the speakers transcribes the reply's own words —
  //     novelty is what separates the user from the echo).
  //   • there is NO instant-kill fast path for a final result any
  //     more: on his phone (2026-10-24 device test) the old fast path
  //     (one >= 4-word >= 50%-novel FINAL, no sustain) fired on the
  //     first misrecognized echo fragment — the reply died after its
  //     first line while the rest was never heard. A single final can
  //     still SEED a candidate; only sustained genuinely-new speech
  //     confirms. Real speak-over still works: ~1s of new words.
  // A candidate decays if results stop arriving for > 1200ms, so stray
  // fragments never accumulate into a false trigger. On confirmation
  // the SAME recognition is adopted as the live session (mode flips to
  // 'capture') and everything already heard is seeded into the turn —
  // nothing the user said is lost, and the turn dispatches exactly once
  // through the normal machinery. If the platform refuses to listen
  // during playback (errors / instant end loops), the listener gives up
  // for the span and tap-to-interrupt remains as the guarantee.
  // ------------------------------------------------------------------
  const BARGE_MIN_SUSTAIN_MS = 800;
  const BARGE_MIN_WORDS = 5;
  const BARGE_MIN_NOVEL_WORDS = 3;
  const BARGE_NOVEL_RATIO = 0.5;
  const BARGE_GAP_RESET_MS = 1200;
  const BARGE_MAX_RESTARTS = 12;
  const BARGE_MAX_EMPTY_ENDS = 4;

  // STOP-PHRASE FAST PATH (2026-10-22, his on-device report): the
  // conservative bar above can NEVER fire for his natural stop command
  // — «رک جاؤ» is only two words and he means it the instant he says
  // it. So before those gates, the freshest heard text is checked for a
  // stop command: when the utterance CONSISTS OF (or is dominated by) a
  // stop phrase, interruptSpeech() fires immediately — no sustain, no
  // word count, no novelty requirement. The single exception is echo:
  // if that very phrase is literally part of the text currently being
  // spoken, the "user" we heard is the AI's own voice coming back
  // through the speakers (a story saying «رکو»), and the fast path
  // stays silent — the novelty-gated detector above still guards it.
  const STOP_PHRASES: string[][] = [
    ['خاموش', 'ہو', 'جاؤ'],
    ['رک', 'جاؤ'], ['بس', 'کرو'], ['چپ', 'کرو'],
    ['ruk', 'jao'], ['bas', 'karo'], ['stop', 'it'],
    ['رکو'], ['رک'], ['بس'],
    ['ruko'], ['ruk'], ['bas'], ['stop'],
  ];

  // The matched stop phrase when `words` is a stop command: the whole
  // utterance is the phrase, or the phrase is its tail with at most one
  // leading word before it («ارے رک جاؤ») and covers at least half of
  // the utterance. Anything longer is a sentence, not a command.
  function matchStopPhrase(words: string[]): string[] | null {
    if (!words.length || words.length > 4) return null;
    for (const phrase of STOP_PHRASES) {
      if (phrase.length > words.length) continue;
      const start = words.length - phrase.length;
      if (start > 1) continue;
      if (phrase.length * 2 < words.length) continue; // not dominant
      let ok = true;
      for (let i = 0; i < phrase.length; i += 1) {
        if (words[start + i] !== phrase[i]) { ok = false; break; }
      }
      if (ok) return phrase;
    }
    return null;
  }

  // True when `phrase` appears as a contiguous word sequence in `words`
  // — the echo guard: the stop phrase we "heard" is part of the reply
  // text itself, so it came from the speakers, not from the user.
  function wordsContainPhrase(words: string[], phrase: string[]): boolean {
    outer: for (let s = 0; s + phrase.length <= words.length; s += 1) {
      for (let i = 0; i < phrase.length; i += 1) {
        if (words[s + i] !== phrase[i]) continue outer;
      }
      return true;
    }
    return false;
  }

  // Script-variant folding (2026-10-26): the recognizer and the
  // reply text can spell the same Urdu word with Arabic Yeh/Kaf
  // (ي/ك) vs Urdu Yeh/Kaf (ی/ک), or with diacritics/tatweel — without
  // folding, echo of the reply looked "novel" and could stop it.
  // Both sides (heard text AND spoken text) go through this same
  // function, so folding can only reduce false novelty, never hide
  // genuinely new user words (they still differ as whole words).
  function normalizeSpeechWords(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[يى]/g, 'ی')
      .replace(/ك/g, 'ک')
      .replace(/ة/g, 'ہ')
      .replace(/[\u0640\u064B-\u0652]/g, '')
      .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
      .split(/\s+/)
      .filter(Boolean);
  }

  function clearBargeInRestartTimer() {
    if (bargeInRestartTimerRef.current !== null) {
      window.clearTimeout(bargeInRestartTimerRef.current);
      bargeInRestartTimerRef.current = null;
    }
  }

  function stopBargeInListener() {
    clearBargeInRestartTimer();
    // Only a DETECTING listener is torn down here: after adoption the
    // recognition lives in continuousRecognitionRef as the live session
    // and is owned by the normal machinery — never stop it from here.
    if (bargeInModeRef.current === 'detect') bargeInModeRef.current = 'off';
    const rec = bargeInRecognitionRef.current;
    bargeInRecognitionRef.current = null;
    if (rec) {
      try { rec.stop(); } catch { /* already stopped */ }
    }
    bargeInCandidateRef.current = { firstAt: 0, lastAt: 0, text: '', finals: '' };
  }

  function startBargeInListener() {
    // Live mode only: outside it, tap-to-interrupt is the mechanism.
    if (!continuousIntendedRef.current) return;
    // Only while a reply's span is open (playing or being prepared).
    if (!ttsActiveRef.current && !isPreparingVoiceRef.current && !isSpeakingRef.current) return;
    // Never run two recognitions at once: the normal live session or
    // the one-shot recorder owns the mic right now.
    if (bargeInRecognitionRef.current || continuousRecognitionRef.current || recognitionRef.current) return;
    if (bargeInModeRef.current !== 'off') return;
    const browserWindow = window as SpeechRecognitionWindow;
    const Recognition = browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;
    if (!Recognition) {
      bargeInUnavailableRef.current = true; // tap-to-interrupt only
      return;
    }
    // A new speech span resets the per-span verdicts.
    if (bargeInSpanTicketRef.current !== speechTicketRef.current) {
      bargeInSpanTicketRef.current = speechTicketRef.current;
      bargeInRestartsRef.current = 0;
      bargeInEmptyEndsRef.current = 0;
      bargeInUnavailableRef.current = false;
    }
    if (bargeInUnavailableRef.current) return;

    const mobileTurn = isMobileTurnMode();
    const epoch = listenEpochRef.current;
    bargeInEpochRef.current = epoch;
    let captureGotFinal = false;
    try {
      const recognition = new Recognition();
      recognition.lang = 'ur-PK';
      // Continuous + interims on BOTH platforms while detecting: the
      // detector needs the interim stream for its 450ms sustain window.
      // (The capture phase only consumes finals, exactly like the
      // normal sessions, whatever this session's interim setting is.)
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = (event) => {
        if (!continuousIntendedRef.current) return;
        if (bargeInModeRef.current === 'capture') {
          // Adopted: this IS the live session now — feed the normal
          // machinery. The epoch guard mirrors the normal sessions:
          // pauseContinuousForTts (on dispatch) retires these callbacks.
          if (epoch !== listenEpochRef.current) return;
          accumulateLiveResult(event, mobileTurn, () => { captureGotFinal = true; });
          return;
        }
        if (bargeInModeRef.current !== 'detect') return;
        if (bargeInRecognitionRef.current !== recognition) return; // stale instance
        bargeInGotResultRef.current = true;
        bargeInEmptyEndsRef.current = 0;
        const now = Date.now();
        const candidate = bargeInCandidateRef.current;
        if (candidate.lastAt && now - candidate.lastAt > BARGE_GAP_RESET_MS) {
          // A long silence since the last fragment: whatever came
          // before was a stray blip, not sustained speech — start over.
          candidate.firstAt = 0;
          candidate.text = '';
          candidate.finals = '';
        }
        // Rebuild the candidate from the session's cumulative results:
        // the freshest hypothesis of everything heard in this window.
        let heard = '';
        let heardFinals = '';
        for (let i = 0; i < event.results.length; i += 1) {
          const result = event.results[i];
          if (!result) continue;
          const transcript = result[0]?.transcript ?? '';
          heard += `${transcript} `;
          if (result.isFinal) {
            heardFinals += `${transcript} `;
          }
        }
        candidate.text = heard;
        candidate.finals = heardFinals;
        if (!candidate.firstAt) candidate.firstAt = now;
        candidate.lastAt = now;

        // STOP-PHRASE FAST PATH — checked on EVERY result (interim or
        // final), before the conservative gates below: a stop command
        // interrupts at once, unless the phrase is literally part of
        // the text being spoken right now (speaker echo of the reply
        // itself — e.g. a story that says «رکو»). interruptSpeech
        // stops this listener and reopens the live mic, so the user
        // can speak his next turn immediately.
        const stopPhrase = matchStopPhrase(normalizeSpeechWords(candidate.text));
        if (stopPhrase
          && !wordsContainPhrase(normalizeSpeechWords(currentSpeechTextRef.current), stopPhrase)) {
          interruptSpeech('stop-phrase');
          return;
        }

        const words = normalizeSpeechWords(candidate.text);
        // DESKTOP (laptop speakers, 2026-10-26): echo risk is highest
        // here, so the bar is higher than on phones — longer sustain,
        // more words, more novel words, and at least one FINAL result
        // (interim-only fragments never confirm). Phones keep the
        // 2026-10-24 bar unchanged.
        const desktopBar = !mobileTurn;
        const minSustain = desktopBar ? 1200 : BARGE_MIN_SUSTAIN_MS;
        const minWords = desktopBar ? 6 : BARGE_MIN_WORDS;
        const minNovelWords = desktopBar ? 4 : BARGE_MIN_NOVEL_WORDS;
        if (words.length < minWords) return;
        const spokenWords = new Set(normalizeSpeechWords(currentSpeechTextRef.current));
        const novelWords = words.filter((w) => !spokenWords.has(w)).length;
        const novelRatio = novelWords / words.length;
        const sustained = now - candidate.firstAt >= minSustain;
        const genuineSpeech = novelWords >= minNovelWords && novelRatio >= BARGE_NOVEL_RATIO
          && (!desktopBar || candidate.finals.trim().length > 0);
        // ECHO-HARDENED 2026-10-24: NO fast-final instant kill — a single
        // final result, however novel it looks, never confirms on its
        // own. Phone echo arrives as short misrecognized finals; only
        // sustained genuinely-new speech (see the bar above) may stop
        // a reply. The stop-phrase fast path above is untouched.
        if (sustained && genuineSpeech) {
          confirmBargeIn(recognition, mobileTurn, () => { captureGotFinal = true; });
        }
      };

      recognition.onerror = (event) => {
        if (bargeInModeRef.current === 'capture') {
          // Adopted session: mirror the normal live session's verdicts.
          if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            continuousIntendedRef.current = false;
            setContinuousVoice(false);
            setVoiceStatus('');
            setError('مائیکروفون کی اجازت دیں، پھر مسلسل آواز دوبارہ چالو کریں۔');
          }
          return;
        }
        if (bargeInRecognitionRef.current !== recognition) return;
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          // The platform will not listen while audio plays (or the mic
          // permission is gone): give up for this span — quietly. The
          // tap-to-interrupt fallback still guarantees an exit.
          bargeInUnavailableRef.current = true;
          stopBargeInListener();
        }
        // 'no-speech' / 'aborted' / 'network': onend applies the
        // bounded-restart policy below.
      };

      recognition.onend = () => {
        if (bargeInModeRef.current === 'capture' && continuousRecognitionRef.current === recognition) {
          // The adopted session has ended while still the live session:
          // hand its ending to the shared session-end machinery and
          // release the barge-in mode so the NEXT reply can be watched.
          bargeInModeRef.current = 'off';
          if (epoch !== listenEpochRef.current) return; // retired by a pause, like normal sessions
          finishLiveSession(recognition, mobileTurn, captureGotFinal);
          return;
        }
        if (bargeInRecognitionRef.current === recognition) {
          bargeInRecognitionRef.current = null;
        }
        if (bargeInModeRef.current !== 'detect') return;
        // The span closed (or live mode ended) while we listened: done.
        if (!continuousIntendedRef.current) return;
        if (!ttsActiveRef.current && !isPreparingVoiceRef.current && !isSpeakingRef.current) return;
        if (bargeInUnavailableRef.current) return;
        // Android ends recognition sessions on its own schedule — while
        // the reply still speaks, reopen the watch, but BOUNDED: a
        // platform that kills sessions instantly (empty ends, no error)
        // must degrade to tap-to-interrupt, never spin in a loop.
        if (!bargeInGotResultRef.current) {
          bargeInEmptyEndsRef.current += 1;
          if (bargeInEmptyEndsRef.current >= BARGE_MAX_EMPTY_ENDS) {
            bargeInUnavailableRef.current = true;
            return;
          }
        }
        bargeInGotResultRef.current = false;
        bargeInRestartsRef.current += 1;
        if (bargeInRestartsRef.current > BARGE_MAX_RESTARTS) {
          bargeInUnavailableRef.current = true;
          return;
        }
        clearBargeInRestartTimer();
        bargeInRestartTimerRef.current = window.setTimeout(() => {
          bargeInRestartTimerRef.current = null;
          if (bargeInModeRef.current === 'detect' && !bargeInRecognitionRef.current) {
            startBargeInListener();
          }
        }, 250);
      };

      bargeInRecognitionRef.current = recognition;
      bargeInModeRef.current = 'detect';
      bargeInGotResultRef.current = false;
      bargeInCandidateRef.current = { firstAt: 0, lastAt: 0, text: '', finals: '' };
      recognition.start();
    } catch {
      bargeInRecognitionRef.current = null;
      if (bargeInModeRef.current === 'detect') bargeInModeRef.current = 'off';
      bargeInUnavailableRef.current = true; // construction refused — tap only
    }
  }

  // Detection confirmed: the user is speaking over the reply. Adopt the
  // running recognition as the live session (he is mid-sentence — a
  // restart would eat his words), seed the turn with the finals already
  // heard, then silence the reply for good. The adopted session's later
  // results flow through accumulateLiveResult, so the turn dispatches
  // exactly once via dispatchContinuousTurn / scheduleSilenceSend.
  function confirmBargeIn(
    recognition: BrowserSpeechRecognition,
    mobileTurn: boolean,
    markCaptureFinal: () => void,
  ) {
    const candidate = bargeInCandidateRef.current;
    bargeInModeRef.current = 'capture';
    clearBargeInRestartTimer();
    if (bargeInRecognitionRef.current === recognition) {
      bargeInRecognitionRef.current = null;
    }
    continuousRecognitionRef.current = recognition;
    // Finals heard during detection are the head of this turn.
    const finals = candidate.finals.trim();
    if (finals) {
      continuousTextRef.current += `${finals} `;
      markCaptureFinal();
      phoneEmptyEndsRef.current = 0;
      // Arm the send scheduler NOW: even if this session ends before
      // another final lands, the utterance still dispatches once.
      if (mobileTurn) schedulePhoneTurnSend();
      else scheduleSilenceSend();
    }
    bargeInCandidateRef.current = { firstAt: 0, lastAt: 0, text: '', finals: '' };
    setVoiceStatus('سن رہا ہوں…');
    // Silence the reply and kill its queue. interruptSpeech never stops
    // continuousRecognitionRef, so the adopted session survives; its
    // scheduled reopen also no-ops while this session exists.
    interruptSpeech('barge-in');
  }

  // Nudge the live mic open, retrying briefly: right after an interrupt
  // the app can still be busy (the old reply's fetch finishing), and
  // startContinuousListening rightly refuses then — a bounded retry
  // carries the opening across that window instead of losing it.
  function pokeLiveListening(attemptsLeft = 4) {
    if (!continuousIntendedRef.current) return;
    if (continuousRecognitionRef.current || bargeInRecognitionRef.current) return;
    startContinuousListening();
    if (!continuousRecognitionRef.current && attemptsLeft > 0) {
      window.setTimeout(() => pokeLiveListening(attemptsLeft - 1), 700);
    }
  }

  // TAP-TO-INTERRUPT (the guaranteed fallback, every voice mode): the
  // user tapped the mic or the orb while the AI was speaking — silence
  // everything at once and open the mic for his new turn.
  function interruptSpeechAndListen() {
    const wasLive = continuousIntendedRef.current;
    interruptSpeech('tap');
    if (wasLive) {
      turnInFlightRef.current = false;
      pokeLiveListening();
    } else if (!recording) {
      void toggleRecording();
    }
  }

  function startContinuousListening() {
    if (!continuousIntendedRef.current) return;
    // Don't listen while a reply is playing or a turn is being answered —
    // and not while the reply's voice is still being prepared either: the
    // mic reopening in that gap hears the speaker and talks to itself
    // (the on/off loop the user reported on phones). ttsActiveRef covers
    // the WHOLE reply span: between chunks the instantaneous flags all
    // read false while more audio is still coming, and the mic must
    // stay shut for exactly those gaps too.
    if (isSpeakingRef.current || busyRef.current || turnInFlightRef.current || isPreparingVoiceRef.current || ttsActiveRef.current) return;
    if (continuousRecognitionRef.current) return; // already running
    // Never run beside the barge-in watch: it owns the mic for the
    // reply's span, and the normal session may only start once the span
    // has ended — resumeContinuousAfterTts stops the watch first.
    if (bargeInRecognitionRef.current) return;

    const browserWindow = window as SpeechRecognitionWindow;
    const Recognition = browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setError('اس براؤزر میں مفت آواز پہچاننے کی سہولت دستیاب نہیں۔ براہِ کرم Chrome استعمال کریں۔');
      setContinuousVoice(false);
      continuousIntendedRef.current = false;
      return;
    }

    try {
      const recognition = new Recognition();
      recognition.lang = 'ur-PK';
      const mobileTurn = isMobileTurnMode();
      // Session epoch: callbacks from any older session (stop() is async on
      // Android — queued results/ends can still fire) are ignored, so one
      // utterance can never be dispatched twice.
      const epoch = ++listenEpochRef.current;
      let sessionGotFinal = false;
      // Phone: TURN-BASED — one utterance per session. Android Chrome
      // handles single-shot recognition reliably, while continuous=true
      // starts/stops by itself on phones (the mic flickering the user
      // reported). Laptop: original continuous + interim results, as was.
      recognition.continuous = !mobileTurn;
      recognition.interimResults = mobileTurn ? false : true;

      recognition.onresult = (event) => {
        if (epoch !== listenEpochRef.current) return; // dead session
        if (!continuousIntendedRef.current) return;
        accumulateLiveResult(event, mobileTurn, () => { sessionGotFinal = true; });
      };

      recognition.onerror = (event) => {
        if (epoch !== listenEpochRef.current) return; // dead session
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          continuousIntendedRef.current = false;
          setContinuousVoice(false);
          setVoiceStatus('');
          setError('مائیکروفون کی اجازت دیں، پھر مسلسل آواز دوبارہ چالو کریں۔');
        }
        // 'no-speech' / 'aborted': onend quietly reopens the mic — the user
        // simply has not spoken yet, so we keep waiting for his turn.
      };

      recognition.onend = () => {
        if (epoch !== listenEpochRef.current) return; // dead session
        finishLiveSession(recognition, mobileTurn, sessionGotFinal);
      };

      continuousRecognitionRef.current = recognition;
      clearLiveReopenTimer(); // this start consumes any pending reopen
      listenStartedAtRef.current = Date.now();
      recognition.start();
      setVoiceStatus('سن رہا ہوں…');
    } catch {
      continuousRecognitionRef.current = null;
      setError('مائیکروفون شروع نہیں ہو سکا۔ Chrome کی اجازت چیک کریں۔');
    }
  }

  function pauseContinuousForTts() {
    // Stop the mic while the assistant speaks (avoid echo), but keep the
    // *intention* so it resumes afterwards.
    clearSilenceTimer();
    clearLiveReopenTimer(); // no pending reopen may fire into the pause
    // If the session being retired here is an ADOPTED barge-in capture,
    // its watch is over — release the mode (its onend arrives retired
    // and must not be the only place that could free it).
    if (bargeInModeRef.current === 'capture') bargeInModeRef.current = 'off';
    // Invalidate the current session's late callbacks (stop() is async —
    // its queued results must not dispatch a duplicate turn). The phone
    // turn timer is deliberately NOT cleared here: dispatch consumes the
    // accumulated text before pausing, so the buffer is already empty.
    listenEpochRef.current += 1;
    const rec = continuousRecognitionRef.current;
    continuousRecognitionRef.current = null;
    if (rec) {
      try { rec.stop(); } catch { /* already stopped */ }
    }
    if (continuousIntendedRef.current) setVoiceStatus('جواب سن رہے ہیں… بولیں گے تو رک جاؤں گا');
  }

  function resumeContinuousAfterTts() {
    // The reply's speech span is over: the barge-in watch ends with it
    // (if it had confirmed, the session was adopted and this is a no-op
    // for it — stopBargeInListener never touches an adopted session).
    stopBargeInListener();
    // Close the span FIRST so the reopen below (and any recovery-effect
    // reopen) is allowed through.
    ttsActiveRef.current = false;
    currentSpeechTextRef.current = '';
    if (!continuousIntendedRef.current) return;
    setVoiceStatus('سن رہا ہوں…');
    // Small delay so the mic doesn't catch the tail of the TTS audio —
    // via the single scheduler, so this stays the one pending reopen.
    scheduleLiveMicReopen(600);
  }

  function stopContinuousListening() {
    continuousIntendedRef.current = false;
    // Turning live mode OFF must also silence a reply in flight — before
    // this, the reply kept talking to the end over a mode the user had
    // just switched off. (interruptSpeech's reopen checks the intended
    // flag, already false here, so nothing reopens.)
    interruptSpeech();
    turnInFlightRef.current = false;
    ttsActiveRef.current = false;
    phoneEmptyEndsRef.current = 0;
    clearSilenceTimer();
    clearPhoneTurnTimer();
    clearLiveReopenTimer();
    listenEpochRef.current += 1;
    continuousTextRef.current = '';
    const rec = continuousRecognitionRef.current;
    continuousRecognitionRef.current = null;
    if (rec) {
      try { rec.stop(); } catch { /* already stopped */ }
    }
    // Live mode is fully torn down: no barge-in state may survive it
    // (an adopted capture session was stopped just above).
    bargeInModeRef.current = 'off';
    setVoiceStatus('');
  }

  function toggleContinuousVoice() {
    if (continuousVoice) {
      stopContinuousListening();
      setContinuousVoice(false);
      // Keep Settings in sync — one source of truth (see the settings effect).
      setAppSettings((s: any) => (s.continuousVoice ? { ...s, continuousVoice: false } : s));
      return;
    }
    setError('');
    // The one-shot mic and continuous mode must not run together.
    if (recording) toggleRecording();
    interruptSpeech();
    continuousIntendedRef.current = true;
    setContinuousVoice(true);
    setAppSettings((s: any) => (s.continuousVoice ? s : { ...s, continuousVoice: true }));
    startContinuousListening();
  }

  // ------------------------------------------------------------------
  // One-shot mic — PHONE sessions (mobile only, fixed 2026-10-21).
  // Android Chrome ends a single-shot session at the first brief pause,
  // so the old code sent whatever fragment had accumulated ("اے یونیک")
  // as the whole message. Phone sessions now CHAIN: when a session ends
  // after hearing speech, the mic reopens for the continuation while a
  // send timer runs; the accumulated text is sent exactly ONCE, as one
  // message, only when a continuation session hears nothing new (the
  // user really stopped) or the user taps the mic to finish.
  // ------------------------------------------------------------------
  function clearOneShotSendTimer() {
    if (oneShotSendTimerRef.current !== null) {
      window.clearTimeout(oneShotSendTimerRef.current);
      oneShotSendTimerRef.current = null;
    }
  }

  function scheduleOneShotSend(delayMs: number) {
    clearOneShotSendTimer();
    oneShotSendTimerRef.current = window.setTimeout(() => {
      oneShotSendTimerRef.current = null;
      finishOneShotSend();
    }, delayMs);
  }

  function finishOneShotSend() {
    oneShotActiveRef.current = false;
    oneShotFinishRef.current = false;
    clearOneShotSendTimer();
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (rec) {
      // Its onend fires but oneShotActiveRef is already false, so it
      // cannot restart or send a second copy.
      try { rec.stop(); } catch { /* already stopped */ }
    }
    setRecording(false);
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    // If no final result ever arrived (Android single-shot sessions can
    // drop it), fall back to the last interim transcript — the user's
    // words must not be lost just because the engine never finalized.
    const recognizedText = recognizedTextRef.current.trim() || oneShotInterimRef.current.trim();
    recognizedTextRef.current = '';
    oneShotInterimRef.current = '';
    if (recognizedText) {
      const handledAsWebsiteCommand = voiceCommandRef.current
        ? voiceCommandRef.current(recognizedText)
        : handleVoiceWebsiteCommand(recognizedText);
      if (!handledAsWebsiteCommand) {
        void (sendMessageRef.current ? sendMessageRef.current(recognizedText, true) : sendMessage(recognizedText, true));
      }
    }
  }

  function startOneShotMobileSession() {
    if (!oneShotActiveRef.current) return;
    const browserWindow = window as SpeechRecognitionWindow;
    const Recognition = browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;
    if (!Recognition) {
      oneShotActiveRef.current = false;
      setRecording(false);
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      timerRef.current = null;
      setError('اس براؤزر میں مفت آواز پہچاننے کی سہولت دستیاب نہیں۔ براہِ کرم Chrome استعمال کریں یا پیغام لکھیں۔');
      return;
    }
    try {
      const recognition = new Recognition();
      recognition.lang = 'ur-PK';
      recognition.continuous = false;
      // interimResults ON: on Android the FINAL result of a single-shot
      // session sometimes arrives after onend — or never — which used to
      // lose the user's whole utterance. Interim hypotheses are tracked
      // as a fallback and used only if no final ever lands.
      recognition.interimResults = true;
      let sessionGotFinal = false;

      recognition.onresult = (event) => {
        if (!oneShotActiveRef.current) return;
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          if (result?.isFinal) {
            recognizedTextRef.current += `${result[0]?.transcript ?? ''} `;
            oneShotInterimRef.current = '';
            sessionGotFinal = true;
          } else if (result) {
            oneShotInterimRef.current = result[0]?.transcript ?? '';
          }
        }
        // Fresh speech activity (a final OR an interim update) — the
        // pending merged send (if any) must wait for this session's end
        // instead of firing mid-utterance.
        clearOneShotSendTimer();
      };

      recognition.onerror = (event) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          oneShotActiveRef.current = false;
          setError('مائیکروفون کی اجازت دیں، پھر دوبارہ کوشش کریں۔');
        }
        // 'no-speech' / 'aborted' are routine on Android (the session
        // simply timed out) — onend decides what happens next, silently.
      };

      recognition.onend = () => {
        if (recognitionRef.current === recognition) recognitionRef.current = null;
        if (!oneShotActiveRef.current) return;
        if (oneShotFinishRef.current) {
          finishOneShotSend();
          return;
        }
        const hasText = (recognizedTextRef.current.trim() || oneShotInterimRef.current.trim()).length > 0;
        if (!hasText) {
          // Nothing heard yet: Android kills silent sessions quickly, so
          // reopen a few times while the user gathers their thought; then
          // give up quietly (no fragment, no error spam).
          if (oneShotRestartsRef.current < 8) {
            oneShotRestartsRef.current += 1;
            startOneShotMobileSession();
          } else {
            oneShotActiveRef.current = false;
            setRecording(false);
            if (timerRef.current !== null) window.clearInterval(timerRef.current);
            timerRef.current = null;
            // Never end in total silence: the user spoke, nothing was
            // heard, and previously NOTHING told him — no message, no
            // error, no sound. Say it out loud and on screen.
            const noHearMessage = 'آواز سمجھ نہیں آئی۔ مائیک دوبارہ دبا کر قریب سے بولیں، یا پیغام لکھ کر بھیجیں۔';
            void playAssistantMessage(noHearMessage);
            setError(noHearMessage);
          }
          return;
        }
        if (sessionGotFinal && oneShotRestartsRef.current < 8) {
          // The session heard speech but Android cut it at a pause — the
          // user may still be mid-sentence. Reopen for the continuation
          // AND arm the send timer; if the continuation adds a fragment,
          // onresult clears the timer and the cycle repeats.
          oneShotRestartsRef.current += 1;
          scheduleOneShotSend(1800);
          startOneShotMobileSession();
          return;
        }
        // Continuation heard nothing new (or restarts are exhausted):
        // the utterance is over — send the merged text once, shortly.
        scheduleOneShotSend(1200);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      oneShotActiveRef.current = false;
      setRecording(false);
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      timerRef.current = null;
      setError('مائیکروفون شروع نہیں ہو سکا۔ Chrome کی اجازت چیک کریں۔');
    }
  }

  function toggleRecording() {
    if (recording) {
      // PHONE: tapping the mic while a chained one-shot is running means
      // "I'm done" — send the accumulated utterance as ONE message now.
      if (isMobileTurnMode() && oneShotActiveRef.current) {
        oneShotFinishRef.current = true;
        clearOneShotSendTimer();
        const rec = recognitionRef.current;
        if (rec) {
          try { rec.stop(); } catch { /* already stopped */ } // onend sends
        } else {
          finishOneShotSend();
        }
        return;
      }
      recognitionRef.current?.stop();
      setRecording(false);
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }

    // In live mode the hero mic is never a second, competing recorder:
    // a tap while live means "stop talking and listen to me" (or, when
    // already listening, nothing new — the live session owns the mic).
    if (continuousIntendedRef.current) {
      interruptSpeechAndListen();
      return;
    }

    setError('');
    // Stop any playing reply before listening — otherwise the mic can pick
    // up the speaker and the two voices overlap. The HARD stop: the old
    // stopSpeaking() left the reply's remaining chunks queued behind
    // the recording, ready to resume over the user.
    interruptSpeech();

    // PHONE start: chained single-shot sessions (see above). Desktop
    // falls through to the original code below, unchanged.
    if (isMobileTurnMode()) {
      recognizedTextRef.current = '';
      oneShotInterimRef.current = '';
      oneShotRestartsRef.current = 0;
      oneShotFinishRef.current = false;
      oneShotActiveRef.current = true;
      setRecording(true);
      setRecordingSeconds(0);
      timerRef.current = window.setInterval(
        () => setRecordingSeconds((seconds) => seconds + 1),
        1000,
      );
      startOneShotMobileSession();
      return;
    }

    const browserWindow = window as SpeechRecognitionWindow;
    const Recognition = browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;

    if (!Recognition) {
      setError('اس براؤزر میں مفت آواز پہچاننے کی سہولت دستیاب نہیں۔ براہِ کرم Chrome استعمال کریں یا پیغام لکھیں۔');
      return;
    }

    try {
      recognizedTextRef.current = '';
      const recognition = new Recognition();
      recognition.lang = 'ur-PK';
      // Desktop: original continuous flow, unchanged.
      recognition.continuous = true;
      recognition.interimResults = false;

      recognition.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          if (result?.isFinal) {
            recognizedTextRef.current += `${result[0]?.transcript ?? ''} `;
          }
        }
      };

      recognition.onerror = (event) => {
        setError(event.error === 'not-allowed'
          ? 'مائیکروفون کی اجازت دیں، پھر دوبارہ کوشش کریں۔ (Settings میں «🔓 ساری اجازتیں آن کریں» سے ایک ہی بار سب اجازتیں آن ہو جاتی ہیں۔)'
          : 'آواز سمجھ نہیں آئی۔ دوبارہ کوشش کریں یا پیغام لکھیں۔');
      };

      recognition.onend = () => {
        setRecording(false);
        if (timerRef.current !== null) window.clearInterval(timerRef.current);
        timerRef.current = null;
        const recognizedText = recognizedTextRef.current.trim();
        recognizedTextRef.current = '';
        recognitionRef.current = null;
        if (recognizedText) {
          const handledAsWebsiteCommand = handleVoiceWebsiteCommand(recognizedText);
          if (!handledAsWebsiteCommand) void sendMessage(recognizedText, true);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
      setRecording(true);
      setRecordingSeconds(0);
      timerRef.current = window.setInterval(
        () => setRecordingSeconds((seconds) => seconds + 1),
        1000,
      );
    } catch {
      setRecording(false);
      setError('مائیکروفون شروع نہیں ہو سکا۔ Chrome کی اجازت چیک کریں۔');
    }
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(draft);
    }
  }

  function renderHistoryList() {
    return (
      <div className="history-list" data-testid="list-conversations">
        {conversations.length === 0 ? (
          <div className="history-empty" dir="rtl" data-testid="text-history-empty">آپ کی گفتگوئیں یہاں نظر آئیں گی۔</div>
        ) : conversations.map((conversation) => (
          <div key={conversation.id} className={`history-row${activeId === conversation.id ? ' active' : ''}`} data-testid={`row-conversation-${conversation.id}`}>
            <button
              className="history-select"
              dir="auto"
              onClick={() => { interruptSpeech('chat-switch'); setActiveId(conversation.id); setShowHistory(false); }}
              data-testid={`button-open-conversation-${conversation.id}`}
              title={conversation.title}
            >
              {conversation.title}
            </button>
            <button
              className="history-delete"
              aria-label={`گفتگو حذف کریں: ${conversation.title}`}
              onClick={() => deleteConversation(conversation.id)}
              data-testid={`button-delete-conversation-${conversation.id}`}
            ><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
    );
  }

  const durationLabel = `${Math.floor(recordingSeconds / 60).toString().padStart(2, '0')}:${(recordingSeconds % 60).toString().padStart(2, '0')}`;

  // Waveform + orb state.
  const micLive = recording || continuousVoice;
  const waveMode: WaveMode = isSpeaking ? 'speaking' : isPreparingVoice ? 'idle' : micLive ? 'listening' : 'idle';
  const heroStatus = isPreparingVoice
    ? 'آواز تیار ہو رہی ہے…'
    : continuousVoice
      ? (voiceStatus || 'سن رہا ہوں…')
      : isSpeaking
        ? 'بول رہا ہوں…'
        : busy
          ? 'سوچ رہا ہوں…'
          : 'میں آپ کے ساتھ ہوں';

  return (
    <main className="jarvis" lang="ur" data-testid="page-maira-chat">
      {/* ======= TOP BAR ======= */}
      <header className="jarvis-topbar">
        <div className="jarvis-brand" data-testid="brand-maira">
          <img src="/logo.png" alt="Unique AI" className="jarvis-brand-logo" />
          <span className="jarvis-brand-title">Unique AI</span>
        </div>
        {/* Language selection moved into Settings (Phase سادگی): the
            top bar carries only the brand and the live status. */}
        <div className="jarvis-top-right">
          <span className={`jarvis-live-dot${busy || isSpeaking ? ' pulse' : ''}`} aria-hidden="true" />
          <span className="jarvis-live-text" dir="rtl" data-testid="status-assistant">{heroStatus}</span>
          {error && (
            <button className="jarvis-top-error" onClick={() => setError('')} data-testid="status-chat-error" title={error}>
              <X size={13} />
            </button>
          )}
        </div>
      </header>

      {/* ALWAYS-VISIBLE work indicator (2026-10-29): driven only by
          the Video Maker's real job store, updated every second. It
          shows building/rendering with scene X/Y, done/failed
          honestly, and "no job running" when idle — never a fake
          working sign, and never a chat reply's guess. */}
      <VideoJobIndicator />

      {speechNotice && (
        <div dir="rtl" data-testid="banner-speech-notice" style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          margin: '8px 12px 0', padding: '10px 14px', borderRadius: 12,
          background: 'rgba(251,191,36,0.18)', border: '1px solid rgba(251,191,36,0.5)', color: '#fef3c7',
          fontSize: 13.5, lineHeight: 1.8,
        }}>
          <span style={{ flex: 1, minWidth: 220 }}>{speechNotice}</span>
          {speechReplayText && (
            <button type="button" onClick={() => { const replay = speechReplayText; setSpeechNotice(''); setSpeechReplayText(null); void playAssistantMessage(replay); }} style={{ padding: '6px 14px', borderRadius: 999, border: '1px solid rgba(251,191,36,0.6)', background: 'rgba(251,191,36,0.25)', color: '#fef3c7', fontWeight: 700, cursor: 'pointer' }}>
              دوبارہ سنیں
            </button>
          )}
          <button type="button" onClick={() => { setSpeechNotice(''); setSpeechReplayText(null); }} aria-label="یہ اطلاع بند کریں" style={{ padding: '6px 10px', borderRadius: 999, border: '1px solid transparent', background: 'transparent', color: '#fde68a', cursor: 'pointer' }}>
            ✕
          </button>
        </div>
      )}

      {showPermHint && (
        <div dir="rtl" data-testid="banner-permissions" style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          margin: '8px 12px 0', padding: '10px 14px', borderRadius: 12,
          background: 'rgba(88,28,135,0.35)', border: '1px solid rgba(216,180,254,0.4)', color: '#f3e8ff',
          fontSize: 13.5, lineHeight: 1.8,
        }}>
          <span style={{ flex: 1, minWidth: 220 }}>
            🔓 ایک بار ساری اجازتیں (مائیک، کیمرا، مقام) آن کر دیں تو ہر ٹول بغیر رکے چلے گا — براؤزر ہر اجازت صرف پہلی بار پوچھتا ہے۔
          </span>
          <button type="button" onClick={warmUpFromHint} disabled={permHintBusy} style={{ padding: '6px 14px', borderRadius: 999, border: '1px solid rgba(216,180,254,0.6)', background: 'rgba(139,92,246,0.35)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
            {permHintBusy ? 'ہو رہا ہے…' : '🔓 ساری اجازتیں آن کریں'}
          </button>
          <button type="button" onClick={dismissPermHint} aria-label="یہ اطلاع بند کریں" style={{ padding: '6px 10px', borderRadius: 999, border: '1px solid transparent', background: 'transparent', color: '#e9d5ff', cursor: 'pointer' }}>
            ✕
          </button>
        </div>
      )}

      {/* ======= BODY: rail | chat | hero | status ======= */}
      <div className="jarvis-body">
        {/* Slim vertical icon toolbar */}
        <nav className="jarvis-rail" aria-label="مینیو">
          <button className="rail-btn" onClick={(e) => { hideTipOnClick(e); startNewChat(); }} onMouseLeave={restoreTipOnLeave} aria-label="نئی گفتگو" data-tip="نئی گفتگو" data-testid="button-new-chat">
            <Plus size={18} />
          </button>
          <button className="rail-btn" onClick={(e) => { hideTipOnClick(e); setShowHistory((v) => !v); }} onMouseLeave={restoreTipOnLeave} aria-label="گفتگوؤں کی فہرست" data-tip="گفتگوؤں کی فہرست" data-testid="button-mobile-history">
            <Clock3 size={18} />
          </button>
          <button
            className={`rail-btn${continuousVoice ? ' active' : ''}`}
            onClick={(e) => { hideTipOnClick(e); toggleContinuousVoice(); }}
            onMouseLeave={restoreTipOnLeave}
            aria-label={continuousVoice ? 'مسلسل آواز بند کریں' : 'مسلسل آواز چالو کریں'}
            aria-pressed={continuousVoice}
            data-tip="مسلسل آواز — بولیں، جواب خود آئے گا"
            data-testid="button-continuous-voice"
          >
            <AudioLines size={18} />
          </button>
          <button
            className={`rail-btn${agentTeamSceneOpen ? ' active' : ''}`}
            onClick={(e) => { hideTipOnClick(e); setAgentTeamSceneOpen((v) => !v); }}
            onMouseLeave={restoreTipOnLeave}
            aria-label="ایجنٹ ٹیم دیکھیں"
            aria-pressed={agentTeamSceneOpen}
            data-tip="ایجنٹ ٹیم 🤖"
            data-testid="button-agent-team"
          >
            <Bot size={18} />
          </button>
          {/* Phase سادگی: the rail keeps ONLY conversation essentials —
              new chat, history, continuous voice, agent team. Gestures
              moved into Settings (its toggle already lived there); the
              tools button is GONE with the whole toolbox; map/WhatsApp
              have no rail buttons — they open by voice («نقشہ دکھاؤ»,
              «واٹس ایپ کھولو») as full-screen scenes. The ONE settings
              button is the gear in the status panel. */}
        </nav>

        {/* LEFT: chat messages */}
        <section className="jarvis-chat" aria-label="گفتگو">
          <div className="jarvis-chat-scroll">
            {storageError && (
              <div className="jarvis-alert" role="status" dir="rtl" data-testid="status-storage-error">
                <span>Browser storage دستیاب نہیں، اس لیے جانے کے بعد یہ گفتگو محفوظ نہ رہ سکے گی۔</span>
                <button onClick={() => setStorageError(false)}>بند کریں</button>
              </div>
            )}
            {!activeConversation || activeConversation.messages.length === 0 ? (
              <div className="jarvis-welcome" data-testid="section-welcome">
                <div className="jarvis-welcome-eyebrow" dir="rtl">جب چاہیں، تھوڑی سی مدد</div>
                <h1 dir="rtl">السلام علیکم۔<br /><span>میں Unique AI ہوں۔</span></h1>
                <p dir="rtl">آپ اردو، رومن اردو، انگریزی یا عربی میں بات کر سکتے ہیں۔</p>
                <div className="jarvis-suggestions">
                  {suggestions.map((suggestion, index) => (
                    <button key={suggestion} className="jarvis-suggestion" dir="auto" onClick={() => void sendMessage(suggestion)} data-testid={`button-suggestion-${index}`}>
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="jarvis-messages" data-testid="list-messages">
                {activeConversation.messages.map((message) => (
                  <article key={message.id} className={`jmsg ${message.role}`} data-testid={`message-${message.role}-${message.id}`}>
                    <div className="jmsg-bubble" dir="auto" data-testid={`text-message-content-${message.id}`}>
                      {message.image ? (
                        message.image.startsWith('data:video/') ? (
                          <video src={message.image} controls className="jmsg-image" />
                        ) : (
                          <img src={message.image} alt="بھیجی گئی فائل" className="jmsg-image" />
                        )
                      ) : null}
                      {renderMessageContent(message.content)}
                    </div>
                    {message.role === 'assistant' ? (
                      <button
                        className="jmsg-speak"
                        onClick={() => void playAssistantMessage(message.content)}
                        data-testid={`button-speak-${message.id}`}
                        aria-label="جواب سنیں"
                      >
                        <Volume2 size={12} />
                        <span dir="rtl">سنیں</span>
                      </button>
                    ) : (
                      <div className="jmsg-meta" dir="rtl">آپ</div>
                    )}
                  </article>
                ))}
                {busy && (
                  <div className="jmsg assistant" data-testid="status-thinking">
                    <div className="jmsg-thinking" dir="rtl">
                      <span>سوچ رہا ہوں</span>
                      <span className="jmsg-dots" aria-hidden="true"><i /><i /><i /></span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </section>

        {/* CENTER: hero orb + waveform + input */}
        <section className="jarvis-center" aria-label="Unique AI">
          <div
            className={`hero-orb-wrap${isSpeaking || isPreparingVoice ? ' tappable' : ''}`}
            onClick={() => {
              // Tap the orb while it speaks = "stop, listen to me" —
              // works even where recognition barge-in is unavailable.
              if (isSpeaking || isPreparingVoice || ttsActiveRef.current) interruptSpeechAndListen();
            }}
            title={isSpeaking || isPreparingVoice ? 'رکنے کے لیے دبائیں' : undefined}
          >
            <AiOrb isSpeaking={isSpeaking} isThinking={busy || isPreparingVoice} size={212} />
          </div>
          <div className="hero-name">
            <span className="hero-name-text">Unique AI</span>
            {/* Persona indicator (Phase 2): who is "present" right now.
                Defaults to Unique; shows Uniqa (and the tone, when set)
                only while she is the active companion. */}
            <span
              className="hero-name-sub"
              dir="rtl"
              data-testid="persona-indicator"
              style={{ color: persona === 'uniqa' ? '#f0a6c8' : undefined }}
            >
              {persona === 'uniqa' ? '💛 یونیکا حاضر ہے' : 'یونیک حاضر ہے'}
              {tone === 'serious' ? ' · سنجیدہ لہجہ' : tone === 'romantic' ? ' · رومینٹک لہجہ' : ''}
            </span>
            <span className="hero-name-sub" dir="rtl" data-testid="text-avatar-status">{heroStatus}</span>
          </div>
          <div className="hero-wave">
            <VoiceWaveform mode={waveMode} height={78} />
          </div>
          {(continuousVoice && voiceStatus) || recording ? (
            <div className="hero-voice-status" dir="rtl" data-testid="status-continuous-voice">
              <span className="hero-voice-pulse" aria-hidden="true" />
              <span>{recording ? `ریکارڈ ہو رہا ہے · ${durationLabel}` : voiceStatus}</span>
            </div>
          ) : null}
          {attachedImage ? (
            <div className="hero-attach-preview" dir="ltr">
              {attachedImage.startsWith('data:video/') ? (
                <video src={attachedImage} className="hero-attach-thumb" muted />
              ) : (
                <img src={attachedImage} alt="منسلک فائل" className="hero-attach-thumb" />
              )}
              <button
                type="button"
                className="hero-attach-remove"
                onClick={() => setAttachedImage(null)}
                aria-label="فائل ہٹائیں"
              >
                ✕
              </button>
              <span className="hero-attach-hint">{attachedImage.startsWith('data:video/') ? 'ویڈیو تیار ہے — سوال لکھیں یا بھیج دیں 🎬' : 'تصویر تیار ہے — سوال لکھیں یا بھیج دیں 📷'}</span>
            </div>
          ) : null}
          <div className="hero-composer">
            <button
              className={`hero-mic${recording ? ' recording' : ''}`}
              onClick={() => {
                // While the AI speaks, the mic button is the interrupt:
                // silence it instantly and take the user's new turn.
                // (During streaming `busy` is true, so the button must
                // stay enabled exactly while speech is in flight.)
                if (isSpeaking || isPreparingVoice || ttsActiveRef.current) interruptSpeechAndListen();
                else void toggleRecording();
              }}
              disabled={busy && !isSpeaking && !isPreparingVoice}
              aria-label={recording ? 'ریکارڈنگ روکیں' : 'آواز ریکارڈ کریں'}
              data-testid="button-microphone"
            >
              {recording ? <MicOff size={17} /> : <Mic size={17} />}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              style={{ display: 'none' }}
              onChange={handleImagePick}
              aria-label="تصویر یا ویڈیو لگائیں"
              data-testid="input-image-attach"
            />
            <button
              className="hero-attach"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              aria-label="تصویر یا ویڈیو بھیجیں"
              data-testid="button-attach-image"
              title="تصویر یا ویڈیو بھیجیں 📷"
            >
              📎
            </button>
            <textarea
              ref={textareaRef}
              value={draft}
              dir="auto"
              onChange={(event) => {
                setDraft(event.target.value);
                event.currentTarget.style.height = 'auto';
                event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 120)}px`;
              }}
              onKeyDown={onComposerKeyDown}
              onPaste={handleComposerPaste}
              placeholder="Type a message…"
              aria-label="Unique AI کو پیغام لکھیں"
              rows={1}
              data-testid="input-message"
            />
            <button
              className="hero-send"
              onClick={() => void sendMessage(draft)}
              disabled={(!draft.trim() && !attachedImage) || busy}
              aria-label="پیغام بھیجیں"
              data-testid="button-send-message"
            >
              <Send size={16} />
            </button>
          </div>
          <div className="hero-caption" dir="rtl" data-testid="text-composer-caption">
            Unique AI سے غلطی ہو سکتی ہے۔ جو مددگار لگے، وہ لے لیں۔
          </div>
        </section>

        {/* RIGHT: system status */}
        <StatusPanel
          status={{
            micActive: micLive,
            speaking: isSpeaking,
            thinking: busy,
            gesturesOn: gesturesEnabled,
            continuousVoice,
          }}
          settings={appSettings}
          onSettingsChange={setAppSettings}
          persona={persona}
          onPersonaChange={changePersona}
          tone={tone}
          onToneChange={changeTone}
          chatLang={chatLang}
          onChatLangChange={(v: string) => {
            setChatLang(v);
            try { localStorage.setItem('unique-ai-chat-lang', v); } catch { /* ignore */ }
          }}
          onOpenPairing={() => setPairingOpen(true)}
          onBackupDownload={() => { downloadBrainBackup(); }}
          onBackupRestore={() => backupInputRef.current?.click()}
          onClearChat={() => {
            interruptSpeech('chat-cleared'); // the cleared chat's reply stops with it
            if (activeConversation) {
              // Clear messages of active conversation
              setConversations(prev => prev.map(c =>
                c.id === activeConversation.id ? { ...c, messages: [] } : c
              ));
            }
          }}
          onTestVoice={() => {
            // Voice test: speak a short phrase so the user can check if
            // sound comes out of their speakers. MUST go through the real
            // Gemini voice path (playAssistantMessage) — the old version
            // called the browser voice directly, so the test stayed silent
            // on devices without a device voice even when the real
            // (Charon) voice worked, misleading everyone (fixed 2026-10-20).
            void playAssistantMessage('السلام علیکم! یہ آواز کا ٹیسٹ ہے۔ کیا آپ مجھے سن سکتے ہیں؟');
          }}
        />

        {/* FAR RIGHT: the development office ON the main screen
            (user decision, 2026-10-23) — cabins beside the chat,
            lit by the SAME real task state as the strip and the
            🤖 overlay scene; ⤢ opens that big view. */}
        <AgentOfficePanel
          tasks={agentTeam}
          persona={persona}
          boardEntries={boardEntries}
          buildLive={buildLive}
          onExpand={() => setAgentTeamSceneOpen(true)}
        />
      </div>

      {/* ======= FOCUS VIEW: one thing at a time fills the whole screen ======= */}
      {focusView && (
        <div className="focus-view" dir="rtl" role="region" aria-label="فوکس منظر" data-testid="panel-focus">
          <div className="focus-view-head">
            <span className="focus-view-title">
              {focusView === 'map' ? '🗺️ نقشہ' : focusView === 'whatsapp' ? '💬 WhatsApp' : '📖 قرآن پاک'}
            </span>
            <button type="button" className="focus-view-close" onClick={() => setFocusView(null)} aria-label="واپس جائیں" data-testid="button-focus-back">
              ✕ واپس
            </button>
          </div>
          <div className="focus-view-body">
            {focusView === 'map' && <MapWidget />}
            {focusView === 'whatsapp' && <WhatsAppSender />}
            {focusView === 'quran' && <QuranReader autoplayRequest={quranAutoplayReq} />}
            {/* No 'tools' focus scene any more — the toolbox is gone;
                capabilities open as overlays from the brain's actions. */}
          </div>
        </div>
      )}

      {/* ======= Overlays: builders, agent team, result cards, media UIs, gestures, history ======= */}
      {appBuild && (
        <AppBuilder description={appBuild.description} onClose={() => setAppBuild(null)} />
      )}
      {/* Helper-agent team (Task D) — on the MAIN CHAT screen: the live
          strip while several real actions run, the persistent office
          panel in the body grid above, and the office overlay scene
          (close-up) opened from the 🤖 rail button / the panel's ⤢. */}
      {agentTeam && (
        <AgentTeamStrip tasks={agentTeam} onClose={() => setAgentTeam(null)} />
      )}
      {agentTeamSceneOpen && (
        <AgentTeamScene
          tasks={agentTeam}
          persona={persona}
          boardEntries={boardEntries}
          buildLive={buildLive}
          onClose={() => setAgentTeamSceneOpen(false)}
        />
      )}
      {toolActions && toolActions.map((multiAction, i) => (
        <ToolResults
          key={`${multiAction.type}-${i}`}
          action={multiAction}
          onClose={() => {
            setToolActions((current) => {
              const next = (current || []).filter((_, j) => j !== i);
              return next.length ? next : null;
            });
          }}
          onTimerDone={() => {
            void playAssistantMessage('ٹائمر ختم ہو گیا!');
          }}
          onBuildReady={handleBuildReady}
          onBuildFailed={handleBuildFailed}
          onBuildSettled={handleBuildSettled}
        />
      ))}
      {toolAction && (
        <ToolResults
          action={toolAction}
          onClose={() => setToolAction(null)}
          onTimerDone={() => {
            void playAssistantMessage('ٹائمر ختم ہو گیا!');
          }}
          onBuildReady={handleBuildReady}
          onBuildFailed={handleBuildFailed}
          onBuildSettled={handleBuildSettled}
        />
      )}
      {mediaTool && (
        <MediaTools
          tool={mediaTool}
          initialSection={toolSection}
          initialPhone={toolPrefill?.phone}
          onBrainTool={(example) => { setMediaTool(null); setToolPrefill(null); setToolSection(undefined); setDraft(example); textareaRef.current?.focus(); }}
          onClose={() => { setMediaTool(null); setToolPrefill(null); setToolSection(undefined); }}
        />
      )}
      {/* Device pairing: stays mounted while linked so incoming
          conversations/commands arrive even with the panel closed.
          Its entry point lives in Settings (📱 ڈیوائس جوڑیں) — the
          only settings button on the screen — plus ?pair=CODE links. */}
      <DevicePairing
        open={pairingOpen}
        onClose={() => setPairingOpen(false)}
        onRequestOpen={() => setPairingOpen(true)}
        initialJoinCode={pairingJoinCode}
        getConversation={getPairingConversation}
        onReceiveConversation={handleReceivedConversation}
        onRemoteCommand={handleRemoteCommand}
        onCallUtterance={handleCallUtterance}
        onCallReply={handleCallReply}
        onCallStateChange={handleCallStateChange}
        callControlRef={callControlRef}
      />

      {/* Brain backup restore (Phase 4): the hidden picker — opened
          by the Settings button or the «بیک اپ واپس لاؤ» voice
          command; the pick itself is always the user's own tap. */}
      <input
        ref={backupInputRef}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={(event) => void handleBackupFilePicked(event)}
        data-testid="input-backup-file"
        aria-hidden="true"
        tabIndex={-1}
      />
      {pendingRestore && (
        <div
          className="history-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setPendingRestore(null);
          }}
        >
          <section className="backup-dialog" dir="rtl" role="alertdialog" aria-label="بیک اپ بحالی کی تصدیق" data-testid="dialog-backup-restore">
            <div className="backup-dialog-title">🧠 بیک اپ واپس لائیں؟</div>
            <div className="tool-small-note">
              فائل: <span dir="ltr">{pendingRestore.fileName}</span>
              {pendingRestore.summary.createdAt
                ? ` — بنی تھی: ${new Date(pendingRestore.summary.createdAt).toLocaleString()}`
                : ''}
            </div>
            <ul className="backup-dialog-list">
              <li>💬 گفتگوئیں: {pendingRestore.summary.conversations}</li>
              <li>📝 یادیں / نوٹس: {pendingRestore.summary.notes}</li>
              <li>🌱 سیکھی ہوئی باتیں: {pendingRestore.summary.learnings}</li>
              <li>🗂️ کل محفوظ اندراجات: {pendingRestore.summary.totalEntries}</li>
            </ul>
            <p className="backup-dialog-warn">
              اس سے اس ڈیوائس کی موجودہ گفتگوئیں، یادیں اور سیٹنگز اس فائل والی حالت سے <strong>بدل جائیں گی</strong>۔
              API keys نہیں بدلیں گی — وہ اس فائل میں شامل ہی نہیں ہوتیں، اور اس ڈیوائس پر موجود keys ویسے ہی رہیں گی
              (نئی ڈیوائس پر بحالی کے بعد keys ایک بار دوبارہ ڈالنی ہوں گی)۔
            </p>
            <div className="backup-dialog-actions">
              <button type="button" className="backup-confirm-btn" onClick={confirmBackupRestore} data-testid="button-backup-confirm">
                ہاں، واپس لائیں
              </button>
              <button type="button" className="backup-cancel-btn" onClick={() => setPendingRestore(null)} data-testid="button-backup-cancel">
                منسوخ
              </button>
            </div>
          </section>
        </div>
      )}

      {gesturesEnabled && (
        <div className="gesture-pip" dir="rtl" data-testid="panel-gestures" aria-label="ہاتھ کے اشارے">
          <div className="gesture-pip-head">
            <span className="gesture-pip-title">اشارے</span>
            <button className="gesture-pip-close" onClick={() => { setGesturesEnabled(false); setAppSettings((s: any) => ({ ...s, gesturesEnabled: false })); }} aria-label="اشارے بند کریں" data-testid="button-close-gestures">
              <X size={13} />
            </button>
          </div>
          <video ref={gestureVideoRef} className="gesture-pip-video" muted playsInline data-testid="video-gesture" />
          <div className="gesture-pip-hint" data-testid="text-gesture-status">
            {gestureStatus === 'ready'
              ? (activeGesture !== 'none' ? GESTURE_LABELS[activeGesture] : 'ہاتھ سامنے رکھیں')
              : (gestureStatusMessage || 'تیار ہو رہا ہے…')}
          </div>
        </div>
      )}

      {showHistory && (
        <div
          className="history-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setShowHistory(false);
          }}
          data-testid="dialog-mobile-history"
        >
          <section className="history-drawer" aria-label="گفتگوؤں کی فہرست">
            <div className="history-drawer-head">
              <div>
                <div className="history-drawer-title" dir="rtl">آپ کی گفتگوئیں</div>
                <div className="history-drawer-sub" dir="rtl">اسی آلے پر محفوظ</div>
              </div>
              <button className="rail-btn" onClick={() => setShowHistory(false)} aria-label="فہرست بند کریں" data-testid="button-close-history">
                <X size={17} />
              </button>
            </div>
            <button className="history-new" onClick={startNewChat} data-testid="button-mobile-dialog-new-chat">
              <Plus size={15} /> <span dir="rtl">نئی گفتگو</span>
            </button>
            {renderHistoryList()}
            <button className="history-clear" onClick={clearHistory} disabled={!conversations.length} data-testid="button-mobile-clear-history">
              <Trash2 size={14} /> <span dir="rtl">تمام گفتگوئیں حذف کریں</span>
            </button>
            <p className="history-note" dir="rtl"><Shield size={13} /> صرف اسی browser میں محفوظ۔ account سے sync نہیں ہوتی۔</p>
          </section>
        </div>
      )}
    </main>
  );
}
