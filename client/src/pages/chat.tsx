import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import {
  AudioLines,
  Clock3,
  Hand,
  Map as MapIcon,
  MessageCircle,
  Mic,
  MicOff,
  Plus,
  Send,
  Shield,
  Trash2,
  Volume2,
  Wrench,
  X,
} from 'lucide-react';
import {
  synthesizeMairaSpeech,
  synthesizeGoogleSpeech,
  synthesizeEdgeSpeech,
  useSendMairaChatMessage,
  getGeminiKeys,
  TTS_PLAYBACK_RATE,
} from '@/lib/api';
import { synthesizeSalmanClientSide } from '@/lib/edge-tts';
import { parseWebsiteCommand } from '@/lib/voice-commands';
import { useGestures } from '@/hooks/useGestures';
import { GESTURE_LABELS, type GestureName } from '@/lib/gestures';
import ProjectBuilder from '@/components/ProjectBuilder';
import AppBuilder from '@/components/AppBuilder';
import ToolResults from '@/components/ToolResults';
import MediaTools, { type MediaToolName } from '@/components/MediaTools';
import ToolsPanel from '@/components/ToolsPanel';
import VideoCreator from '@/components/VideoCreator';
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
  const [projectBuild, setProjectBuild] = useState<{ description: string } | null>(null);
  const [appBuild, setAppBuild] = useState<{ description: string } | null>(null);
  const [toolAction, setToolAction] = useState<ChatAction | null>(null);
  const [mediaTool, setMediaTool] = useState<MediaToolName | null>(null);
  const [toolsPanelOpen, setToolsPanelOpen] = useState(false);
  // Focus mode (user's simple-display vision): name a thing — "نقشہ دکھاؤ",
  // "WhatsApp کھولو" — and ONLY that thing fills the screen until واپس.
  const [focusView, setFocusView] = useState<null | 'map' | 'whatsapp' | 'quran' | 'tools'>(null);
  // Bumped each time a voice command asks to HEAR the Quran («تلاوت سناؤ»):
  // opening the reader alone was silent — the bump tells QuranReader to
  // open Surah Al-Fatiha and start speaking its translation right away.
  const [quranAutoplay, setQuranAutoplay] = useState(0);
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
  // Phone live mic: how many sessions in a row ended without any speech —
  // drives the restart backoff that stops the mic blinking on/off.
  const phoneEmptyEndsRef = useRef(0);
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
  const ttsPrefetchRef = useRef<{ text: string; promise: Promise<{ audioBase64: string; mimeType: string } | null>; eagerPlayed: boolean; playPromise: Promise<void> | null } | null>(null);
  // TTS health: track consecutive server TTS failures. After 3 failures,
  // skip server TTS for the session and go straight to browser voice.
  const serverTtsFailsRef = useRef(0);
  const serverTtsDownRef = useRef(false);
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
        stopSpeaking(); // "رکو" — stop the voice
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
      stopSpeaking();
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

  async function sendMessage(textValue: string, fromVoice = false) {
    const text = textValue.trim();
    if (!text && !attachedImage) return;
    // Never swallow a send in silence: if a reply is still being fetched,
    // say so on screen. (This guard used to drop voice messages without a
    // trace whenever an earlier request was slow or stuck.)
    if (chatMutation.isPending) {
      setError('پچھلا جواب ابھی آ رہا ہے — چند لمحے انتظار کریں، پھر دوبارہ بولیں۔');
      return;
    }
    // Focus commands work from BOTH typed text and voice: name a thing
    // (نقشہ / WhatsApp / قرآن / ٹولز) and it alone fills the screen.
    if (!attachedImage && handleFocusCommand(text)) return;
    // Website commands work from typed text too — not just voice.
    // (Voice paths already check this before calling sendMessage.)
    if (!fromVoice && !attachedImage && handleVoiceWebsiteCommand(text)) return;
    setError('');
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
    // Reset TTS prefetch for this new message
    ttsPrefetchRef.current = null;
    streamedTextRef.current = '';
    try {
      const result = await chatMutation.mutateAsync({
        data: {
          messages: sentMessages.slice(-30).map(({ role, content, image }) => ({ role, content, ...(image ? { image } : {}) })),
          stream: true,
          language: chatLang === 'auto' ? undefined : chatLang,
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
                  promise: synthesizeWithTimeout(firstSentence),
                  eagerPlayed: false,
                  playPromise: null as Promise<void> | null,
                };
                ttsPrefetchRef.current = entry;
                setIsPreparingVoice(true);
                entry.promise.then((audio) => {
                  const pf = ttsPrefetchRef.current;
                  // Only play if this is still the current message's prefetch
                  // (a new message would have reset the ref).
                  if (pf === entry && !pf.eagerPlayed && audio && appSettings.voiceEnabled) {
                    pf.eagerPlayed = true;
                    pf.playPromise = playAudioChunk(audio.audioBase64, audio.mimeType);
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
      // Smart-brain action (Phase 2): open a website or start a project build.
      if (result.action?.type === 'open_url') {
        // Never window.open here: this runs AFTER an async fetch, so the
        // browser's popup blocker kills the tab (no user activation
        // left) and the user was left with a dead reply — or worse, a
        // raw percent-encoded URL pasted into the chat (his laptop
        // report 2026-10-21). Show a tappable in-app card instead: the
        // tap IS a user gesture, so the site always opens, and the chat
        // text stays clean Urdu with no raw URL.
        setToolAction({ type: 'open_link', url: result.action.url, displayName: result.action.displayName });
      } else if (result.action?.type === 'build_project') {
        setProjectBuild({ description: result.action.description });
      } else if (result.action?.type === 'android_app') {
        setAppBuild({ description: result.action.description });
      } else if (result.action?.type === 'open_tool') {
        setMediaTool(result.action.tool as MediaToolName);
        if (result.action.phone) {
          setToolPrefill({ phone: result.action.phone });
        }
      } else if (result.action) {
        // Professional toolbox actions: search, weather, videos, timer, notes, etc.
        setToolAction(result.action as ChatAction);
      }
      // The assistant speaks EVERY reply aloud automatically — no mic or button needed.
      void playAssistantMessage(result.text);
    } catch (sendError) {
      // Remove the streaming placeholder on failure
      setIsPreparingVoice(false);
      updateConversation(id, (item) => ({
        ...item,
        messages: item.messages.filter((m) => m.id !== assistantId),
      }));
      const failureMessage = getErrorMessage(sendError);
      // Speak WHY it failed, in Urdu — in hands-free use the user may never
      // look at the screen, and a silent failure reads as "the app is
      // dead". The spoken path also resumes the live mic for the next
      // turn. setError runs after, because playAssistantMessage clears
      // the error banner on entry.
      void playAssistantMessage(failureMessage);
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
   * (map / WhatsApp / Quran / tools) and ONLY that thing fills the screen.
   * Saying "واپس" (or "بند کرو") closes it and returns to the simple display.
   */
  function handleFocusCommand(recognizedText: string): boolean {
    // Close/back — only meaningful when a focus view is open.
    if (focusView && /(واپس|پیچھے|بند کرو|بند کر|back|close)/i.test(recognizedText)) {
      setFocusView(null);
      const msg = 'ٹھیک ہے، واپس آ گئے۔';
      appendWebsiteCommandExchange(recognizedText, msg);
      playAssistantMessage(msg);
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
    const focusTargets: Array<[RegExp, 'map' | 'whatsapp' | 'quran' | 'tools', string, string]> = [
      [/(نقشہ|نقشے|\bmap\b)/i, 'map', '🗺️ نقشہ', '🗺️ نقشہ سامنے ہے — جگہ تلاش کریں یا راستہ دیکھیں۔ واپس آنے کے لیے «واپس» کہیں یا ✕ دبائیں۔'],
      [/(واٹس ایپ|واٹس‌ایپ|whatsapp)/i, 'whatsapp', '💬 WhatsApp', '💬 WhatsApp سامنے ہے — نمبر اور پیغام لکھ کر بھیجیں۔ واپس آنے کے لیے «واپس» کہیں۔'],
      [/(قرآن|quran)/i, 'quran', '📖 قرآن پاک', '📖 قرآن پاک سامنے ہے — سورت منتخب کریں۔ واپس آنے کے لیے «واپس» کہیں۔'],
      [/(ٹولز|ٹول باکس|\btools\b|\btoolbox\b|tool\s*box)/i, 'tools', '🧰 ٹولز', '🧰 سارے ٹولز سامنے ہیں — جو چاہیے منتخب کریں۔ واپس آنے کے لیے «واپس» کہیں۔'],
    ];
    for (const [pattern, view, , reply] of focusTargets) {
      const gateOk = hasVerb || (isShort && !isQuestion) || (view === 'quran' && wantsRecite);
      if (pattern.test(recognizedText) && gateOk) {
        setFocusView(view);
        if (view === 'quran' && wantsRecite) {
          setQuranAutoplay((n) => n + 1);
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
    const voices = window.speechSynthesis.getVoices();
    // ABSOLUTE rule (user demand): NEVER a female voice. A browser voice is
    // used ONLY when its name EXPLICITLY signals male — on Samsung devices
    // the first Urdu voice is Google's FEMALE Urdu voice with NO female
    // marker in its name, so "not obviously female" is not good enough and
    // positional fallbacks (first Urdu/Hindi/any voice) kept letting her
    // speak. No explicit male marker → return undefined: silence + an
    // on-screen Urdu reason is correct, a female voice never is.
    const isExplicitMale = (v: SpeechSynthesisVoice) => {
      const n = v.name.toLowerCase();
      return n.includes('male') || n.includes('asad') || n.includes('salim');
    };
    const maleVoices = voices.filter(isExplicitMale);
    // Language preference among explicitly-male voices only: Urdu first,
    // then Hindi, then any language.
    return (
      maleVoices.find((v) => v.lang.toLowerCase().startsWith('ur')) ||
      maleVoices.find((v) => v.lang.toLowerCase().startsWith('hi')) ||
      maleVoices[0]
    );
  }

  async function speakNow(text: string) {
    if (!appSettings.voiceEnabled) { ttsActiveRef.current = false; return; }
    if (!('speechSynthesis' in window)) {
      ttsActiveRef.current = false;
      setError('اس براؤزر میں آواز کی سہولت دستیاب نہیں۔');
      return;
    }
    const synth = window.speechSynthesis;
    // Chrome bug workarounds:
    // 1. cancel() then immediate speak() often fails silently — wait after cancel.
    // 2. speechSynthesis can get stuck in "paused" state — resume it.
    synth.cancel();
    try { synth.resume(); } catch { /* ignore */ }
    await new Promise((r) => setTimeout(r, 150));
    setIsSpeaking(false);
    setIsPreparingVoice(false);

    // Split into sentences — Chrome cuts off very long utterances.
    const cleanText = text.slice(0, 4000).trim();
    const sentences = cleanText.match(/[^۔.!?\n]+[۔.!?\n]*/g)?.map((s) => s.trim()).filter(Boolean) || [cleanText];
    const voice = pickUrduMaleVoice();
    // STRICT: if no non-female voice exists, do NOT speak — a female voice
    // is worse than silence. Tell the user to fix their Gemini key.
    if (!voice) {
      setIsSpeaking(false);
      setIsPreparingVoice(false);
      setError('اس ڈیوائس میں کوئی مردانہ آواز نہیں ملی۔ Settings میں اپنی Gemini key دوبارہ چیک کرو — وہی اصل مردانہ آواز دیتی ہے۔');
      resumeContinuousAfterTts();
      return;
    }
    let spokenAny = false;
    let failedAll = true;

    const speakSentence = (index: number) => {
      if (index >= sentences.length) {
        setIsSpeaking(false);
        resumeContinuousAfterTts();
        if (!spokenAny && failedAll) {
          const n = synth.getVoices().length;
          setError(`آواز نہیں چل سکی (آوازیں: ${n})۔ فون کی Settings میں Text-to-Speech میں اردو آواز انسٹال کریں۔`);
        }
        return;
      }
      const utterance = new SpeechSynthesisUtterance(sentences[index]);
      utterance.lang = voice ? voice.lang : 'ur-PK';
      utterance.rate = 1.25;
      utterance.volume = 1;
      utterance.pitch = 0.9; // slightly deeper (masculine)
      if (voice) utterance.voice = voice;
      utterance.onend = () => {
        spokenAny = true;
        failedAll = false;
        speakSentence(index + 1);
      };
      utterance.onerror = () => {
        // Try next sentence — don't give up on one failure.
        speakSentence(index + 1);
      };
      try { synth.resume(); } catch { /* ignore */ }
      synth.speak(utterance);
    };

    setIsSpeaking(true);
    speakSentence(0);
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

  function speakWithBrowser(text: string) {
    if (!('speechSynthesis' in window)) {
      ttsActiveRef.current = false;
      setError('اس براؤزر میں آواز کی سہولت دستیاب نہیں۔');
      return;
    }
    // Don't play garbage: only use browser TTS when an EXPLICITLY male
    // voice exists (the same strict picker speakNow uses). If voices are
    // loaded and none qualifies, show the reason and stay silent — the
    // device default voice (often female) must never speak.
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0 && !pickUrduMaleVoice()) {
      // Nothing will speak: close the speech span so the live mic's
      // recovery path can reopen instead of waiting on a span that
      // never ends.
      ttsActiveRef.current = false;
      setError('مردانہ آواز تیار نہیں ہو سکی (Gemini key چیک کریں) اور اس ڈیوائس میں اردو آواز انسٹال نہیں۔ Settings میں key دوبارہ چیک کریں۔');
      setIsPreparingVoice(false);
      setIsSpeaking(false);
      return;
    }
    // Chrome loads voices asynchronously; the list is often empty on the
    // first call. Wait for it (once) instead of speaking into silence.
    if (window.speechSynthesis.getVoices().length === 0) {
      let settled = false;
      const go = () => {
        if (settled) return;
        settled = true;
        window.speechSynthesis.removeEventListener('voiceschanged', go);
        speakNow(text);
      };
      window.speechSynthesis.addEventListener('voiceschanged', go);
      setTimeout(go, 1500);
    } else {
      speakNow(text);
    }
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
  function playAudioChunk(audioBase64: string, mimeType: string): Promise<void> {
    return new Promise((resolve) => {
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
        audio.onplaying = () => {
          playbackStartedRef.current = true;
          setIsPreparingVoice(false);
          setIsSpeaking(true);
        };
        const done = () => {
          setIsPreparingVoice(false);
          setIsSpeaking(false);
          URL.revokeObjectURL(url);
          if (serverAudioRef.current === audio) serverAudioRef.current = null;
          resolve();
        };
        audio.onended = done;
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          if (serverAudioRef.current === audio) serverAudioRef.current = null;
          done();
        };
        audio.play().catch(() => {
          // Blocked (autoplay policy) or failed before starting — record it
          // so the caller can fall back to the browser voice on phones.
          playbackBlockedRef.current = true;
          done();
        });
      } catch {
        resolve();
      }
    });
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
  // explains WHY in Urdu. serverTtsDown tracks the GEMINI leg only:
  // Edge has no quota, so a transient Edge failure must never mute
  // the session.
  // Returns null on failure (caller falls back to browser voice).
  function synthesizeWithTimeout(text: string, timeoutMs = 12000): Promise<{ audioBase64: string; mimeType: string } | null> {
    // Keys changed since the last attempt? Forget any earlier "TTS down"
    // verdict and try fresh — the new keys may work even if the old failed.
    try {
      const fp = getGeminiKeys().join('|');
      if (ttsKeysFingerprintRef.current !== fp) {
        ttsKeysFingerprintRef.current = fp;
        serverTtsDownRef.current = false;
        serverTtsFailsRef.current = 0;
      }
    } catch { /* ignore */ }
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
      // Gemini leg. Once every saved key has answered quota/auth the leg
      // is muted for the session (serverTtsDownRef) and skipped without a
      // network call. Its classified error is captured, not shown yet —
      // the Edge leg may still save this reply.
      let geminiErr: any = null;
      const attemptGemini = async (): Promise<{ audioBase64: string; mimeType: string } | null> => {
        if (serverTtsDownRef.current) return null;
        try {
          const result = await synthesizeMairaSpeech({ text });
          serverTtsFailsRef.current = 0;
          return result;
        } catch (e: any) {
          geminiErr = e;
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
          return null;
        }
      };
      let result: { audioBase64: string; mimeType: string } | null = null;
      let spokeViaGemini = false;
      if (selection === 'Salman') {
        result = await attemptClientEdge();
        if (!result) result = await attemptEdge();
        if (!result) {
          result = await attemptGemini();
          spokeViaGemini = !!result;
        }
      } else {
        result = await attemptGemini();
        if (!result) result = await attemptClientEdge();
        if (!result) result = await attemptEdge();
      }
      // Gemini bookkeeping: a quota/auth answer is DEFINITIVE — mute the
      // Gemini leg for the rest of the session even if Edge rescued this
      // reply, so later replies don't burn slow attempts re-asking dead
      // keys. (The female Google voice is NEVER a fallback — user demand.)
      if (geminiErr) {
        const et = geminiErr?.data?.errorType;
        if (et === 'quota' || et === 'auth') {
          serverTtsDownRef.current = true;
        }
      }
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
      setError(reasonMsg);
      // Count the failure toward the Gemini leg's 3-strikes mute (soft
      // failures only — quota/auth already muted it above) and return
      // null (browser TTS with male settings will be tried by the caller).
      // Judged on GEMINI's own error type, not the surfaced one.
      const geminiErrorType = geminiErr?.data?.errorType;
      if (geminiErr && geminiErrorType !== 'quota' && geminiErrorType !== 'auth') {
        serverTtsFailsRef.current += 1;
        if (serverTtsFailsRef.current >= 3) {
          serverTtsDownRef.current = true; // stop wasting time on dead TTS
        }
      }
      return null;
    };
    // No outer race: each leg carries its own timeout budget, and a
    // single 12s cap would kill the fallback legs before they start.
    return tryBoth();
  }

  async function playAssistantMessage(text: string) {
    setError('');
    if (!appSettings.voiceEnabled) {
      setIsPreparingVoice(false);
      return;
    }
    // Guard against double-speak: skip if the exact same text was already
    // spoken within the last few seconds (e.g. mic echo or double trigger).
    const now = Date.now();
    const last = lastSpokenRef.current;
    if (last && last.text === text && now - last.at < 8000) {
      return;
    }
    lastSpokenRef.current = { text, at: now };
    playbackBlockedRef.current = false;
    playbackStartedRef.current = false;
    // Check for eager prefetch BEFORE stopping — don't kill our own eager audio
    // that started playing during streaming (only if it matches this reply).
    const prefetch = ttsPrefetchRef.current;
    ttsPrefetchRef.current = null; // consume once
    const prefetchMatches = !!(prefetch && text.startsWith(prefetch.text) && prefetch.text.length >= 20);
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
    // Primary: server-side masculine Urdu voice (Gemini TTS) — same voice on every device.
    // Show "preparing" while the audio is fetched; isSpeaking flips on only
    // when playback actually begins (audio.onplaying below).
    if (!hasEagerAudio) {
      setIsPreparingVoice(true);
    }
    try {
      // Fast path: use prefetched first-sentence audio if it matches this reply.
      if (prefetchMatches && prefetch) {
        const pf = prefetch; // non-null here (prefetchMatches implies it)
        // Speak the FULL rest — chunk into sentence groups, no 600-char cutoff.
        const restFull = text.slice(pf.text.length).trim();
        const restSentences = restFull.match(/[^۔.!?\n]+[۔.!?\n]*/g) || (restFull ? [restFull] : []);
        const restChunks: string[] = [];
        let rc = '';
        for (const s of restSentences) {
          if ((rc + s).length > 700 && rc) {
            restChunks.push(rc.trim());
            rc = s;
          } else {
            rc += s;
          }
        }
        if (rc.trim()) restChunks.push(rc.trim());
        // Start synthesizing all rest chunks immediately (in background).
        const restPromises = restChunks.map((c) => synthesizeWithTimeout(c));
        if (hasEagerAudio && pf.playPromise) {
          // First chunk already playing via eager playback — wait for it to finish.
          await pf.playPromise.catch(() => {});
        } else {
          // Eager didn't trigger (audio wasn't ready in time) — play first chunk now.
          const first = await pf.promise.catch(() => null);
          if (first) {
            await playAudioChunk(first.audioBase64, first.mimeType);
          }
        }
        const restResults = await Promise.all(restPromises.map((p) => p.catch(() => null)));
        let restSpokeAny = false;
        for (const r of restResults) {
          if (r) {
            restSpokeAny = true;
            await playAudioChunk(r.audioBase64, r.mimeType);
          }
        }
        if (!restSpokeAny && restChunks.length > 0 && !hasEagerAudio) {
          speakWithBrowser(text);
        } else if (isMobileTurnMode() && playbackBlockedRef.current && !playbackStartedRef.current) {
          // The phone blocked audio playback (autoplay policy) even though
          // synthesis succeeded — fall back to the browser voice so the
          // reply is still heard instead of going silent.
          speakWithBrowser(text);
        }
        resumeContinuousAfterTts();
        return;
      }
      // Fallback: synthesize the FULL reply in chunks (no more 800-char cutoff).
      // Split into sentence groups of ~700 chars so long replies are fully spoken.
      const chunks: string[] = [];
      const sentences = text.match(/[^۔.!?\n]+[۔.!?\n]*/g) || [text];
      let current = '';
      for (const s of sentences) {
        if ((current + s).length > 700 && current) {
          chunks.push(current.trim());
          current = s;
        } else {
          current += s;
        }
      }
      if (current.trim()) chunks.push(current.trim());
      let spokeAny = false;
      for (const chunk of chunks) {
        const out = await synthesizeWithTimeout(chunk);
        if (out) {
          spokeAny = true;
          await playAudioChunk(out.audioBase64, out.mimeType);
        } else {
          break; // TTS failed — don't play partial garbage
        }
      }
      if (!spokeAny) {
        speakWithBrowser(text);
      } else if (isMobileTurnMode() && playbackBlockedRef.current && !playbackStartedRef.current) {
        // Same autoplay-block fallback as the prefetch path above.
        speakWithBrowser(text);
      }
      resumeContinuousAfterTts();
      return;
    } catch {
      // Server voice unavailable — fall back to the browser voice.
      setIsPreparingVoice(false);
    }
    speakWithBrowser(text);
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
  });

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

  // Image attach for vision: read as base64 data URL.
  function handleImagePick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
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
          sessionGotFinal = true;
          phoneEmptyEndsRef.current = 0;
          setVoiceStatus('سن رہا ہوں…');
          schedulePhoneTurnSend();
        }
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
          // PHONE flap guard: Android ends silent single-shot sessions
          // every few seconds, and restarting instantly makes the mic
          // blink on/off forever without ever settling (the user's
          // complaint). While sessions keep ending EMPTY, back the
          // restart off (up to 3s); real speech resets it to instant.
          // Desktop keeps its original 400ms restart, untouched.
          let restartDelay = 400;
          if (mobileTurn) {
            if (!sessionGotFinal && !continuousTextRef.current.trim()) {
              phoneEmptyEndsRef.current += 1;
            }
            restartDelay = Math.min(400 + phoneEmptyEndsRef.current * 800, 3000);
          }
          scheduleLiveMicReopen(restartDelay);
        }
      };

      continuousRecognitionRef.current = recognition;
      clearLiveReopenTimer(); // this start consumes any pending reopen
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
    if (continuousIntendedRef.current) setVoiceStatus('جواب سن رہے ہیں…');
  }

  function resumeContinuousAfterTts() {
    // The reply's speech span is over — close it FIRST so the reopen
    // below (and any recovery-effect reopen) is allowed through.
    ttsActiveRef.current = false;
    if (!continuousIntendedRef.current) return;
    setVoiceStatus('سن رہا ہوں…');
    // Small delay so the mic doesn't catch the tail of the TTS audio —
    // via the single scheduler, so this stays the one pending reopen.
    scheduleLiveMicReopen(600);
  }

  function stopContinuousListening() {
    continuousIntendedRef.current = false;
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
    stopSpeaking();
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

    setError('');
    // Stop any playing reply before listening — otherwise the mic can pick
    // up the speaker and the two voices overlap.
    stopSpeaking();

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
          ? 'مائیکروفون کی اجازت دیں، پھر دوبارہ کوشش کریں۔'
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
              onClick={() => { setActiveId(conversation.id); setShowHistory(false); }}
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
        <div className="jarvis-lang-chips" role="group" aria-label="زبان منتخب کریں">
          {[
            { v: 'auto', t: '🌐 Auto' },
            { v: 'ur', t: 'اردو' },
            { v: 'roman', t: 'Roman' },
            { v: 'en', t: 'English' },
            { v: 'ar', t: 'العربية' },
          ].map((l) => (
            <button
              key={l.v}
              type="button"
              className={`lang-chip${chatLang === l.v ? ' active' : ''}`}
              onClick={() => {
                setChatLang(l.v);
                try { localStorage.setItem('unique-ai-chat-lang', l.v); } catch { /* ignore */ }
              }}
              data-testid={`button-lang-${l.v}`}
            >
              {l.t}
            </button>
          ))}
        </div>
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
            className={`rail-btn${gesturesEnabled ? ' active' : ''}`}
            onClick={(e) => { hideTipOnClick(e); setGesturesEnabled((v) => !v); }}
            onMouseLeave={restoreTipOnLeave}
            aria-label={gesturesEnabled ? 'ہاتھ کے اشارے بند کریں' : 'ہاتھ کے اشارے چالو کریں'}
            aria-pressed={gesturesEnabled}
            data-tip="ہاتھ کے اشارے"
            data-testid="button-gesture-toggle"
          >
            <Hand size={18} />
          </button>
          <button
            className="rail-btn"
            onClick={(e) => { hideTipOnClick(e); setToolsPanelOpen((v) => !v); }}
            onMouseLeave={restoreTipOnLeave}
            aria-label="ٹولز کھولیں"
            data-tip="ٹولز 🧰"
            data-testid="button-open-tools"
          >
            <Wrench size={18} />
          </button>
          <button
            className={`rail-btn${focusView === 'map' ? ' active' : ''}`}
            onClick={(e) => { hideTipOnClick(e); setFocusView((v) => (v === 'map' ? null : 'map')); }}
            onMouseLeave={restoreTipOnLeave}
            aria-label="نقشہ کھولیں"
            data-tip="نقشہ 🗺️"
            data-testid="button-open-map"
          >
            <MapIcon size={18} />
          </button>
          <button
            className={`rail-btn${focusView === 'whatsapp' ? ' active' : ''}`}
            onClick={(e) => { hideTipOnClick(e); setFocusView((v) => (v === 'whatsapp' ? null : 'whatsapp')); }}
            onMouseLeave={restoreTipOnLeave}
            aria-label="WhatsApp کھولیں"
            data-tip="WhatsApp 💬"
            data-testid="button-open-whatsapp"
          >
            <MessageCircle size={18} />
          </button>
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
          <div className="hero-orb-wrap">
            <AiOrb isSpeaking={isSpeaking} isThinking={busy || isPreparingVoice} size={180} />
          </div>
          <div className="hero-name">
            <span className="hero-name-text">Unique AI</span>
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
              onClick={() => void toggleRecording()}
              disabled={busy}
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
          onClearChat={() => {
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
      </div>

      {/* ======= FOCUS VIEW: one thing at a time fills the whole screen ======= */}
      {focusView && (
        <div className="focus-view" dir="rtl" role="region" aria-label="فوکس منظر" data-testid="panel-focus">
          <div className="focus-view-head">
            <span className="focus-view-title">
              {focusView === 'map' ? '🗺️ نقشہ' : focusView === 'whatsapp' ? '💬 WhatsApp' : focusView === 'quran' ? '📖 قرآن پاک' : '🧰 ٹولز'}
            </span>
            <button type="button" className="focus-view-close" onClick={() => setFocusView(null)} aria-label="واپس جائیں" data-testid="button-focus-back">
              ✕ واپس
            </button>
          </div>
          <div className="focus-view-body">
            {focusView === 'map' && <MapWidget />}
            {focusView === 'whatsapp' && <WhatsAppSender />}
            {focusView === 'quran' && <QuranReader autoplaySignal={quranAutoplay} />}
            {focusView === 'tools' && (
              <ToolsPanel
                onSelect={(tool) => { setFocusView(null); setMediaTool(tool); }}
                onBrainTool={(example) => { setFocusView(null); setDraft(example); textareaRef.current?.focus(); }}
              />
            )}
          </div>
        </div>
      )}

      {/* ======= Overlays: builders, tools, gestures, history ======= */}
      {projectBuild && (
        <ProjectBuilder description={projectBuild.description} onClose={() => setProjectBuild(null)} />
      )}
      {appBuild && (
        <AppBuilder description={appBuild.description} onClose={() => setAppBuild(null)} />
      )}
      {toolAction && (
        <ToolResults
          action={toolAction}
          onClose={() => setToolAction(null)}
          onTimerDone={() => {
            void playAssistantMessage('ٹائمر ختم ہو گیا!');
          }}
        />
      )}
      {mediaTool && mediaTool !== 'video_creator' && (
        <MediaTools tool={mediaTool} onClose={() => { setMediaTool(null); setToolPrefill(null); }} initialPhone={toolPrefill?.phone} />
      )}
      {mediaTool === 'video_creator' && (
        <VideoCreator onClose={() => setMediaTool(null)} />
      )}
      {toolsPanelOpen && (
        <div className="tool-results" dir="rtl" data-testid="panel-tools" role="region" aria-label="ٹولز">
          <div className="tool-results-head">
            <span className="tool-results-title">🧰 ٹولز</span>
            <button type="button" className="tool-results-close" onClick={() => setToolsPanelOpen(false)} aria-label="بند کریں">
              ✕
            </button>
          </div>
          <div className="tool-results-body">
            <ToolsPanel
              onSelect={(tool) => { setToolsPanelOpen(false); setMediaTool(tool); }}
              onBrainTool={(example) => { setToolsPanelOpen(false); setDraft(example); textareaRef.current?.focus(); }}
            />
          </div>
        </div>
      )}

      {gesturesEnabled && (
        <div className="gesture-pip" dir="rtl" data-testid="panel-gestures" aria-label="ہاتھ کے اشارے">
          <div className="gesture-pip-head">
            <span className="gesture-pip-title">اشارے</span>
            <button className="gesture-pip-close" onClick={() => setGesturesEnabled(false)} aria-label="اشارے بند کریں" data-testid="button-close-gestures">
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
