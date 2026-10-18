/**
 * WhatsAppSender — send WhatsApp messages via linked device.
 *
 * 1. Shows QR code when not linked (scan with phone: WhatsApp → Linked Devices)
 * 2. Once linked: enter number + message → send
 *
 * Uses the unofficial Baileys client (user accepted ban risk).
 */
import { useState, useEffect, useRef } from 'react';
import { Loader2, QrCode, Send, RefreshCw } from 'lucide-react';

type WaStatus = {
  connected: boolean;
  state: string;
  qr: string | null;
};

export default function WhatsAppSender() {
  const [status, setStatus] = useState<WaStatus | null>(null);
  const [to, setTo] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const pollRef = useRef<number | null>(null);

  async function fetchStatus() {
    try {
      const res = await fetch('/api/whatsapp/status');
      const data = await res.json();
      setStatus(data);
    } catch {
      // server unreachable
    }
  }

  useEffect(() => {
    fetchStatus();
    // Poll for QR / connection updates every 5s while not connected
    pollRef.current = window.setInterval(() => {
      fetchStatus();
    }, 5000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  // Stop polling once connected
  useEffect(() => {
    if (status?.connected && pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [status?.connected]);

  async function send() {
    setError('');
    setResult('');
    if (!to.trim() || !message.trim()) {
      setError('نمبر اور پیغام دونوں لکھیں۔');
      return;
    }
    setSending(true);
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: to.trim(), text: message.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'بھیجنے میں مسئلہ ہوا۔');
      } else {
        setResult(`✅ پیغام بھیج دیا گیا (${data.to})`);
        setMessage('');
      }
    } catch {
      setError('سرور سے رابطہ نہیں ہو سکا۔');
    } finally {
      setSending(false);
    }
  }

  if (!status) {
    return (
      <div className="tool-label" dir="rtl">
        <Loader2 size={16} className="spin" /> WhatsApp سے جڑ رہا ہے…
      </div>
    );
  }

  // Not connected — show QR code
  if (!status.connected) {
    return (
      <div dir="rtl">
        <div className="tool-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <QrCode size={18} /> WhatsApp لنک کریں
        </div>
        <div className="tool-small-note" style={{ marginBottom: 12 }}>
          اپنے فون پر WhatsApp کھولیں → <b>Linked Devices</b> → <b>Link a Device</b> → نیچے والا QR scan کریں۔
        </div>
        {status.qr ? (
          <div style={{ textAlign: 'center', background: '#fff', borderRadius: 12, padding: 12, maxWidth: 240, margin: '0 auto' }}>
            <img src={status.qr} alt="WhatsApp QR Code" style={{ width: '100%', display: 'block' }} />
          </div>
        ) : (
          <div className="tool-label">
            <Loader2 size={16} className="spin" /> QR بن رہا ہے…
          </div>
        )}
        <button
          type="button"
          className="tool-action-button"
          onClick={fetchStatus}
          style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <RefreshCw size={14} /> دوبارہ چیک کریں
        </button>
        <div className="tool-small-note" style={{ marginTop: 10, color: '#fca5a5' }}>
          ⚠️ نوٹ: یہ غیر سرکاری طریقہ ہے — WhatsApp آپ کا نمبر ban کر سکتا ہے۔
        </div>
      </div>
    );
  }

  // Connected — show send form
  return (
    <div dir="rtl">
      <div className="tool-label" style={{ color: '#6ee7b7', marginBottom: 10 }}>
        ✅ WhatsApp جڑا ہوا ہے
      </div>
      <div className="tool-label">وصول کنندہ کا نمبر:</div>
      <input
        value={to}
        onChange={(e) => setTo(e.target.value)}
        placeholder="03001234567"
        className="tool-input"
        dir="ltr"
        style={{ width: '100%', marginBottom: 10 }}
      />
      <div className="tool-label">پیغام:</div>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="اپنا پیغام لکھیں…"
        className="tool-input"
        rows={3}
        style={{ width: '100%', resize: 'vertical', marginBottom: 10 }}
      />
      <button
        type="button"
        className="tool-action-button"
        onClick={send}
        disabled={sending}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        {sending ? <><Loader2 size={14} className="spin" /> بھیج رہا ہے…</> : <><Send size={14} /> بھیجیں</>}
      </button>
      {error && <div className="tool-error" style={{ marginTop: 8 }}>{error}</div>}
      {result && <div className="tool-label" style={{ color: '#6ee7b7', marginTop: 8 }}>{result}</div>}
    </div>
  );
}
