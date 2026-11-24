/**
 * CallIntoUnique — «📞 کال — کہیں سے بھی» (2026-11-24, Stonic Remote-style).
 *
 * The front door for calling into Unique. The signalling + turn-based
 * voice link already live in DevicePairing (Phase 4: invite → ring →
 * accept → turns → end over the pairing relay; a callee's turn goes
 * through the normal brain in chat.tsx, so tools + builder work on
 * the call; Uniqa answers by default because she is the front
 * persona). This panel only surfaces it on the front and tells the
 * truth about reachability:
 *
 *   - The app on THIS device listens for calls while it is open.
 *   - The phone reaches it through THIS app's address: the same
 *     Wi-Fi works at home; from outside the house the laptop must be
 *     reachable (a Tailscale address, or a tunnel) — the panel says
 *     plainly which case this address is, and never claims a call
 *     will connect when the laptop is off or unreachable.
 *   - No real phone calls, ever; both sides need the app open.
 *   - Two-way: he can call in, and Uniqa can call him — either
 *     linked side can start the call; the other side rings.
 */

import { useState } from 'react';
import type { CallUiState } from './DevicePairing';

export type CallLinkState = { linked: boolean; peerName: string; peerOnline: boolean };

// ---------------------------------------------------------------------------
// Reachability — which networks can open THIS app's address.
// ---------------------------------------------------------------------------

export type ReachabilityKind = 'local' | 'lan' | 'tailscale' | 'public';
export type Reachability = { kind: ReachabilityKind; label: string; detail: string };

function isPrivateV4(host: string): boolean {
  const parts = host.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

export function classifyReachability(hostname: string): Reachability {
  const host = (hostname || '').toLowerCase();
  if (!host || host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]') {
    return {
      kind: 'local',
      label: 'صرف اسی لیپ ٹاپ پر',
      detail:
        'یہ پتہ صرف اسی لیپ ٹاپ پر کھلتا ہے۔ فون سے کال کے لیے ایپ کو لیپ ٹاپ کے نیٹ ورک پتے پر کھولنا ہوگا — ' +
        'اسی وائی فائی کا پتہ، یا Tailscale کا پتہ۔ باہر سے یہ لنک نہیں کھلے گا۔',
    };
  }
  // Tailscale: 100.64.0.0/10 (100.64–100.127) or a *.ts.net name.
  if (/^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./.test(host) || host.endsWith('.ts.net')) {
    return {
      kind: 'tailscale',
      label: 'Tailscale سے — کہیں سے بھی',
      detail:
        'یہ Tailscale کا پتہ ہے — فون پر Tailscale آن ہو تو گھر سے باہر سے بھی یہ لنک کھلے گا اور کال لگے گی۔ ' +
        'بس لیپ ٹاپ آن ہونا چاہیے اور ایپ کھلی ہونی چاہیے۔',
    };
  }
  if (isPrivateV4(host)) {
    return {
      kind: 'lan',
      label: 'اسی گھر کے وائی فائی پر',
      detail:
        'فون اسی وائی فائی پر ہو تو یہ لنک کھلے گا اور کال لگے گی۔ گھر سے باہر سے یہ لنک نہیں کھلے گا — ' +
        'باہر سے کال کے لیے Tailscale یا ٹنل چاہیے۔',
    };
  }
  return {
    kind: 'public',
    label: 'انٹرنیٹ سے — کہیں سے بھی',
    detail:
      'یہ پتہ انٹرنیٹ پر ہے — کہیں سے بھی لنک کھلے گا اور کال لگے گی۔ بس لیپ ٹاپ آن ہونا چاہیے اور ایپ کھلی ہونی چاہیے۔',
  };
}

// Copy with a fallback: clipboard needs a secure context, and a
// plain-http LAN address may not have it — the old textarea trick
// still works there. Returns false when nothing worked.
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to the textarea trick */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export default function CallIntoUnique({
  linkState,
  callState,
  onStartCall,
  onOpenPairing,
}: {
  linkState: CallLinkState;
  callState: CallUiState;
  onStartCall: () => void;
  onOpenPairing: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const appUrl = `${window.location.origin}${window.location.pathname}`;
  const reach = classifyReachability(window.location.hostname);

  async function handleCopy() {
    const ok = await copyText(appUrl);
    setCopied(ok);
    setCopyFailed(!ok);
    window.setTimeout(() => {
      setCopied(false);
      setCopyFailed(false);
    }, 3000);
  }

  return (
    <div className="upanel" data-testid="panel-call" dir="rtl">
      <p className="upanel-intro">
        لیپ ٹاپ آن ہو اور ایپ کھلی ہو تو آپ کہیں سے بھی کال کر سکتے ہیں — یونیکا اٹھائے گی، آپ کی بات سنے گی اور کام کرے گی۔
      </p>

      {/* Listening + link status — what is true right now. */}
      <div className="upanel-section-title">📡 کال سننے کی حیثیت</div>
      <div className="umedia-rows">
        <div className="umedia-row">
          <span className="umedia-dot on" aria-hidden="true" />
          <span>یہ ایپ کال سن رہی ہے</span>
          <strong>لیپ ٹاپ آن ہے</strong>
        </div>
        <div className="umedia-row">
          <span className={`umedia-dot${linkState.linked ? (linkState.peerOnline ? ' on' : ' off') : ' off'}`} aria-hidden="true" />
          <span>فون سے رابطہ</span>
          <strong>
            {linkState.linked
              ? `${linkState.peerName} — ${linkState.peerOnline ? 'آن لائن' : 'ابھی بند لگ رہا ہے'}`
              : 'ابھی کوئی ڈیوائس جُڑی نہیں'}
          </strong>
        </div>
        {callState.phase !== 'idle' && (
          <div className="umedia-row">
            <span className="umedia-dot on" aria-hidden="true" />
            <span>کال</span>
            <strong>
              {callState.phase === 'calling'
                ? `رنگ ہو رہی ہے… — ${callState.peerName}`
                : callState.phase === 'active'
                  ? `جاری ہے — ${callState.peerName}`
                  : 'آ رہی ہے — اوپر والے کارڈ سے قبول کریں'}
            </strong>
          </div>
        )}
      </div>

      {/* Reachability — the honest part: where does this link open? */}
      <div className="upanel-section-title">🌐 یہ پتہ کہاں سے کھلتا ہے</div>
      <p className="tool-small-note" style={{ lineHeight: 1.9 }}>
        <strong>{reach.label}</strong> — {reach.detail}
      </p>
      <div
        dir="ltr"
        style={{
          background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(139,92,246,0.35)', borderRadius: 10,
          padding: '10px 12px', fontSize: 13, wordBreak: 'break-all', color: '#e9d5ff', textAlign: 'left',
        }}
      >
        {appUrl}
      </div>
      <button type="button" className="upanel-refresh" onClick={() => void handleCopy()} data-testid="button-copy-call-link">
        {copied ? '✓ کاپی ہو گیا' : '🔗 لنک کاپی کریں'}
      </button>
      {copyFailed && (
        <p className="tool-small-note" style={{ color: '#fca5a5' }}>
          کاپی نہیں ہو سکا — اوپر والا لنک خود لکھ کر فون پر کھولیں۔
        </p>
      )}

      {/* How to link the phone. */}
      <div className="upanel-section-title">📱 فون جوڑیں — کال لگانے کا طریقہ</div>
      <p className="tool-small-note" style={{ lineHeight: 1.9 }}>
        1) فون پر اوپر والا لنک کھولیں۔
        2) «ڈیوائس جوڑیں» سے کوڈ بنائیں یا QR اسکین کریں۔
        3) جُڑنے کے بعد «کال کریں» دبائیں — یونیکا اٹھائے گی۔
      </p>
      <button
        type="button"
        className="tool-action-button"
        onClick={onOpenPairing}
        data-testid="button-open-pairing-from-call"
        style={{ display: 'inline-flex', gap: 7, alignItems: 'center', justifyContent: 'center' }}
      >
        📱 ڈیوائس جوڑیں — کوڈ / QR دکھائیں
      </button>

      {/* The call itself — both directions. */}
      <div className="upanel-section-title">📞 کال کریں</div>
      {callState.phase === 'idle' && linkState.linked && (
        <>
          <button
            type="button"
            className="tool-action-button"
            onClick={onStartCall}
            data-testid="button-call-start-from-panel"
            style={{ display: 'inline-flex', gap: 7, alignItems: 'center', justifyContent: 'center' }}
          >
            📞 کال کریں
          </button>
          <p className="tool-small-note" style={{ lineHeight: 1.9 }}>
            یونیکا جواب دے گی — وہ سامنے ہے۔ آپ بولیں گے، وہ وہیں کام کر کے جواب دے گی، اور جواب آپ کو یہیں سنائی دے گا۔
          </p>
        </>
      )}
      {callState.phase === 'idle' && !linkState.linked && (
        <p className="tool-small-note" style={{ lineHeight: 1.9 }}>
          پہلے فون جوڑیں — پھر کال لگے گی۔ کال کے لیے دونوں طرف ایپ کھلی ہونی چاہیے۔
        </p>
      )}
      {callState.phase === 'calling' && (
        <p className="tool-small-note">📞 رنگ ہو رہی ہے… — ختم کرنے کے لیے اوپر والا بینر استعمال کریں۔</p>
      )}
      {callState.phase === 'active' && (
        <p className="tool-small-note">📞 کال جاری ہے — ختم کرنے کے لیے اوپر والا بینر استعمال کریں۔</p>
      )}
      {callState.phase === 'ringing' && (
        <p className="tool-small-note">📞 کال آ رہی ہے — اوپر والے کارڈ سے قبول یا رد کریں۔</p>
      )}
      <p className="tool-small-note" style={{ lineHeight: 1.9 }}>
        یونیکا بھی آپ کو کال کر سکتی ہے — وہ یہیں سے کال کرے گی اور آپ کے فون پر رنگ بجے گی
        (فون پر ایپ کھلی اور جُڑی ہونی چاہیے)۔
      </p>

      <p className="tool-small-note" style={{ lineHeight: 1.9, color: '#c4b5fd' }}>
        یہ اصل فون کال نہیں ہے — دونوں طرف ایپ کھلی ہونی چاہیے۔ لیپ ٹاپ بند ہو یا انٹرنیٹ نہ ہو تو کال نہیں لگے گی؛
        ایپ «جواب نہیں آیا» بتا دے گی، جھوٹی رنگ نہیں دکھائے گی۔
      </p>
    </div>
  );
}
