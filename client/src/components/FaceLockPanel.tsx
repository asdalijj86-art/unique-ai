/**
 * FaceLockPanel — FACE LOCK settings (Phase 2, Stonic v3.1.11).
 * Setup in three honest steps: (1) 6-digit passcode, (2) enroll the
 * owner's face (hidden camera — the video element is mounted but
 * invisible, per the camera preview rule; only the descriptor
 * numbers are kept, never a photo), (3) turn the lock ON. Turning it
 * off needs the passcode (or a face match) — a stranger cannot just
 * switch it off. The passcode ALWAYS unlocks, so the user can never
 * be locked out of their own app.
 */

import { useRef, useState } from 'react';
import { secureAppStorage } from '@/lib/secure-app-storage';
import {
  faceLockReady,
  hashPasscode,
  isValidPasscode,
  loadFaceLock,
  passcodeMatches,
  saveFaceLock,
  type FaceLockState,
} from '@/lib/face-lock';
import { captureFaceDescriptor, closeCameraStream, openHiddenCamera } from '@/lib/face-recognition';

export default function FaceLockPanel() {
  const [state, setState] = useState<FaceLockState>(() => loadFaceLock(secureAppStorage));
  const [passcode, setPasscode] = useState('');
  const [confirm, setConfirm] = useState('');
  const [unlockCode, setUnlockCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const ready = faceLockReady(state);

  function persist(next: FaceLockState) {
    setState(next);
    saveFaceLock(secureAppStorage, next);
  }

  async function setPasscodeStep() {
    if (!isValidPasscode(passcode)) { setNotice('کوڈ بالکل 6 ہندسوں کا ہو — مثلاً 123456۔'); return; }
    if (passcode !== confirm) { setNotice('دونوں کوڈ ایک جیسے نہیں ہیں۔'); return; }
    setBusy(true);
    try {
      const hash = await hashPasscode(passcode);
      persist({ ...state, passcodeHash: hash });
      setPasscode('');
      setConfirm('');
      setNotice('✅ کوڈ محفوظ ہو گیا — اب چہرہ محفوظ کریں۔');
    } catch {
      setNotice('کوڈ محفوظ نہیں ہو سکا — دوبارہ کوشش کریں۔');
    } finally {
      setBusy(false);
    }
  }

  async function enrollFace() {
    if (!state.passcodeHash) { setNotice('پہلے 6 ہندسوں کا کوڈ لگائیں۔'); return; }
    setBusy(true);
    setNotice('کیمرہ کھل رہا ہے… چہرہ سامنے رکھیں، تصویر اسکرین پر نہیں آئے گی۔');
    try {
      const video = videoRef.current;
      if (!video) throw new Error('کیمرہ تیار نہیں۔');
      const stream = await openHiddenCamera(video);
      streamRef.current = stream;
      // Let the camera settle, then capture.
      await new Promise((r) => setTimeout(r, 1200));
      const result = await captureFaceDescriptor(video);
      closeCameraStream(stream);
      streamRef.current = null;
      if (result.status === 'ok') {
        persist({ ...state, descriptor: result.descriptor, enrolledAt: Date.now() });
        setNotice('✅ چہرہ محفوظ ہو گیا — اب تالا آن کر سکتے ہیں۔');
      } else if (result.status === 'no-face') {
        setNotice('کیمرے میں کوئی چہرہ نظر نہیں آیا — روشنی ٹھیک کر کے دوبارہ کوشش کریں۔');
      } else if (result.status === 'many-faces') {
        setNotice(`کیمرے میں ${result.count} چہرے نظر آئے — اکیلے سامنے آئیں۔`);
      } else {
        setNotice(result.message);
      }
    } catch (e) {
      closeCameraStream(streamRef.current);
      streamRef.current = null;
      setNotice(e instanceof Error ? e.message : 'کیمرہ نہیں کھلا — اجازت چیک کریں۔');
    } finally {
      setBusy(false);
    }
  }

  function toggleLock() {
    if (!state.enabled) {
      if (!ready) { setNotice('پہلے کوڈ + چہرہ دونوں مکمل کریں۔'); return; }
      persist({ ...state, enabled: true });
      setNotice('🔒 چہرے کا تالا آن ہو گیا — اگلی بار ایپ چہرہ دیکھ کر یا کوڈ سے کھلے گی۔');
    } else {
      // Turning OFF needs the passcode (or a face match, via the
      // same enroll flow) — a stranger cannot just switch it off.
      setNotice('بند کرنے کے لیے نیچے کوڈ لکھیں۔');
    }
  }

  async function disableWithCode() {
    if (!state.passcodeHash) return;
    const ok = await passcodeMatches(unlockCode, state.passcodeHash);
    if (!ok) { setNotice('کوڈ غلط ہے۔'); return; }
    persist({ ...state, enabled: false });
    setUnlockCode('');
    setNotice('🔓 چہرے کا تالا بند ہو گیا۔');
  }

  async function changePasscode() {
    if (!isValidPasscode(passcode) || passcode !== confirm) {
      setNotice('نیا کوڈ 6 ہندسوں کا ہو اور دونوں جگہ ایک جیسا ہو۔');
      return;
    }
    const oldOk = await passcodeMatches(unlockCode, state.passcodeHash);
    if (!oldOk) { setNotice('پرانا کوڈ غلط ہے۔'); return; }
    setBusy(true);
    try {
      const hash = await hashPasscode(passcode);
      persist({ ...state, passcodeHash: hash });
      setPasscode('');
      setConfirm('');
      setUnlockCode('');
      setNotice('✅ کوڈ بدل گیا۔');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="upanel" data-testid="panel-face-lock" dir="rtl">
      {/* Hidden camera mount — the video element is mounted but
          INVISIBLE (camera preview rule): his picture never shows. */}
      <video ref={videoRef} muted playsInline style={{ display: 'none' }} aria-hidden="true" />
      <p className="upanel-intro">
        چہرے کا تالا — ایپ آپ کا چہرہ دیکھ کر کھلے گی۔ چہرہ اسی ڈیوائس پر چیک ہوتا ہے — تصویر کہیں نہیں جاتی، نہ محفوظ ہوتی ہے۔ کوڈ ہمیشہ کام کرتا ہے، اس لیے آپ کبھی بند نہیں ہوں گے۔
      </p>

      <div className="uflock-status" data-testid="face-lock-status">
        <span>حالت: {state.enabled ? '🔒 آن ہے' : '🔓 بند ہے'}</span>
        <span>کوڈ: {state.passcodeHash ? '✅ لگا ہوا' : '❌ نہیں لگا'}</span>
        <span>چہرہ: {state.descriptor ? '✅ محفوظ ہے' : '❌ محفوظ نہیں'}</span>
      </div>

      <div className="upanel-section-title">1️⃣ 6 ہندسوں کا کوڈ (بیک اپ)</div>
      <div className="uflock-row">
        <input
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={passcode}
          onChange={(e) => setPasscode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="6 ہندسے"
          data-testid="input-face-lock-passcode"
          aria-label="6 ہندسوں کا کوڈ"
        />
        <input
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="کوڈ دوبارہ"
          data-testid="input-face-lock-passcode-confirm"
          aria-label="کوڈ دوبارہ"
        />
        <button type="button" onClick={() => void setPasscodeStep()} disabled={busy} data-testid="button-face-lock-set-passcode">
          کوڈ محفوظ کریں
        </button>
      </div>

      <div className="upanel-section-title">2️⃣ چہرہ محفوظ کریں</div>
      <button
        type="button"
        className="upanel-refresh"
        onClick={() => void enrollFace()}
        disabled={busy || !state.passcodeHash}
        data-testid="button-face-lock-enroll"
      >
        📷 چہرہ محفوظ کریں
      </button>
      {!state.passcodeHash && <p className="upanel-empty">پہلے اوپر کوڈ لگائیں۔</p>}

      <div className="upanel-section-title">3️⃣ تالا آن / بند کریں</div>
      <button
        type="button"
        className="upanel-refresh"
        onClick={toggleLock}
        disabled={busy || (!state.enabled && !ready)}
        data-testid="button-face-lock-toggle"
      >
        {state.enabled ? '🔓 تالا بند کریں' : '🔒 تالا آن کریں'}
      </button>
      {state.enabled && (
        <div className="uflock-row">
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={unlockCode}
            onChange={(e) => setUnlockCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="بند کرنے کے لیے کوڈ"
            data-testid="input-face-lock-disable-code"
            aria-label="بند کرنے کے لیے کوڈ"
          />
          <button type="button" onClick={() => void disableWithCode()} data-testid="button-face-lock-disable">
            کوڈ سے بند کریں
          </button>
        </div>
      )}
      {state.passcodeHash && (
        <div className="uflock-row">
          <span className="upanel-empty">کوڈ بدلنا ہو تو: پرانا کوڈ اوپر والے خانے میں، نیا کوڈ پہلے والے خانوں میں — پھر «کوڈ بدلیں» دبائیں۔</span>
          <button type="button" onClick={() => void changePasscode()} data-testid="button-face-lock-change-passcode">
            کوڈ بدلیں
          </button>
        </div>
      )}

      {notice && (
        <p className="upanel-empty" role="status" data-testid="face-lock-notice">{notice}</p>
      )}
      <p className="upanel-empty">
        کوڈ اور چہرہ دونوں بھول گئے ہوں تو لاگ ان اسکرین سے «پاس ورڈ بھول گئے؟» — نیا پاسورڈ بناتے ہی تالا کھل جائے گا (پرانی میموری محفوظ رہے گی)۔
      </p>
    </div>
  );
}
