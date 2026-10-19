import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import {
  AudioLines,
  Clock3,
  Hand,
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
  useSendMairaChatMessage,
} from '@/lib/api';
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
  const streamedTextRef = useRef('');
  // Attached image (base64 data URL) for vision — sent with the next message.
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const serverAudioRef = useRef<HTMLAudioElement | null>(null);
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [activeConversation?.messages.length, busy]);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    recognitionRef.current?.stop();
    // Continuous voice mode cleanup.
    continuousIntendedRef.current = false;
    if (silenceTimerRef.current !== null) window.clearTimeout(silenceTimerRef.current);
    try { continuousRecognitionRef.current?.stop(); } catch { /* already stopped */ }
  }, []);

  // Keep the ref in sync so recognition callbacks always see the live value.
  useEffect(() => {
    continuousVoiceRef.current = continuousVoice;
  }, [continuousVoice]);

  // Sync app settings to individual states + persist to localStorage.
  useEffect(() => {
    try { localStorage.setItem('unique-ai-settings', JSON.stringify(appSettings)); } catch {}
    setGesturesEnabled(appSettings.gesturesEnabled);
    setContinuousVoice(appSettings.continuousVoice);
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
    if ((!text && !attachedImage) || chatMutation.isPending) return;
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
        try {
          window.open(result.action.url, '_blank', 'noopener,noreferrer');
        } catch {
          // Popup blocked — the URL is still visible in the reply text.
        }
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
      updateConversation(id, (item) => ({
        ...item,
        messages: item.messages.filter((m) => m.id !== assistantId),
      }));
      setError(getErrorMessage(sendError));
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
      confirmation = command.isSearchFallback
        ? `جی، ${command.displayName} گوگل پر تلاش کر کے کھول رہا ہوں۔`
        : `جی، ${command.displayName} کھول رہا ہوں۔`;
    }

    let opened = false;
    try {
      opened = window.open(command.url, '_blank', 'noopener,noreferrer') !== null;
    } catch {
      opened = false;
    }
    const assistantText = opened
      ? confirmation
      : `میں نے ${command.displayName} کھولنے کی کوشش کی، لیکن براؤزر نے نیا ٹیب روک دیا ہے۔ براہِ کرم اس سائٹ کے لیے پاپ اپ کی اجازت دیں، یا یہ لنک خود کھول لیں: ${command.url}`;
    appendWebsiteCommandExchange(recognizedText, assistantText);
    playAssistantMessage(assistantText);
    return true;
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
    const urduVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith('ur'));
    const maleUrdu = urduVoices.find((voice) => {
      const name = voice.name.toLowerCase();
      return name.includes('male') || name.includes('asad');
    });
    if (maleUrdu) return maleUrdu;
    const anyUrdu = urduVoices.find((voice) => {
      const name = voice.name.toLowerCase();
      return !name.includes('female') && !name.includes('uzma') && !name.includes('woman');
    }) ?? urduVoices[0];
    if (anyUrdu) return anyUrdu;
    // Fallback: Hindi voices are very commonly installed on Pakistani devices
    // and Hindi/Urdu are mutually intelligible when spoken.
    const hindi = voices.filter((voice) => voice.lang.toLowerCase().startsWith('hi'));
    if (hindi[0]) return hindi[0];
    return voices.find((v) => v.default) ?? voices[0];
  }

  async function speakNow(text: string) {
    if (!appSettings.voiceEnabled) return;
    if (!('speechSynthesis' in window)) {
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
      setError('اس براؤزر میں آواز کی سہولت دستیاب نہیں۔');
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
        const audio = new Audio(url);
        // Google TTS fallback has a female voice — make it JARVIS-like:
        // fast and confident pace, slightly deepened pitch.
        // Gemini Charon (audio/wav) keeps its natural masculine voice.
        const isGoogleTts = (mimeType || '').includes('mpeg');
        if (isGoogleTts) {
          audio.playbackRate = 1.08;
          (audio as any).preservesPitch = false;
        } else {
          audio.playbackRate = 1.3;
        }
        serverAudioRef.current = audio;
        audio.onplaying = () => {
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
        audio.play().catch(done);
      } catch {
        resolve();
      }
    });
  }

  // Wrapper: synthesize with a timeout so a hung TTS request can't lock the UI.
  // Fallback chain: Gemini TTS → Google TTS (free, no key) → browser voice.
  // If user selected "Google" voice in settings, skips Gemini and goes
  // straight to Google TTS. Tracks server TTS health: after 3 consecutive
  // failures of BOTH server options, marks server TTS as down for the
  // session (browser voice used).
  // Returns null on timeout or failure (caller falls back to browser voice).
  function synthesizeWithTimeout(text: string, timeoutMs = 20000): Promise<{ audioBase64: string; mimeType: string } | null> {
    if (serverTtsDownRef.current) {
      return Promise.resolve(null);
    }
    const preferGoogle = (() => {
      try { return localStorage.getItem('unique-ai-voice') === 'Google'; }
      catch { return false; }
    })();
    const tryBoth = async (): Promise<{ audioBase64: string; mimeType: string } | null> => {
      // User prefers Google voice — skip Gemini entirely.
      if (preferGoogle) {
        try {
          const result = await synthesizeGoogleSpeech({ text });
          serverTtsFailsRef.current = 0;
          return result;
        } catch {
          serverTtsFailsRef.current += 1;
          if (serverTtsFailsRef.current >= 3) {
            serverTtsDownRef.current = true;
          }
          return null;
        }
      }
      try {
        const result = await synthesizeMairaSpeech({ text });
        serverTtsFailsRef.current = 0;
        return result;
      } catch (geminiErr: any) {
        // Gemini failed — explain WHY the male voice stopped instead of
        // silently switching to the female backup voice.
        const errorType = geminiErr?.data?.errorType || 'unknown';
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
        // Male voice selected (Charon/Fenrir): NEVER fall back to the female
        // Google voice — user explicitly demanded male voice only.
        // Count the failure and return null (browser TTS with male settings
        // will be tried by the caller).
        serverTtsFailsRef.current += 1;
        if (serverTtsFailsRef.current >= 3) {
          serverTtsDownRef.current = true; // stop wasting time on dead TTS
        }
        return null;
      }
    };
    return Promise.race([
      tryBoth(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
  }

  async function playAssistantMessage(text: string) {
    setError('');
    if (!appSettings.voiceEnabled) return;
    // Guard against double-speak: skip if the exact same text was already
    // spoken within the last few seconds (e.g. mic echo or double trigger).
    const now = Date.now();
    const last = lastSpokenRef.current;
    if (last && last.text === text && now - last.at < 8000) {
      return;
    }
    lastSpokenRef.current = { text, at: now };
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
        const restText = text.slice(pf.text.length).trim().slice(0, 600);
        // Start synthesizing the rest immediately (in background).
        const restPromise = restText
          ? synthesizeWithTimeout(restText)
          : Promise.resolve(null);
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
        const rest = await restPromise;
        if (rest) {
          await playAudioChunk(rest.audioBase64, rest.mimeType);
        } else if (!hasEagerAudio) {
          speakWithBrowser(text);
        }
        resumeContinuousAfterTts();
        return;
      }
      // Fallback: synthesize a trimmed reply (shorter = faster).
      const out = await synthesizeWithTimeout(text.slice(0, 800));
      if (out) {
        await playAudioChunk(out.audioBase64, out.mimeType);
      } else {
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
  // Continuous voice mode (hands-free conversation).
  // Listen continuously -> auto-send after ~2s silence -> reply auto-speaks.
  // Recognition pauses while the assistant's voice plays (no echo) and
  // resumes automatically afterwards.
  // ------------------------------------------------------------------
  const busyRef = useRef(false);
  useEffect(() => {
    busyRef.current = chatMutation.isPending;
  }, [chatMutation.isPending]);

  function clearSilenceTimer() {
    if (silenceTimerRef.current !== null) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
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

  const isSpeakingRef = useRef(false);
  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  function startContinuousListening() {
    if (!continuousIntendedRef.current) return;
    // Don't listen while a reply is playing or a message is in flight.
    if (isSpeakingRef.current || busyRef.current) return;
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
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = (event) => {
        if (!continuousIntendedRef.current) return;
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
      };

      recognition.onerror = (event) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          continuousIntendedRef.current = false;
          setContinuousVoice(false);
          setVoiceStatus('');
          setError('مائیکروفون کی اجازت دیں، پھر مسلسل آواز دوبارہ چالو کریں۔');
        }
        // Other errors: onend will trigger a restart if still intended.
      };

      recognition.onend = () => {
        continuousRecognitionRef.current = null;
        clearSilenceTimer();
        // Chrome auto-stops recognition; restart if the user still wants it.
        if (continuousIntendedRef.current && !isSpeakingRef.current && !busyRef.current) {
          window.setTimeout(() => {
            if (continuousIntendedRef.current) startContinuousListening();
          }, 350);
        }
      };

      continuousRecognitionRef.current = recognition;
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
    const rec = continuousRecognitionRef.current;
    continuousRecognitionRef.current = null;
    if (rec) {
      try { rec.stop(); } catch { /* already stopped */ }
    }
    if (continuousIntendedRef.current) setVoiceStatus('جواب سن رہے ہیں…');
  }

  function resumeContinuousAfterTts() {
    if (!continuousIntendedRef.current) return;
    setVoiceStatus('سن رہا ہوں…');
    // Small delay so the mic doesn't catch the tail of the TTS audio.
    window.setTimeout(() => {
      if (continuousIntendedRef.current) startContinuousListening();
    }, 600);
  }

  function stopContinuousListening() {
    continuousIntendedRef.current = false;
    clearSilenceTimer();
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
      return;
    }
    setError('');
    // The one-shot mic and continuous mode must not run together.
    if (recording) toggleRecording();
    stopSpeaking();
    continuousIntendedRef.current = true;
    setContinuousVoice(true);
    startContinuousListening();
  }

  function toggleRecording() {
    if (recording) {
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
          <button className="rail-btn" onClick={(e) => { hideTipOnClick(e); setShowHistory(true); }} onMouseLeave={restoreTipOnLeave} aria-label="گفتگوؤں کی فہرست" data-tip="گفتگوؤں کی فہرست" data-testid="button-mobile-history">
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
            // sound comes out of their speakers.
            void speakNow('السلام علیکم! یہ آواز کا ٹیسٹ ہے۔ کیا آپ مجھے سن سکتے ہیں؟');
          }}
        />
      </div>

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
