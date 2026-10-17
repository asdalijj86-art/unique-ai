import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import {
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
  useSendMairaChatMessage,
} from '@/lib/api';
import { parseWebsiteCommand } from '@/lib/voice-commands';

type ChatRole = 'user' | 'assistant';
type ChatMessage = { id: string; role: ChatRole; content: string; createdAt: string };
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
  const chatMutation = useSendMairaChatMessage();
  const timerRef = useRef<number | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const recognizedTextRef = useRef('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const serverAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastSpokenRef = useRef<{ text: string; at: number } | null>(null);
  const activeConversation = conversations.find((conversation) => conversation.id === activeId);
  const busy = chatMutation.isPending;

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [conversations]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [activeConversation?.messages.length, busy]);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    recognitionRef.current?.stop();
  }, []);

  function startNewChat() {
    const conversation: Conversation = {
      id: createId(),
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
    if (!text || chatMutation.isPending) return;
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
    const userMessage: ChatMessage = { id: createId(), role: 'user', content: text, createdAt: new Date().toISOString() };
    const previousMessages = conversation.messages;
    const sentMessages = [...previousMessages, userMessage];
    updateConversation(id, (item) => ({
      ...item,
      title: item.messages.length === 0 ? (text.length > 42 ? `${text.slice(0, 42).trim()}…` : text) : item.title,
      updatedAt: userMessage.createdAt,
      messages: sentMessages,
    }));
    setDraft('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    try {
      const result = await chatMutation.mutateAsync({
        data: { messages: sentMessages.slice(-30).map(({ role, content }) => ({ role, content })) },
      });
      const assistantMessage: ChatMessage = {
        id: createId(),
        role: 'assistant',
        content: result.text,
        createdAt: new Date().toISOString(),
      };
      updateConversation(id, (item) => ({
        ...item,
        updatedAt: assistantMessage.createdAt,
        messages: [...item.messages, assistantMessage],
      }));
      // The boy speaks EVERY reply aloud automatically — no mic or button needed.
      void playAssistantMessage(result.text);
    } catch (sendError) {
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
      messages: [...item.messages, userMessage, assistantMessage],
    }));
  }

  function handleVoiceWebsiteCommand(recognizedText: string): boolean {
    const command = parseWebsiteCommand(recognizedText);
    if (!command) return false;
    const confirmation = command.isSearchFallback
      ? `جی، ${command.displayName} گوگل پر تلاش کر کے کھول رہا ہوں۔`
      : `جی، ${command.displayName} کھول رہا ہوں۔`;
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
    return urduVoices.find((voice) => {
      const name = voice.name.toLowerCase();
      return name.includes('male') || name.includes('asad');
    }) ?? urduVoices.find((voice) => {
      const name = voice.name.toLowerCase();
      return !name.includes('female') && !name.includes('uzma') && !name.includes('woman');
    }) ?? urduVoices[0];
  }

  function speakNow(text: string) {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    const utterance = new SpeechSynthesisUtterance(text.slice(0, 4000));
    utterance.lang = 'ur-PK';
    utterance.rate = 0.95;
    const maleVoice = pickUrduMaleVoice();
    if (maleVoice) {
      utterance.voice = maleVoice;
    }
    // If no Urdu voice is installed, Chrome still attempts with its default
    // voice instead of staying silent; onerror reports the failure plainly.
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => {
      setIsSpeaking(false);
      const n = window.speechSynthesis.getVoices().length;
      setError(`آواز نہیں چل سکی (آوازیں: ${n})۔ آپ جواب پڑھ سکتے ہیں۔`);
    };
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
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

  async function playAssistantMessage(text: string) {
    setError('');
    // Guard against double-speak: skip if the exact same text was already
    // spoken within the last few seconds (e.g. mic echo or double trigger).
    const now = Date.now();
    const last = lastSpokenRef.current;
    if (last && last.text === text && now - last.at < 8000) {
      return;
    }
    lastSpokenRef.current = { text, at: now };
    stopSpeaking();
    // Primary: server-side masculine Urdu voice (Gemini TTS) — same voice on every device.
    try {
      const out = await synthesizeMairaSpeech({ text: text.slice(0, 4000) });
      const bytes = Uint8Array.from(atob(out.audioBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: out.mimeType || 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      serverAudioRef.current = audio;
      setIsSpeaking(true);
      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(url);
        if (serverAudioRef.current === audio) serverAudioRef.current = null;
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        if (serverAudioRef.current === audio) serverAudioRef.current = null;
        speakWithBrowser(text);
      };
      await audio.play();
      return;
    } catch {
      // Server voice unavailable — fall back to the browser voice.
    }
    speakWithBrowser(text);
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

  function renderHistory(className = '') {
    return (
      <div className={`conversation-list ${className}`} data-testid="list-conversations">
        {conversations.length === 0 ? (
          <div className="history-empty" dir="rtl" data-testid="text-history-empty">آپ کی گفتگوئیں یہاں نظر آئیں گی۔</div>
        ) : conversations.map((conversation) => (
          <div key={conversation.id} className={`conversation-row ${activeId === conversation.id ? 'active' : ''}`} data-testid={`row-conversation-${conversation.id}`}>
            <button
              className="conversation-select"
              dir="auto"
              onClick={() => { setActiveId(conversation.id); setShowHistory(false); }}
              data-testid={`button-open-conversation-${conversation.id}`}
              title={conversation.title}
            >
              {conversation.title}
            </button>
            <button
              className="delete-conversation"
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

  return (
    <main className="maira-shell" lang="ur" dir="ltr" data-testid="page-maira-chat">
      <aside className="sidebar" aria-label="گفتگوؤں کی فہرست">
        <div className="brand-row" data-testid="brand-maira">
          <div className={`sidebar-avatar unique-avatar${busy ? ' is-thinking' : ''}${isSpeaking ? ' is-speaking' : ''}`} aria-label="Unique AI">
            <img className="sidebar-avatar-face" src="/avatars/boy-avatar.webp" alt="" />
          </div>
          <div><div className="brand-title">Unique AI</div><div className="brand-subtitle" dir="rtl">آپ کی ذاتی معاون</div></div>
        </div>
        <button className="new-chat" onClick={startNewChat} data-testid="button-new-chat">
          <Plus size={16} /> <span dir="rtl">نئی گفتگو</span>
        </button>
        <div className="history-label" dir="rtl">حالیہ گفتگوئیں</div>
        {renderHistory()}
        <button
          className="icon-button"
          onClick={clearHistory}
          disabled={!conversations.length}
          data-testid="button-clear-history"
          style={{ width: '100%', display: 'flex', justifyContent: 'flex-start', gap: 9, padding: '0 10px', color: conversations.length ? '#898598' : '#565363', fontSize: 11 }}
        >
          <Trash2 size={14} /> <span dir="rtl">تمام گفتگوئیں حذف کریں</span>
        </button>
        <div className="local-note" data-testid="text-local-history-note">
          <Shield size={14} />
          <span dir="rtl">آپ کی گفتگو صرف اسی آلے کے browser میں محفوظ ہے۔ یہ کسی account سے منسلک نہیں۔</span>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="topbar-brand">
            <div className={`topbar-avatar unique-avatar${busy ? ' is-thinking' : ''}${isSpeaking ? ' is-speaking' : ''}`} aria-label="Unique AI">
              <img className="topbar-avatar-face" src="/avatars/boy-avatar.webp" alt="" />
            </div><div className="brand-title">Unique AI</div>
          </div>
          <div className="assistant-status" data-testid="status-assistant">
            <span className="status-dot" /> <span dir="rtl">میں آپ کے ساتھ ہوں</span>
          </div>
          <div className="top-actions">
            <button className="icon-button mobile-new" onClick={() => setShowHistory(true)} aria-label="گفتگوؤں کی فہرست کھولیں" data-testid="button-mobile-history">
              <Clock3 size={17} />
            </button>
            <button className="icon-button mobile-new" onClick={startNewChat} aria-label="نئی گفتگو شروع کریں" data-testid="button-mobile-new-chat">
              <Plus size={19} />
            </button>
          </div>
        </header>

        <div className="chat-scroll">
          <div className="chat-inner">
            {error && (
              <div className="error-banner" role="alert" data-testid="status-chat-error">
                <span dir="auto">{error}</span><button onClick={() => setError('')} data-testid="button-dismiss-error">بند کریں</button>
              </div>
            )}
            {storageError && (
              <div className="error-banner" role="status" data-testid="status-storage-error">
                <span dir="rtl">Browser storage دستیاب نہیں، اس لیے جانے کے بعد یہ گفتگو محفوظ نہ رہ سکے گی۔</span>
                <button onClick={() => setStorageError(false)} data-testid="button-dismiss-storage-warning">بند کریں</button>
              </div>
            )}
            {!activeConversation || activeConversation.messages.length === 0 ? (
              <div className="welcome" data-testid="section-welcome">
                <div className={`welcome-orb unique-avatar${busy ? ' is-thinking' : ''}${isSpeaking ? ' is-speaking' : ''}`} aria-label="Unique AI مرد اوتار">
                  <span className="unique-avatar-halo" />
                  <img className="unique-avatar-face" src="/avatars/boy-avatar.webp" alt="" />
                </div>
                <div className="eyebrow" dir="rtl">جب چاہیں، تھوڑی سی مدد</div>
                <h1 lang="ur" dir="rtl">السلام علیکم۔<br /><span>میں Unique AI ہوں۔</span></h1>
                <p className="welcome-copy" lang="ur" dir="rtl">یہاں آپ کسی بات پر غور کر سکتے ہیں، کچھ نیا سیکھ سکتے ہیں، یا اپنے لیے درست الفاظ ڈھونڈ سکتے ہیں۔ جہاں سے چاہیں بات شروع کریں۔</p>
                <p className="welcome-urdu" lang="ur" dir="rtl" data-testid="text-welcome-urdu">آپ اردو، رومن اردو یا انگریزی میں بات کر سکتے ہیں۔</p>
                <div className="prompt-label" dir="rtl">آپ یہ پوچھ سکتے ہیں…</div>
                <div className="suggestions">
                  {suggestions.map((suggestion, index) => (
                    <button key={suggestion} className="suggestion" dir="auto" onClick={() => void sendMessage(suggestion)} data-testid={`button-suggestion-${index}`}>
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="messages" data-testid="list-messages">
                {activeConversation.messages.map((message) => (
                  <article key={message.id} className={`message-row ${message.role}`} data-testid={`message-${message.role}-${message.id}`}>
                    {message.role === 'assistant' && <div className="message-avatar" aria-hidden="true">U</div>}
                    <div className="message-content">
                      <div className="message-bubble" dir="auto" data-testid={`text-message-content-${message.id}`}>{renderMessageContent(message.content)}</div>
                      {message.role === 'assistant' ? (
                        <div className="assistant-actions">
                          <button
                            className="speak-button"
                            onClick={() => void playAssistantMessage(message.content)}
                            disabled={false}
                            data-testid={`button-speak-${message.id}`}
                          >
                            <Volume2 size={13} />
                            سنیں
                          </button>
                        </div>
                      ) : <div className="message-meta" dir="rtl">آپ</div>}
                    </div>
                  </article>
                ))}
                {busy && (
                  <div className="message-row assistant" data-testid="status-thinking">
                    <div className="message-avatar" aria-hidden="true">U</div>
                    <div className="thinking" dir="rtl"><span>سوچ رہا ہوں</span><span className="thinking-dots"><i /><i /><i /></span></div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>

        <div className="composer-wrap">
          <div className="composer-inner">
            <div className="composer">
              <textarea
                ref={textareaRef}
                value={draft}
                dir="auto"
                onChange={(event) => {
                  setDraft(event.target.value);
                  event.currentTarget.style.height = 'auto';
                  event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 170)}px`;
                }}
                onKeyDown={onComposerKeyDown}
                placeholder="Unique AI سے اردو، رومن اردو یا انگریزی میں بات کریں…"
                aria-label="Unique AI کو پیغام لکھیں"
                rows={1}
                data-testid="input-message"
              />
              <div className="composer-tools">
                {recording ? (
                  <span className="recording-note" data-testid="status-recording">ریکارڈ ہو رہا ہے · {durationLabel}</span>
                ) : <span className="composer-hint" dir="rtl">بھیجنے کے لیے Enter · نئی سطر کے لیے Shift + Enter</span>}
                <div className="tool-actions">
                  <button
                    className={`mic-button ${recording ? 'recording' : ''}`}
                    onClick={() => void toggleRecording()}
                    disabled={busy}
                    aria-label={recording ? 'ریکارڈنگ روکیں' : 'آواز ریکارڈ کریں'}
                    data-testid="button-microphone"
                  >
                    {recording ? <MicOff size={16} /> : <Mic size={16} />}
                  </button>
                  {recording && (
                    <button className="icon-button" aria-label="ریکارڈنگ منسوخ کریں" onClick={() => {
                      recognizedTextRef.current = '';
                      recognitionRef.current?.stop();
                      setRecording(false);
                      if (timerRef.current !== null) window.clearInterval(timerRef.current);
                      timerRef.current = null;
                    }} data-testid="button-cancel-recording"><X size={16} /></button>
                  )}
                  <button
                    className="send-button"
                    onClick={() => void sendMessage(draft)}
                    disabled={!draft.trim() || busy}
                    aria-label="پیغام بھیجیں"
                    data-testid="button-send-message"
                  ><Send size={15} /></button>
                </div>
              </div>
            </div>
            <div className="composer-caption" data-testid="text-composer-caption">
              Unique AI سے غلطی ہو سکتی ہے۔ جو مددگار لگے، وہ لے لیں۔
            </div>
          </div>
        </div>
      </section>

      {showHistory && (
        <div className="mobile-history-backdrop" role="presentation" onClick={(event) => {
          if (event.target === event.currentTarget) setShowHistory(false);
        }} data-testid="dialog-mobile-history">
          <section className="mobile-history-panel" aria-label="گفتگوؤں کی فہرست">
            <div className="mobile-history-heading">
              <div><div className="brand-title" dir="rtl">آپ کی گفتگوئیں</div><div className="brand-subtitle" dir="rtl">اسی آلے پر محفوظ</div></div>
              <button className="icon-button" onClick={() => setShowHistory(false)} aria-label="فہرست بند کریں" data-testid="button-close-history"><X size={18} /></button>
            </div>
            <button className="new-chat" onClick={startNewChat} data-testid="button-mobile-dialog-new-chat"><Plus size={16} /> <span dir="rtl">نئی گفتگو</span></button>
            {renderHistory()}
            <button className="clear-mobile-history" onClick={clearHistory} disabled={!conversations.length} data-testid="button-mobile-clear-history">
              <Trash2 size={14} /> <span dir="rtl">تمام گفتگوئیں حذف کریں</span>
            </button>
            <p className="mobile-history-note" dir="rtl"><Shield size={13} /> صرف اسی browser میں محفوظ۔ account سے sync نہیں ہوتی۔</p>
          </section>
        </div>
      )}
    </main>
  );
}
