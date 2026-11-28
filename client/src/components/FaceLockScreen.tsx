/**
 * FaceLockScreen — the lock screen (Phase 2). Shown by App.tsx after
 * login whenever Face Lock is ON. It tries the face first (hidden
 * camera — the video element is mounted but invisible; his picture
 * never shows on screen), and the 6-digit passcode is always right
 * there as the fallback. It can never lock the user out: the
 * passcode always works, and the forgot-password path on the login
 * screen resets the lock entirely.
 */

import { useEffect, useRef, useState } from 'react';
import { secureAppStorage } from '@/lib/secure-app-storage';
import {
  describeUnlockResult,
  isFaceMatch,
  loadFaceLock,
  passcodeMatches,
  type FaceUnlockResult,
} from '@/lib/face-lock';
import { captureFaceDescriptor, closeCameraStream, openHiddenCamera } from '@/lib/face-recognition';

export default function FaceLockScreen({
  onUnlock,
}: {
  onUnlock: () => void;
}) {
  const [status, setStatus] = useState('چہرہ دیکھا جا رہا ہے…');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const doneRef = useRef(false);

  async function tryFace(): Promise<FaceUnlockResult> {
    const state = loadFaceLock(secureAppStorage);
    if (!state.descriptor) return 'error';
    try {
      const video = videoRef.current;
      if (!video) return 'error';
      const stream = await openHiddenCamera(video);
      streamRef.current = stream;
      await new Promise((r) => setTimeout(r, 1200));
      const result = await captureFaceDescriptor(video);
      closeCameraStream(stream);
      streamRef.current = null;
      if (result.status === 'ok') {
        return isFaceMatch(result.descriptor, state.descriptor) ? 'face' : 'no-match';
      }
      if (result.status === 'no-face') return 'no-face';
      return 'error';
    } catch {
      closeCameraStream(streamRef.current);
      streamRef.current = null;
      return 'error';
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBusy(true);
      const result = await tryFace();
      if (cancelled || doneRef.current) return;
      setTried((t) => t + 1);
      setStatus(describeUnlockResult(result, true));
      if (result === 'face') {
        doneRef.current = true;
        onUnlock();
      }
      setBusy(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function retryFace() {
    if (doneRef.current) return;
    setBusy(true);
    setStatus('چہرہ دیکھا جا رہا ہے…');
    const result = await tryFace();
    if (doneRef.current) return;
    setTried((t) => t + 1);
    setStatus(describeUnlockResult(result, true));
    if (result === 'face') {
      doneRef.current = true;
      onUnlock();
    }
    setBusy(false);
  }

  async function unlockWithCode() {
    const state = loadFaceLock(secureAppStorage);
    if (!state.passcodeHash) { setStatus('کوڈ لگا ہوا نہیں ہے — لاگ ان اسکرین سے نیا پاسورڈ بنائیں۔'); return; }
    setBusy(true);
    const ok = await passcodeMatches(code, state.passcodeHash);
    setBusy(false);
    if (ok) {
      doneRef.current = true;
      onUnlock();
    } else {
      setStatus('کوڈ غلط ہے — دوبارہ لکھیں۔');
      setCode('');
    }
  }

  return (
    <div className="uflock-screen" data-testid="face-lock-screen" dir="rtl">
      {/* Hidden camera mount — invisible by design. */}
      <video ref={videoRef} muted playsInline style={{ display: 'none' }} aria-hidden="true" />
      <div className="uflock-screen-card">
        <div className="uflock-screen-icon" aria-hidden="true">🔒</div>
        <h1 className="uflock-screen-title">چہرے کا تالا</h1>
        <p className="uflock-screen-text">
          یونیکا آپ کا چہرہ دیکھ کر کھلے گی — تصویر اسکرین پر نہیں آئے گی۔
        </p>
        <p className="uflock-screen-status" role="status" data-testid="face-lock-screen-status">
          {busy ? '⏳ ' : ''}{status}
        </p>
        <button
          type="button"
          className="upanel-refresh"
          onClick={() => void retryFace()}
          disabled={busy || tried >= 3}
          data-testid="button-face-lock-retry"
        >
          📷 دوبارہ چہرہ چیک کریں
        </button>
        <div className="uflock-screen-or">— یا —</div>
        <div className="uflock-row">
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="6 ہندسوں کا کوڈ"
            data-testid="input-face-lock-unlock-code"
            aria-label="6 ہندسوں کا کوڈ"
            onKeyDown={(e) => { if (e.key === 'Enter') void unlockWithCode(); }}
          />
          <button type="button" onClick={() => void unlockWithCode()} disabled={busy || code.length !== 6} data-testid="button-face-lock-unlock">
            کوڈ سے کھولیں
          </button>
        </div>
        <p className="uflock-screen-note">
          کوڈ بھول گئے ہوں تو لاگ آؤٹ کر کے لاگ ان اسکرین سے «پاس ورڈ بھول گئے؟» — نیا پاسورڈ بناتے ہی تالا کھل جائے گا۔
        </p>
      </div>
    </div>
  );
}
