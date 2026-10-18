// useGestures — React hook that runs MediaPipe hand tracking on the camera
// feed and emits stable gesture events. Everything runs client-side.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  classifyStaticGesture,
  createHands,
  loadMediaPipeHands,
  type GestureName,
  type HandLandmark,
} from '@/lib/gestures';

export type GestureStatus = 'idle' | 'loading' | 'ready' | 'denied' | 'error';

type UseGesturesOptions = {
  /** When false the camera is released. */
  enabled: boolean;
  onGesture: (gesture: Exclude<GestureName, 'none'>) => void;
};

const STABLE_FRAMES = 6; // same gesture this many frames in a row → emit
const COOLDOWN_MS = 1800; // ignore repeats of the same gesture within this window
const WAVE_WINDOW_MS = 900; // wrist must swing this long for a wave
const WAVE_MIN_SWINGS = 3; // direction changes needed for a wave

export function useGestures({ enabled, onGesture }: UseGesturesOptions) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<GestureStatus>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [activeGesture, setActiveGesture] = useState<GestureName>('none');
  const onGestureRef = useRef(onGesture);
  onGestureRef.current = onGesture;

  const stateRef = useRef({
    stream: null as MediaStream | null,
    hands: null as ReturnType<typeof createHands> | null,
    raf: 0,
    sending: false,
    lastGesture: 'none' as GestureName,
    stableCount: 0,
    lastEmittedAt: 0,
    lastEmittedGesture: 'none' as GestureName,
    wristTrail: [] as { x: number; at: number }[],
    stopped: false,
  });

  const stopAll = useCallback(() => {
    const s = stateRef.current;
    s.stopped = true;
    cancelAnimationFrame(s.raf);
    try { s.hands?.close(); } catch { /* ignore */ }
    s.hands = null;
    s.stream?.getTracks().forEach((t) => t.stop());
    s.stream = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const emitGesture = useCallback((gesture: Exclude<GestureName, 'none'>) => {
    const s = stateRef.current;
    const now = Date.now();
    if (gesture === s.lastEmittedGesture && now - s.lastEmittedAt < COOLDOWN_MS) return;
    s.lastEmittedGesture = gesture;
    s.lastEmittedAt = now;
    onGestureRef.current(gesture);
  }, []);

  /** Detect a wave: open palm whose wrist x oscillates side to side. */
  const detectWave = useCallback((landmarks: HandLandmark[] | undefined, gesture: GestureName): boolean => {
    const s = stateRef.current;
    const now = Date.now();
    s.wristTrail = s.wristTrail.filter((p) => now - p.at < WAVE_WINDOW_MS);
    if (gesture === 'open_palm' && landmarks && landmarks.length > 0) {
      s.wristTrail.push({ x: landmarks[0].x, at: now });
    } else if (gesture !== 'open_palm') {
      if (s.wristTrail.length > 0) s.wristTrail = [];
      return false;
    }
    if (s.wristTrail.length < 8) return false;
    let swings = 0;
    let lastDir = 0;
    for (let i = 1; i < s.wristTrail.length; i += 1) {
      const dx = s.wristTrail[i].x - s.wristTrail[i - 1].x;
      const dir = dx > 0.008 ? 1 : dx < -0.008 ? -1 : 0;
      if (dir !== 0 && lastDir !== 0 && dir !== lastDir) swings += 1;
      if (dir !== 0) lastDir = dir;
    }
    if (swings >= WAVE_MIN_SWINGS) {
      s.wristTrail = [];
      return true;
    }
    return false;
  }, []);

  const start = useCallback(async () => {
    const s = stateRef.current;
    s.stopped = false;
    setStatus('loading');
    setStatusMessage('کیمرہ تیار ہو رہا ہے…');
    try {
      await loadMediaPipeHands();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false,
      });
      if (s.stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      s.stream = stream;

      const video = videoRef.current;
      if (!video) throw new Error('ویڈیو تیار نہیں۔');
      video.srcObject = stream;
      await video.play();

      const hands = createHands();
      s.hands = hands;
      hands.onResults((results) => {
        if (s.stopped) return;
        const landmarks = results.multiHandLandmarks?.[0];
        let gesture = classifyStaticGesture(landmarks);
        if (gesture === 'open_palm' && detectWave(landmarks, gesture)) {
          gesture = 'wave';
        }
        setActiveGesture(gesture);

        if (gesture === s.lastGesture && gesture !== 'none') {
          s.stableCount += 1;
        } else {
          s.stableCount = gesture === 'none' ? 0 : 1;
        }
        s.lastGesture = gesture;

        if (gesture !== 'none' && s.stableCount >= STABLE_FRAMES) {
          s.stableCount = 0; // require the gesture to re-stabilize
          emitGesture(gesture);
        }
      });

      setStatus('ready');
      setStatusMessage('');

      const loop = async () => {
        if (s.stopped || !videoRef.current) return;
        if (!s.sending && videoRef.current.readyState >= 2) {
          s.sending = true;
          try {
            await s.hands?.send({ image: videoRef.current });
          } catch {
            // A single failed frame is fine; the loop continues.
          } finally {
            s.sending = false;
          }
        }
        s.raf = requestAnimationFrame(loop);
      };
      loop();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/denied|not allowed|permission/i.test(message)) {
        setStatus('denied');
        setStatusMessage('کیمرے کی اجازت نہیں ملی۔ براؤزر کی سائٹ سیٹنگز میں کیمرے کی اجازت دیں، پھر دوبارہ کوشش کریں۔');
      } else {
        setStatus('error');
        setStatusMessage(message || 'کیمرہ شروع نہیں ہو سکا۔');
      }
    }
  }, [detectWave, emitGesture]);

  useEffect(() => {
    if (enabled) {
      void start();
    } else {
      stopAll();
      setStatus('idle');
      setStatusMessage('');
      setActiveGesture('none');
    }
    return () => stopAll();
  }, [enabled, start, stopAll]);

  return { videoRef, status, statusMessage, activeGesture, stop: stopAll };
}
