/**
 * DevicePairing — «📱 ڈیوائس جوڑیں» (Task 6b) + «📞 کال» (Phase 4).
 *
 * Links this device with the user's OTHER device running the same app:
 * one side shows a 6-digit code (+ QR of a link that pre-fills it), the
 * other types the code. While linked, either side can send the current
 * conversation over, or ask the other device to open Quran / the map.
 * HONEST SCOPE (also stated in the UI): this links the APP on both
 * devices while it is open — it is NOT remote control of the phone
 * itself.
 *
 * THE CALL (Phase 4): while linked, either side can «call» the other —
 * a TURN-BASED voice link inside the app, NOT a real phone call and
 * NOT WebRTC. The caller device is a remote mic+speaker for the
 * callee's Unique: this component owns the signalling state machine
 * (invite → ring ~30s → accept/reject/timeout → turns → end) over the
 * pairing relay's 'call' messages; the actual brain work and speech
 * live in chat.tsx, reached through the onCallUtterance / onCallReply /
 * callControlRef props. Speech is turn by turn (his standing mic
 * preference): the caller speaks, the words travel as text, the
 * callee's brain answers (tools/builder included), the reply text
 * comes back and the CALLER speaks it with its own persona voice
 * chain — while the callee also speaks it locally.
 *
 * The component stays MOUNTED while linked (rendering only a small
 * chip when the panel is closed) so incoming conversations/commands
 * — and incoming calls — keep arriving; polling stops the moment the
 * link ends.
 */
import { useEffect, useRef, useState } from 'react';
import { X, Link2, Unlink, Send, BookOpen, Map as MapIcon, Phone, PhoneOff } from 'lucide-react';
import { getDeviceIdentity, saveDeviceName, pairApi, formatCallDuration, type PairPeer, type CallPayload } from '@/lib/pairing-client';

export type RemoteCommand = { action: string; tool?: string };
export type ConversationHandover = { title: string; messages: { role: string; content: string }[] };

export type CallPhase = 'idle' | 'calling' | 'ringing' | 'active';
export type CallRole = 'caller' | 'callee';
export type CallUiState = { phase: CallPhase; role: CallRole | null; peerName: string };
/** What chat.tsx can do to the call: send one spoken turn (caller
 *  side) or hang up. Filled by this component while linked. */
export type CallControl = {
  sendUtterance: (text: string) => boolean;
  endCall: () => void;
};

type Phase = 'idle' | 'waiting' | 'linked';

const CALL_RING_TIMEOUT_MS = 30_000; // caller: no answer in ~30s → honest «جواب نہیں آیا»
const CALL_RING_DISMISS_MS = 35_000; // callee: an unanswered ring clears itself

export default function DevicePairing({
  open,
  onClose,
  onRequestOpen,
  initialJoinCode,
  getConversation,
  onReceiveConversation,
  onRemoteCommand,
  onCallUtterance,
  onCallReply,
  onCallStateChange,
  callControlRef,
}: {
  open: boolean;
  onClose: () => void;
  onRequestOpen: () => void;
  initialJoinCode?: string;
  getConversation: () => ConversationHandover | null;
  onReceiveConversation: (handover: ConversationHandover, fromName: string) => void;
  onRemoteCommand: (command: RemoteCommand, fromName: string) => void;
  /** Callee side: one spoken turn arrived — inject it into this
   *  device's conversation and resolve with the reply TEXT (which is
   *  then sent back so the caller can speak it too). */
  onCallUtterance?: (text: string, fromName: string) => Promise<string | null>;
  /** Caller side: the callee's reply text arrived — speak it here
   *  (the caller device's own persona voice chain does the talking). */
  onCallReply?: (text: string, fromName: string) => void;
  /** Mirrors the call state into chat.tsx (mic turns reroute into
   *  the call while it is active and this device is the caller). */
  onCallStateChange?: (state: CallUiState) => void;
  /** Filled with { sendUtterance, endCall } while linked. */
  callControlRef?: React.MutableRefObject<CallControl | null>;
}) {
  const identityRef = useRef(getDeviceIdentity());
  const [deviceName, setDeviceName] = useState(identityRef.current.name);
  const [phase, setPhase] = useState<Phase>('idle');
  const [myCode, setMyCode] = useState('');
  const [joinCode, setJoinCode] = useState(initialJoinCode || '');
  const [sessionId, setSessionId] = useState('');
  const [peer, setPeer] = useState<PairPeer | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const sessionRef = useRef(sessionId);
  sessionRef.current = sessionId;
  // Keep the latest callbacks without re-arming the poll loops.
  const callbacksRef = useRef({ onReceiveConversation, onRemoteCommand, onCallUtterance, onCallReply });
  callbacksRef.current = { onReceiveConversation, onRemoteCommand, onCallUtterance, onCallReply };

  // ---- Call state (Phase 4) ----
  const [callPhase, setCallPhase] = useState<CallPhase>('idle');
  const [callRole, setCallRole] = useState<CallRole | null>(null);
  const [callSeconds, setCallSeconds] = useState(0);
  const [callNote, setCallNote] = useState('');
  const callPhaseRef = useRef(callPhase);
  callPhaseRef.current = callPhase;
  const callRoleRef = useRef(callRole);
  callRoleRef.current = callRole;
  const ringTimerRef = useRef<number | null>(null);
  const ringCtxRef = useRef<AudioContext | null>(null);
  const callTimeoutRef = useRef<number | null>(null);
  const utteranceChainRef = useRef<Promise<void>>(Promise.resolve());

  function stopRing() {
    if (ringTimerRef.current !== null) {
      window.clearInterval(ringTimerRef.current);
      ringTimerRef.current = null;
    }
    if (ringCtxRef.current) {
      void ringCtxRef.current.close().catch(() => { /* already closed */ });
      ringCtxRef.current = null;
    }
  }

  // Ring tone: pure WebAudio (two soft beeps, repeating) — no asset.
  // If the browser keeps the context suspended (no recent tap on THIS
  // device), the ring stays silent but the overlay still shows; the
  // sound is a courtesy, never the only signal.
  function startRing() {
    stopRing();
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx: AudioContext = new Ctx();
      ringCtxRef.current = ctx;
      void ctx.resume().catch(() => { /* stays suspended — visual ring only */ });
      const beep = (at: number) => {
        try {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = 440;
          gain.gain.setValueAtTime(0.0001, ctx.currentTime + at);
          gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + at + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.32);
          osc.connect(gain).connect(ctx.destination);
          osc.start(ctx.currentTime + at);
          osc.stop(ctx.currentTime + at + 0.36);
        } catch { /* a failed beep must never break the ring state */ }
      };
      const ringOnce = () => { beep(0); beep(0.45); };
      ringOnce();
      ringTimerRef.current = window.setInterval(ringOnce, 2400);
    } catch { /* no audio available — visual ring only */ }
  }

  function clearCallTimers() {
    if (callTimeoutRef.current !== null) {
      window.clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }
    stopRing();
  }

  /** Back to idle from any call state; optionally tell the user why. */
  function resetCall(note?: string) {
    clearCallTimers();
    setCallPhase('idle');
    setCallRole(null);
    setCallSeconds(0);
    if (note) setCallNote(note);
  }

  async function sendCall(payload: CallPayload): Promise<boolean> {
    const sid = sessionRef.current;
    if (!sid) return false;
    try {
      await pairApi.send(sid, identityRef.current.deviceId, 'call', payload);
      return true;
    } catch {
      return false;
    }
  }

  // ---- call actions ----
  function startCall() {
    if (callPhaseRef.current !== 'idle' || phaseRef.current !== 'linked') return;
    setCallNote('');
    setCallRole('caller');
    setCallPhase('calling');
    void sendCall({ type: 'call_invite' });
    callTimeoutRef.current = window.setTimeout(() => {
      if (callPhaseRef.current === 'calling') {
        // Nobody answered: clear any late ring on the other side too,
        // then say so honestly — never leave a «رنگ ہو رہی ہے» lie up.
        void sendCall({ type: 'call_end' });
        resetCall('📞 جواب نہیں آیا — شاید دوسری ڈیوائس پر ایپ بند ہے، یا وہ ابھی مصروف ہے۔');
      }
    }, CALL_RING_TIMEOUT_MS);
  }

  function acceptCall() {
    if (callPhaseRef.current !== 'ringing') return;
    clearCallTimers();
    setCallSeconds(0);
    setCallPhase('active');
    void sendCall({ type: 'call_accept' });
  }

  function rejectCall() {
    if (callPhaseRef.current !== 'ringing') return;
    void sendCall({ type: 'call_reject', reason: 'declined' });
    resetCall('📞 کال رد کر دی گئی۔');
  }

  function endCall() {
    if (callPhaseRef.current === 'idle') return;
    void sendCall({ type: 'call_end' });
    resetCall('📞 کال ختم ہو گئی۔');
  }

  function sendUtterance(text: string): boolean {
    if (callPhaseRef.current !== 'active' || callRoleRef.current !== 'caller') return false;
    void sendCall({ type: 'call_utterance', text });
    return true;
  }

  // Incoming call messages (delivered by the poll loop below).
  async function handleCallMessage(payload: CallPayload, fromName: string) {
    const type = payload?.type;
    if (type === 'call_invite') {
      if (callPhaseRef.current !== 'idle') {
        void sendCall({ type: 'call_reject', reason: 'busy' });
        return;
      }
      setCallNote('');
      setCallRole('callee');
      setCallPhase('ringing');
      startRing();
      callTimeoutRef.current = window.setTimeout(() => {
        if (callPhaseRef.current === 'ringing') {
          void sendCall({ type: 'call_reject', reason: 'timeout' });
          resetCall('📞 کال آئی تھی مگر وقت پر جواب نہ دیا جا سکا — کال ختم ہو گئی۔');
        }
      }, CALL_RING_DISMISS_MS);
      return;
    }
    if (type === 'call_accept') {
      if (callPhaseRef.current === 'calling') {
        clearCallTimers();
        setCallSeconds(0);
        setCallPhase('active');
      }
      return;
    }
    if (type === 'call_reject') {
      if (callPhaseRef.current === 'calling') {
        resetCall(payload?.reason === 'busy' ? '📞 دوسری ڈیوائس ابھی مصروف ہے۔' : '📞 کال رد کر دی گئی۔');
      }
      return;
    }
    if (type === 'call_end') {
      if (callPhaseRef.current !== 'idle') resetCall('📞 کال ختم ہو گئی۔');
      return;
    }
    if (type === 'call_utterance') {
      if (callPhaseRef.current !== 'active' || callRoleRef.current !== 'callee') return;
      const handler = callbacksRef.current.onCallUtterance;
      if (!handler || typeof payload.text !== 'string' || !payload.text.trim()) return;
      const reply = await handler(payload.text, fromName);
      if (reply) void sendCall({ type: 'call_reply', text: reply });
      return;
    }
    if (type === 'call_reply') {
      if (callPhaseRef.current !== 'active' || callRoleRef.current !== 'caller') return;
      if (typeof payload.text === 'string' && payload.text.trim()) {
        callbacksRef.current.onCallReply?.(payload.text, fromName);
      }
    }
  }
  const handleCallMessageRef = useRef(handleCallMessage);
  handleCallMessageRef.current = handleCallMessage;

  // Call duration ticker.
  useEffect(() => {
    if (callPhase !== 'active') return;
    const timer = window.setInterval(() => setCallSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [callPhase]);

  // Mirror the call state up to chat.tsx + expose the call controls.
  useEffect(() => {
    onCallStateChange?.({ phase: callPhase, role: callRole, peerName: peer?.name || '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callPhase, callRole, peer?.name]);
  useEffect(() => {
    if (callControlRef) {
      callControlRef.current = { sendUtterance, endCall };
    }
    return () => {
      if (callControlRef) callControlRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const myDevice = () => ({ deviceId: identityRef.current.deviceId, name: deviceName.trim() || identityRef.current.name, type: identityRef.current.type });

  // ---- waiting for the other device to enter my code ----
  useEffect(() => {
    if (phase !== 'waiting' || !myCode) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const data = await pairApi.check(myCode, identityRef.current.deviceId);
        if (cancelled) return;
        if (data.linked && data.sessionId) {
          setSessionId(data.sessionId);
          setPeer(data.peer || null);
          setPhase('linked');
          setNotice('✅ دوسری ڈیوائس جُڑ گئی ہے۔');
          setError('');
        }
      } catch { /* transient — keep waiting */ }
    };
    const timer = window.setInterval(tick, 3000);
    void tick();
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [phase, myCode]);

  // ---- linked: poll for peer state + incoming messages ----
  useEffect(() => {
    if (phase !== 'linked' || !sessionId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const data = await pairApi.poll(sessionId, identityRef.current.deviceId);
        if (cancelled) return;
        if (data.closed) {
          setPhase('idle');
          setSessionId('');
          setPeer(null);
          resetCall();
          setNotice('رابطہ ختم ہو گیا ہے۔');
          return;
        }
        if (data.peer) setPeer(data.peer);
        for (const message of data.messages || []) {
          if (message.kind === 'conversation') {
            callbacksRef.current.onReceiveConversation(message.payload, message.from?.name || 'دوسری ڈیوائس');
          } else if (message.kind === 'command') {
            callbacksRef.current.onRemoteCommand(message.payload, message.from?.name || 'دوسری ڈیوائس');
          } else if (message.kind === 'call') {
            const fromName = message.from?.name || 'دوسری ڈیوائس';
            if (message.payload?.type === 'call_utterance') {
              // Serialize spoken turns: one utterance is answered
              // (brain work takes seconds) before the next is fed in.
              utteranceChainRef.current = utteranceChainRef.current
                .then(() => handleCallMessageRef.current(message.payload, fromName))
                .catch(() => { /* a failed turn never wedges the chain */ });
            } else {
              void handleCallMessageRef.current(message.payload, fromName);
            }
          }
        }
      } catch { /* transient network hiccup — next poll retries */ }
    };
    const timer = window.setInterval(tick, 4000);
    void tick();
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [phase, sessionId]);

  async function createCode() {
    setBusy(true);
    setError('');
    setNotice('');
    saveDeviceName(deviceName.trim());
    try {
      const data = await pairApi.create(myDevice());
      setMyCode(data.code);
      setPhase('waiting');
    } catch (e: any) {
      setError(e?.message || 'کوڈ نہیں بن سکا۔');
    } finally {
      setBusy(false);
    }
  }

  async function joinWithCode() {
    const code = joinCode.replace(/\D/g, '');
    if (code.length !== 6) {
      setError('چھ ہندسوں کا کوڈ لکھیں۔');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    saveDeviceName(deviceName.trim());
    try {
      const data = await pairApi.join(code, myDevice());
      setSessionId(data.sessionId);
      setPeer(data.peer || null);
      setPhase('linked');
      setNotice('✅ ڈیوائس جُڑ گئی ہے۔');
    } catch (e: any) {
      setError(e?.data?.message || e?.message || 'جوڑنے میں مسئلہ ہوا۔');
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (sessionRef.current) void pairApi.leave(sessionRef.current, identityRef.current.deviceId);
    resetCall();
    setPhase('idle');
    setSessionId('');
    setPeer(null);
    setMyCode('');
    setNotice('رابطہ ختم کر دیا گیا۔');
    setError('');
  }

  function cancelWaiting() {
    setPhase('idle');
    setMyCode('');
  }

  async function sendConversation() {
    const conversation = getConversation();
    if (!conversation || conversation.messages.length === 0) {
      setError('اس وقت کوئی گفتگو موجود نہیں — پہلے کچھ بات کریں، پھر بھیجیں۔');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await pairApi.send(sessionId, identityRef.current.deviceId, 'conversation', conversation);
      setNotice(result.peerOnline ? '💬 گفتگو دوسری ڈیوائس پر بھیج دی گئی۔' : '💬 گفتگو بھیج دی گئی — دوسری ڈیوائس ابھی بند لگ رہی ہے؛ وہ ایپ کھولے گی تو گفتگو وہاں پہنچ جائے گی۔');
    } catch (e: any) {
      setError(e?.data?.message || e?.message || 'گفتگو نہیں بھیجی جا سکی۔');
    } finally {
      setBusy(false);
    }
  }

  async function sendCommand(action: string) {
    setBusy(true);
    setError('');
    try {
      const result = await pairApi.send(sessionId, identityRef.current.deviceId, 'command', { action });
      setNotice(result.peerOnline ? '📨 حکم بھیج دیا گیا۔' : '📨 حکم بھیج دیا گیا — دوسری ڈیوائس ایپ کھولے گی تو عمل ہو گا۔');
    } catch (e: any) {
      setError(e?.data?.message || e?.message || 'حکم نہیں بھیجا جا سکا۔');
    } finally {
      setBusy(false);
    }
  }

  // ---- Call chrome: visible whether the panel is open or closed —
  // an incoming call must ring on screen even over the chat. ----
  const callChrome = (
    <>
      {callPhase === 'ringing' && (
        <div className="call-overlay" dir="rtl" data-testid="call-incoming" role="alertdialog" aria-label="آنے والی کال">
          <div className="call-overlay-card">
            <div className="call-overlay-icon">📞</div>
            <div className="call-overlay-title">{peer?.name || 'دوسری ڈیوائس'} کال کر رہا ہے</div>
            <div className="tool-small-note">ایپ کے اندر آواز کا رابطہ — بات باری باری ہوتی ہے۔ قبول کریں تو آپ کی آواز اسی ڈیوائس کے Unique تک جائے گی۔</div>
            <div className="call-overlay-actions">
              <button type="button" className="call-accept-btn" onClick={acceptCall} data-testid="button-call-accept">
                <Phone size={17} /> قبول کریں
              </button>
              <button type="button" className="call-reject-btn" onClick={rejectCall} data-testid="button-call-reject">
                <PhoneOff size={17} /> رد کریں
              </button>
            </div>
          </div>
        </div>
      )}
      {(callPhase === 'calling' || callPhase === 'active') && (
        <div className="call-banner" dir="rtl" data-testid="call-banner" role="status">
          <span className="call-banner-dot" aria-hidden="true" />
          <span className="call-banner-text">
            {callPhase === 'calling'
              ? `📞 رنگ ہو رہی ہے… — ${peer?.name || 'دوسری ڈیوائس'}`
              : `📞 کال جاری — ${peer?.name || 'دوسری ڈیوائس'} • ${formatCallDuration(callSeconds)}`}
          </span>
          {callPhase === 'active' && callRole === 'caller' && (
            <span className="call-banner-hint">بولیں — آپ کی بات وہاں کے Unique کو جائے گی</span>
          )}
          <button type="button" className="call-end-btn" onClick={endCall} data-testid="button-call-end">
            <PhoneOff size={15} /> ختم کریں
          </button>
        </div>
      )}
    </>
  );

  // Closed but still linked: a small chip keeps the state visible and
  // reopens the panel — polling above keeps running regardless.
  if (!open) {
    if (phase !== 'linked') return callPhase !== 'idle' ? callChrome : null;
    return (
      <>
        <button
          type="button"
          onClick={onRequestOpen}
          dir="rtl"
          style={{
            position: 'fixed', bottom: 86, insetInlineStart: 12, zIndex: 60,
            background: 'rgba(88,28,135,0.92)', color: '#f3e8ff', border: '1px solid rgba(216,180,254,0.5)',
            borderRadius: 999, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 7, backdropFilter: 'blur(6px)',
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: peer?.online ? '#4ade80' : '#facc15', display: 'inline-block' }} />
          📱 {peer?.name || 'ڈیوائس'} سے جُڑا ہوا
        </button>
        {callChrome}
      </>
    );
  }

  const pairLink = `${window.location.origin}${window.location.pathname}?pair=${myCode}`;
  const qrSrc = myCode ? `/api/pair/qr?text=${encodeURIComponent(pairLink)}` : '';

  return (
    <div className="tool-results" dir="rtl" data-testid="panel-pairing" role="region" aria-label="ڈیوائس جوڑیں">
      <div className="tool-results-head">
        <span className="tool-results-title">📱 ڈیوائس جوڑیں</span>
        <button type="button" className="tool-results-close" onClick={onClose} aria-label="بند کریں">
          <X size={18} />
        </button>
      </div>
      <div className="tool-results-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p className="tool-small-note" style={{ lineHeight: 1.9 }}>
          یہ سسٹم آپ کی اپنی دو ڈیوائسز (مثلاً فون اور لیپ ٹاپ) پر کھلی اس ایپ کو آپس میں جوڑتا ہے —
          گفتگو ایک سے دوسری پر بھیجیں، یا دوسری ڈیوائس پر قرآن/نقشہ کھلوائیں۔
          <strong> یہ فون کا ریموٹ کنٹرول نہیں ہے</strong> — رابطہ صرف اسی ایپ کے اندر، اور صرف جب دونوں پر ایپ کھلی ہو۔
        </p>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13.5, fontWeight: 700 }}>
          اس ڈیوائس کا نام
          <input
            type="text"
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            style={{ padding: '9px 11px', borderRadius: 10, border: '1px solid rgba(139,92,246,0.35)', background: 'rgba(0,0,0,0.25)', color: '#f3e8ff' }}
          />
        </label>

        {phase === 'idle' && (
          <>
            <div style={{ border: '1px solid rgba(139,92,246,0.25)', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontWeight: 800 }}>1️⃣ اس ڈیوائس پر کوڈ بنائیں</div>
              <p className="tool-small-note">کوڈ دوسری ڈیوائس پر ڈالیں — کوڈ 10 منٹ درست رہتا ہے اور صرف ایک بار چلتا ہے۔</p>
              <button type="button" className="tool-action-button" onClick={createCode} disabled={busy} style={{ display: 'inline-flex', gap: 7, alignItems: 'center', justifyContent: 'center' }}>
                <Link2 size={16} /> {busy ? 'بن رہا ہے…' : 'کوڈ بنائیں'}
              </button>
            </div>
            <div style={{ border: '1px solid rgba(139,92,246,0.25)', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontWeight: 800 }}>2️⃣ دوسری ڈیوائس کا کوڈ یہاں ڈالیں</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="چھ ہندسوں کا کوڈ"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  style={{ flex: 1, padding: '9px 11px', borderRadius: 10, border: '1px solid rgba(139,92,246,0.35)', background: 'rgba(0,0,0,0.25)', color: '#f3e8ff', textAlign: 'center', letterSpacing: 3 }}
                />
                <button type="button" className="tool-action-button" onClick={joinWithCode} disabled={busy}>
                  {busy ? 'جُڑ رہا ہے…' : 'جوڑیں'}
                </button>
              </div>
            </div>
          </>
        )}

        {phase === 'waiting' && (
          <div style={{ border: '1px solid rgba(74,222,128,0.35)', borderRadius: 14, padding: 16, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
            <div className="tool-small-note">یہ کوڈ دوسری ڈیوائس پر ڈالیں (10 منٹ درست):</div>
            <div style={{ fontSize: 38, fontWeight: 900, letterSpacing: 8, color: '#e9d5ff' }}>{myCode}</div>
            {qrSrc && <img src={qrSrc} alt="جوڑنے کا QR کوڈ" width={160} height={160} style={{ borderRadius: 10, background: '#fff', padding: 6 }} />}
            <div className="tool-small-note">یا دوسری ڈیوائس کے کیمرے سے QR اسکین کریں — ایپ کوڈ بھرے ہوئے کھل جائے گی۔</div>
            <div className="tool-small-note">⏳ دوسری ڈیوائس کا انتظار ہے…</div>
            <button type="button" className="tool-action-button" onClick={cancelWaiting}>منسوخ کریں</button>
          </div>
        )}

        {phase === 'linked' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ border: '1px solid rgba(74,222,128,0.4)', borderRadius: 14, padding: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: peer?.online ? '#4ade80' : '#facc15', display: 'inline-block' }} />
              <div>
                <div style={{ fontWeight: 800 }}>✅ جُڑا ہوا — {peer?.name || 'دوسری ڈیوائس'}</div>
                <div className="tool-small-note">{peer?.online ? 'دوسری ڈیوائس ابھی آن لائن ہے۔' : 'دوسری ڈیوائس ابھی بند لگ رہی ہے — پیغام پہنچنے میں دیر ہو سکتی ہے۔'}</div>
              </div>
            </div>
            <button type="button" className="tool-action-button" onClick={sendConversation} disabled={busy} style={{ display: 'inline-flex', gap: 7, alignItems: 'center', justifyContent: 'center' }}>
              <Send size={16} /> موجودہ گفتگو دوسری ڈیوائس پر بھیجیں
            </button>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="tool-action-button" onClick={() => sendCommand('open_quran')} disabled={busy} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <BookOpen size={15} /> وہاں قرآن کھلوائیں
              </button>
              <button type="button" className="tool-action-button" onClick={() => sendCommand('open_map')} disabled={busy} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <MapIcon size={15} /> وہاں نقشہ کھلوائیں
              </button>
              {/* No "open tools" command any more — the toolbox is
                  gone (Phase سادگی); on the other device every
                  capability is reached by voice/chat. Quran and map
                  remain: they are full-screen scenes. */}
            </div>
            {/* 📞 کال (Phase 4): the turn-based in-app voice link.
                Honest framing, printed right at the button: this is
                NOT a real phone call — both apps must be open and
                linked, and the talk goes turn by turn. */}
            <div style={{ border: '1px solid rgba(74,222,128,0.3)', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 9 }}>
              <div style={{ fontWeight: 800 }}>📞 کال — دوسری ڈیوائس کے Unique سے بات</div>
              <p className="tool-small-note" style={{ lineHeight: 1.9 }}>
                ایپ کے اندر آواز کا رابطہ — بات باری باری ہوتی ہے: آپ بولیں گے تو آپ کی بات دوسری ڈیوائس کے
                Unique کو جائے گی، وہ وہیں کام کر کے جواب دے گا، اور جواب آپ کو یہیں سنائی دے گا۔
                یہ اصل فون کال نہیں ہے — دونوں ڈیوائسز پر ایپ کھلی اور آپس میں جُڑی ہونا ضروری ہے۔
              </p>
              {callPhase === 'idle' && (
                <button type="button" className="tool-action-button" onClick={startCall} data-testid="button-call-start" style={{ display: 'inline-flex', gap: 7, alignItems: 'center', justifyContent: 'center' }}>
                  <Phone size={16} /> کال کریں
                </button>
              )}
              {callPhase === 'calling' && (
                <button type="button" className="tool-action-button" onClick={endCall} data-testid="button-call-cancel" style={{ display: 'inline-flex', gap: 7, alignItems: 'center', justifyContent: 'center', borderColor: 'rgba(248,113,113,0.5)' }}>
                  <PhoneOff size={16} /> رنگ ہو رہی ہے… — کال روکیں
                </button>
              )}
              {callPhase === 'active' && (
                <div className="tool-small-note">
                  📞 کال جاری ہے — {formatCallDuration(callSeconds)}
                  {callRole === 'caller' ? ' ۔ نیچے کال والے بینر سے ختم کریں؛ بولیں تو بات دوسری ڈیوائس کے Unique کو جائے گی۔' : ' ۔ دوسری ڈیوائس کی باتیں یہیں گفتگو میں آئیں گی اور جواب وہاں بھی سنائی دے گا۔'}
                </div>
              )}
              {callPhase === 'ringing' && (
                <div className="tool-small-note">📞 کال آ رہی ہے — اوپر دیے گئے کارڈ سے قبول یا رد کریں۔</div>
              )}
              {callNote && <div style={{ color: '#fcd9a0', fontSize: 13 }}>{callNote}</div>}
            </div>
            <button type="button" className="tool-action-button" onClick={disconnect} style={{ display: 'inline-flex', gap: 7, alignItems: 'center', justifyContent: 'center', borderColor: 'rgba(248,113,113,0.5)' }}>
              <Unlink size={16} /> رابطہ ختم کریں
            </button>
          </div>
        )}

        {notice && <div style={{ color: '#86efac', fontSize: 13.5 }}>{notice}</div>}
        {error && <div style={{ color: '#fca5a5', fontSize: 13.5 }}>{error}</div>}
      </div>
      {callChrome}
    </div>
  );
}
