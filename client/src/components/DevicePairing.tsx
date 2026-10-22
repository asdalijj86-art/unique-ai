/**
 * DevicePairing — «📱 ڈیوائس جوڑیں» (Task 6b).
 *
 * Links this device with the user's OTHER device running the same app:
 * one side shows a 6-digit code (+ QR of a link that pre-fills it), the
 * other types the code. While linked, either side can send the current
 * conversation over, or ask the other device to open Quran / the map /
 * the toolbox. HONEST SCOPE (also stated in the UI): this links the
 * APP on both devices while it is open — it is NOT remote control of
 * the phone itself.
 *
 * The component stays MOUNTED while linked (rendering only a small
 * chip when the panel is closed) so incoming conversations/commands
 * keep arriving; polling stops the moment the link ends.
 */
import { useEffect, useRef, useState } from 'react';
import { X, Link2, Unlink, Send, BookOpen, Map as MapIcon, Wrench } from 'lucide-react';
import { getDeviceIdentity, saveDeviceName, pairApi, type PairPeer } from '@/lib/pairing-client';

export type RemoteCommand = { action: string; tool?: string };
export type ConversationHandover = { title: string; messages: { role: string; content: string }[] };

type Phase = 'idle' | 'waiting' | 'linked';

export default function DevicePairing({
  open,
  onClose,
  onRequestOpen,
  initialJoinCode,
  getConversation,
  onReceiveConversation,
  onRemoteCommand,
}: {
  open: boolean;
  onClose: () => void;
  onRequestOpen: () => void;
  initialJoinCode?: string;
  getConversation: () => ConversationHandover | null;
  onReceiveConversation: (handover: ConversationHandover, fromName: string) => void;
  onRemoteCommand: (command: RemoteCommand, fromName: string) => void;
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
  const callbacksRef = useRef({ onReceiveConversation, onRemoteCommand });
  callbacksRef.current = { onReceiveConversation, onRemoteCommand };

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
          setNotice('رابطہ ختم ہو گیا ہے۔');
          return;
        }
        if (data.peer) setPeer(data.peer);
        for (const message of data.messages || []) {
          if (message.kind === 'conversation') {
            callbacksRef.current.onReceiveConversation(message.payload, message.from?.name || 'دوسری ڈیوائس');
          } else if (message.kind === 'command') {
            callbacksRef.current.onRemoteCommand(message.payload, message.from?.name || 'دوسری ڈیوائس');
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

  // Closed but still linked: a small chip keeps the state visible and
  // reopens the panel — polling above keeps running regardless.
  if (!open) {
    if (phase !== 'linked') return null;
    return (
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
              <button type="button" className="tool-action-button" onClick={() => sendCommand('open_tools')} disabled={busy} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <Wrench size={15} /> وہاں ٹولز کھلوائیں
              </button>
            </div>
            <button type="button" className="tool-action-button" onClick={disconnect} style={{ display: 'inline-flex', gap: 7, alignItems: 'center', justifyContent: 'center', borderColor: 'rgba(248,113,113,0.5)' }}>
              <Unlink size={16} /> رابطہ ختم کریں
            </button>
          </div>
        )}

        {notice && <div style={{ color: '#86efac', fontSize: 13.5 }}>{notice}</div>}
        {error && <div style={{ color: '#fca5a5', fontSize: 13.5 }}>{error}</div>}
      </div>
    </div>
  );
}
