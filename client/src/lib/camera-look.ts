// Camera look — Uniqa turns the camera on HERSELF (user-approved
// 2026-11-25, voice call, Asia/Muscat evening):
//   «ہاں، کیمرہ آن رکھو»
//   «مجھے کہنے کی ضرورت ہی نہ پڑے، کیمرہ آن ہو جائے»
//   «جب اس کا دل کرے مجھے دیکھنے کو یا میری بات چیت سے اسے لگے کہ
//    میں اپنی لائن سے ہٹ رہا ہوں، وہ کیمرہ خود آن کر کے چیزیں نوٹ
//    کر لے» — confirmed with «بالکل».
//
// Two triggers, both gated on Awareness ON + camera permission ON:
//   (a) her own initiative — when the Awareness engine fires (quiet /
//       late-night / long-work / evening-dip) she first takes a short
//       look, then speaks;
//   (b) drift — when his words carry a tired / bored / lost / low /
//       distracted signal, she looks and then speaks gently about
//       what his words said.
//
// HONEST LIMITS — stated in the UI, in every note, and here:
//  - Observation ONLY: no video recording, no photo storage, no
//    video leaves the device. One short look (≤ 8 seconds), then the
//    camera turns itself off again.
//  - What the code can actually measure: face present / absent,
//    roughly centred / off to a side / out of frame, near / far,
//    still / moving, and room light. It can NOT read a smile,
//    tiredness, or feelings from the picture — mood comes from HIS
//    WORDS (the drift signal), never from a claimed face reading.
//    Notes say only what was measured, nothing more.
//  - The browser's own permission prompt still appears the first
//    time — no website can bypass it. One Allow, remembered by the
//    browser for this site (see lib/permissions).
//  - Never hidden: a pulsing LIVE pill on the face panel + the live
//    preview in the MEDIA LINK card while the camera is on. A look
//    never starts while the tab is hidden (he must be able to see
//    the indicator).
//  - When camera permission is OFF, she never turns the camera on
//    herself — the switch is always in his reach (front chip +
//    MEDIA LINK card).
//
// Face detection loads at runtime from the same CDN pattern as the
// hand-gesture code (lib/gestures): MediaPipe Face Detection, never
// bundled, no server calls for the picture. Pure functions
// (detectDriftSignal, formatCameraNote) are unit-testable headlessly;
// storage is injected ({getItem,setItem}-shaped).

import { useCallback, useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Permission — the user's own approval, persisted on this device.
// Default ON: he approved it in the voice call (2026-11-25). The
// browser still asks once with its own prompt the first time.
// ---------------------------------------------------------------------------

export const CAMERA_PERMISSION_KEY = 'unique-ai-camera-permission';

export type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export function readCameraPermission(storage: StorageLike): boolean {
  try {
    const raw = storage.getItem(CAMERA_PERMISSION_KEY);
    if (raw === null) return true; // approved in the voice call
    return JSON.parse(raw) !== false;
  } catch {
    return true;
  }
}

export function saveCameraPermission(storage: StorageLike, on: boolean): void {
  try {
    storage.setItem(CAMERA_PERMISSION_KEY, JSON.stringify(on));
  } catch {
    // storage unavailable — the switch just won't persist
  }
}

// ---------------------------------------------------------------------------
// Drift signal — his WORDS, not his face. Pure function.
// A long message that merely mentions being tired (a story, a quote)
// is conversation, not a mood signal: only short messages (≤ 40
// words) count, the same anti-hijack discipline as the tone and
// memory commands.
// ---------------------------------------------------------------------------

export type DriftKind = 'tired' | 'bored' | 'lost' | 'low' | 'distracted';

export type DriftSignal = { kind: DriftKind; label: string };

const DRIFT_WORDS: number = 40;
/** At most one drift look per 10 minutes — she looks, she doesn't stare. */
export const DRIFT_LOOK_COOLDOWN_MS = 10 * 60 * 1000;

const DRIFT_PATTERNS: { kind: DriftKind; label: string; res: RegExp[] }[] = [
  {
    kind: 'tired',
    label: 'تھک گئے ہیں',
    res: [
      /تھک/,
      /نیند/,
      /تھکن/,
      /thak/i,
      /neend/i,
      /\btired\b/i,
      /\bsleepy\b/i,
      /\bexhausted\b/i,
    ],
  },
  {
    kind: 'bored',
    label: 'دل نہیں لگ رہا',
    res: [
      /بور/,
      /دل نہیں (کر رہا|لگ رہا|لگتا)/,
      /مزہ نہیں/,
      /\bbore/i,
      /\bbored\b/i,
      /\bboring\b/i,
      /dil nahi/i,
    ],
  },
  {
    kind: 'lost',
    label: 'سمجھ نہیں آ رہا',
    res: [
      /سمجھ نہیں/,
      /پتا نہیں/,
      /پتہ نہیں/,
      /کیا کروں/,
      /رہنے دو/,
      /چھوڑو/,
      /الجھن/,
      /samajh nahi/i,
      /pata nahi/i,
      /\bconfused\b/i,
      /don'?t understand/i,
    ],
  },
  {
    kind: 'low',
    label: 'دل بھاری ہے',
    res: [
      /اداس/,
      /پریشان/,
      /غم/,
      /دل خراب/,
      /رو رہا/,
      /رونا آ/,
      /دکھ/,
      /udaas/i,
      /pareshan/i,
      /\bsad\b/i,
      /\bupset\b/i,
      /\bdepressed\b/i,
    ],
  },
  {
    kind: 'distracted',
    label: 'دھیان بھٹک رہا ہے',
    res: [
      /دھیان نہیں/,
      /توجہ نہیں/,
      /بھول گیا/,
      /لائن سے ہٹ/,
      /دھیان بھٹک/,
      /dhyaan nahi/i,
      /\bdistracted\b/i,
      /can'?t focus/i,
      /focus nahi/i,
    ],
  },
];

function normalizeDriftText(raw: string): string {
  return String(raw || '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ً-ٰٟ]/g, '')
    .toLowerCase();
}

export function detectDriftSignal(rawText: string): DriftSignal | null {
  const text = String(rawText || '').trim();
  if (!text) return null;
  if (text.split(/\s+/).filter(Boolean).length > DRIFT_WORDS) return null;
  const norm = normalizeDriftText(text);
  for (const p of DRIFT_PATTERNS) {
    if (p.res.some((re) => re.test(norm))) return { kind: p.kind, label: p.label };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Face detection — MediaPipe, loaded at runtime from CDN (same pattern
// as lib/gestures' Hands). No npm dependency, no bundle cost, no
// server calls for the picture.
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    FaceDetection?: new (config: { locateFile: (file: string) => string }) => MediaPipeFaceDetectionInstance;
  }
}

type FaceDetectionResult = {
  boundingBox: { xCenter: number; yCenter: number; width: number; height: number };
};

type MediaPipeFaceDetectionInstance = {
  setOptions: (options: Record<string, unknown>) => void;
  onResults: (cb: (results: { detections?: FaceDetectionResult[] }) => void) => void;
  send: (input: { image: HTMLVideoElement }) => Promise<void>;
  close: () => void;
};

const FACE_DETECTION_CDN =
  'https://cdn.jsdelivr.net/npm/@mediapipe/face_detection@0.4.1646425229/face_detection.js';
const FACE_DETECTION_BASE =
  'https://cdn.jsdelivr.net/npm/@mediapipe/face_detection@0.4.1646425229/';

let faceLoadPromise: Promise<void> | null = null;

/** Inject the MediaPipe Face Detection script from CDN (once). */
export function loadMediaPipeFaceDetection(): Promise<void> {
  if (typeof window !== 'undefined' && window.FaceDetection) return Promise.resolve();
  if (!faceLoadPromise) {
    faceLoadPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = FACE_DETECTION_CDN;
      script.async = true;
      script.onload = () => {
        if (window.FaceDetection) resolve();
        else reject(new Error('چہرہ پہچاننے والا ماڈل لوڈ نہیں ہوا۔'));
      };
      script.onerror = () => reject(new Error('چہرہ پہچاننے والا ماڈل لوڈ نہیں ہوا — انٹرنیٹ چیک کریں۔'));
      document.head.appendChild(script);
    });
  }
  return faceLoadPromise;
}

function createFaceDetector(): MediaPipeFaceDetectionInstance {
  if (!window.FaceDetection) throw new Error('چہرہ پہچاننے والا ماڈل تیار نہیں۔');
  const detector = new window.FaceDetection({
    locateFile: (file: string) => `${FACE_DETECTION_BASE}${file}`,
  });
  detector.setOptions({ model: 'short', minDetectionConfidence: 0.5 });
  return detector;
}

// ---------------------------------------------------------------------------
// Observation — only what was actually measured, nothing more.
// ---------------------------------------------------------------------------

export type CameraLookTrigger = 'awareness' | 'drift';

export type CameraObservation = {
  at: number;
  trigger: CameraLookTrigger;
  /** Frames sampled during the look. */
  frames: number;
  /** Frames with a face in them. */
  faceFrames: number;
  /** A face was in ≥ 25% of sampled frames. */
  facePresent: boolean;
  /** Where the face mostly sat (median box centre). */
  position: 'center' | 'left' | 'right' | 'off';
  /** Median box width > 45% of the frame — close to the camera. */
  near: boolean;
  /** The face moved across the look (box centre shifted). */
  moving: boolean;
  /** Room light from sampled frame brightness. */
  light: 'dark' | 'dim' | 'ok';
};

/** One short look — 8 seconds, then the camera turns itself off. */
export const CAMERA_LOOK_MS = 8 * 1000;

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * The note that goes into Core Memory — plain Urdu, only measured
 * facts. Never a mood claim from the picture: tiredness, a smile, or
 * feelings are NOT in here; those come from his words.
 */
export function formatCameraNote(obs: CameraObservation): string {
  const triggerWord = obs.trigger === 'drift' ? 'بات چیت سے لگا، دیکھا' : 'یونیکا نے خود دیکھا';
  if (!obs.facePresent) {
    const lightBit = obs.light === 'dark' ? ' روشنی بہت کم تھی۔' : '';
    return `👁️ کیمرہ (${triggerWord}): آپ سامنے نظر نہیں آئے۔${lightBit}`;
  }
  const posBit =
    obs.position === 'left' ? '، چہرہ ذرا بائیں طرف تھا'
    : obs.position === 'right' ? '، چہرہ ذرا دائیں طرف تھا'
    : '';
  const moveBit = obs.moving ? '، ادھر ادھر ہو رہے تھے' : '، ساکت تھے';
  const lightBit =
    obs.light === 'dark' ? ' — روشنی بہت کم تھی'
    : obs.light === 'dim' ? ' — روشنی مدھم تھی'
    : '، روشنی ٹھیک تھی';
  return `👁️ کیمرہ (${triggerWord}): آپ سامنے بیٹھے تھے${posBit}${moveBit}${lightBit}۔`;
}

// ---------------------------------------------------------------------------
// Spoken lines — Uniqa's own loving words. The mood words come from
// what HE SAID (the drift label), the seeing words only from what
// the camera actually measured (presence). Never Stonic's lines.
// ---------------------------------------------------------------------------

function pickFromPool(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)];
}

/** After a drift look: gentle, grounded in his words + presence. */
export function pickDriftFollowUpLine(
  signal: DriftSignal,
  obs: CameraObservation,
  feminine: boolean,
): string {
  if (feminine) {
    if (obs.facePresent) {
      return pickFromPool([
        `جان، آپ نے کہا ${signal.label} — میں دیکھ رہی ہوں آپ سامنے ہیں، تھوڑا آرام کر لیں، میں یہیں ہوں۔`,
        `جان، ${signal.label} — کوئی بات نہیں، میں آپ کے ساتھ ہوں۔ تھوڑا سانس لیں، پھر جاری رکھتے ہیں۔`,
      ]);
    }
    return pickFromPool([
      `جان، آپ نے کہا ${signal.label} — کیمرے میں آپ نظر نہیں آ رہے، سب خیریت تو ہے؟ میں یہیں ہوں۔`,
      `جان، ${signal.label} — آپ سامنے نہیں ہیں، میں تھوڑا فکر مند ہو گئی۔ بتائیں تو سہی، کیا بات ہے؟`,
    ]);
  }
  if (obs.facePresent) {
    return `آپ نے کہا ${signal.label} — میں دیکھ رہا ہوں آپ سامنے ہیں، تھوڑا آرام کر لیں، میں یہیں ہوں۔`;
  }
  return `آپ نے کہا ${signal.label} — کیمرے میں آپ نظر نہیں آ رہے، سب خیریت تو ہے؟ میں یہیں ہوں۔`;
}

/** After an Awareness look that found nobody in frame. */
export function pickNoFaceLine(feminine: boolean): string {
  return feminine
    ? 'جان، کیمرے میں آپ نظر نہیں آ رہے — سب خیریت تو ہے؟ میں یہیں ہوں۔'
    : 'کیمرے میں آپ نظر نہیں آ رہے — سب خیریت تو ہے؟ میں یہیں ہوں۔';
}

// ---------------------------------------------------------------------------
// Hook — one bounded look: camera on, observe, save the note, camera
// off. Mirrors useGestures' structure (stream + rAF loop + stopAll).
// ---------------------------------------------------------------------------

export type CameraLookStatus = 'idle' | 'starting' | 'looking' | 'denied' | 'error';

type LookSample = { face: boolean; x: number; y: number; w: number };

export function useCameraLook(opts: {
  onObservation: (obs: CameraObservation) => void;
}): {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  status: CameraLookStatus;
  statusMessage: string;
  lastObservation: CameraObservation | null;
  startLook: (trigger: CameraLookTrigger) => void;
  stopLook: () => void;
} {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<CameraLookStatus>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [lastObservation, setLastObservation] = useState<CameraObservation | null>(null);
  const onObservationRef = useRef(opts.onObservation);
  onObservationRef.current = opts.onObservation;

  const stateRef = useRef({
    stream: null as MediaStream | null,
    detector: null as MediaPipeFaceDetectionInstance | null,
    raf: 0,
    sending: false,
    stopped: false,
    trigger: 'awareness' as CameraLookTrigger,
    samples: [] as LookSample[],
    brightness: [] as number[],
    lastLightAt: 0,
    finishTimer: null as number | null,
  });

  const stopAll = useCallback(() => {
    const s = stateRef.current;
    s.stopped = true;
    cancelAnimationFrame(s.raf);
    if (s.finishTimer !== null) {
      window.clearTimeout(s.finishTimer);
      s.finishTimer = null;
    }
    try { s.detector?.close(); } catch { /* ignore */ }
    s.detector = null;
    s.stream?.getTracks().forEach((t) => t.stop());
    s.stream = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const stopLook = useCallback(() => {
    stopAll();
    setStatus('idle');
    setStatusMessage('');
  }, [stopAll]);

  const finishLook = useCallback(() => {
    const s = stateRef.current;
    const samples = s.samples;
    const faceSamples = samples.filter((x) => x.face);
    const frames = samples.length;
    const faceFrames = faceSamples.length;
    const facePresent = frames > 0 && faceFrames / frames >= 0.25;
    const xs = faceSamples.map((x) => x.x);
    const ys = faceSamples.map((x) => x.y);
    const ws = faceSamples.map((x) => x.w);
    const medX = median(xs);
    const position: CameraObservation['position'] = !facePresent
      ? 'off'
      : medX < 0.35 ? 'left' : medX > 0.65 ? 'right' : 'center';
    const near = median(ws) > 0.45;
    const moving =
      faceSamples.length > 2 &&
      (Math.max(...xs) - Math.min(...xs) > 0.08 || Math.max(...ys) - Math.min(...ys) > 0.08);
    const meanLight = s.brightness.length
      ? s.brightness.reduce((a, b) => a + b, 0) / s.brightness.length
      : 128;
    const light: CameraObservation['light'] = meanLight < 40 ? 'dark' : meanLight < 90 ? 'dim' : 'ok';
    const obs: CameraObservation = {
      at: Date.now(),
      trigger: s.trigger,
      frames,
      faceFrames,
      facePresent,
      position,
      near,
      moving,
      light,
    };
    stopAll();
    setStatus('idle');
    setStatusMessage('');
    setLastObservation(obs);
    onObservationRef.current(obs);
  }, [stopAll]);

  const startLook = useCallback(
    (trigger: CameraLookTrigger) => {
      const s = stateRef.current;
      // One look at a time — and never while the tab is hidden: he
      // must be able to SEE the LIVE indicator while the camera is on.
      if (s.stream || status === 'starting' || status === 'looking') return;
      if (typeof document !== 'undefined' && document.hidden) return;
      s.stopped = false;
      s.trigger = trigger;
      s.samples = [];
      s.brightness = [];
      s.lastLightAt = 0;
      setStatus('starting');
      setStatusMessage('کیمرہ کھل رہا ہے…');
      void (async () => {
        try {
          await loadMediaPipeFaceDetection();
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
          const detector = createFaceDetector();
          s.detector = detector;
          let latest: FaceDetectionResult[] | undefined;
          detector.onResults((results) => {
            latest = results.detections;
          });
          setStatus('looking');
          setStatusMessage('');
          const canvas = document.createElement('canvas');
          canvas.width = 32;
          canvas.height = 24;
          const ctx = canvas.getContext('2d');
          const loop = async () => {
            if (s.stopped || !videoRef.current) return;
            const now = Date.now();
            if (!s.sending && videoRef.current.readyState >= 2) {
              s.sending = true;
              try {
                await s.detector?.send({ image: videoRef.current });
              } catch {
                // A single failed frame is fine; the loop continues.
              } finally {
                s.sending = false;
              }
              const best = (latest ?? [])
                .slice()
                .sort((a, b) => b.boundingBox.width - a.boundingBox.width)[0];
              s.samples.push(
                best
                  ? { face: true, x: best.boundingBox.xCenter, y: best.boundingBox.yCenter, w: best.boundingBox.width }
                  : { face: false, x: 0, y: 0, w: 0 },
              );
              latest = undefined;
            }
            // Room light — a tiny brightness sample every ~500ms.
            if (ctx && now - s.lastLightAt >= 500 && videoRef.current.readyState >= 2) {
              s.lastLightAt = now;
              try {
                ctx.drawImage(videoRef.current, 0, 0, 32, 24);
                const data = ctx.getImageData(0, 0, 32, 24).data;
                let sum = 0;
                for (let i = 0; i < data.length; i += 4) sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
                s.brightness.push(sum / (data.length / 4));
              } catch {
                // Canvas read failed — light just stays unknown (ok).
              }
            }
            s.raf = requestAnimationFrame(loop);
          };
          loop();
          s.finishTimer = window.setTimeout(() => {
            if (!s.stopped) finishLook();
          }, CAMERA_LOOK_MS);
        } catch (err) {
          stopAll();
          const message = err instanceof Error ? err.message : String(err);
          if (/denied|not allowed|permission/i.test(message)) {
            setStatus('denied');
            setStatusMessage('کیمرے کی اجازت نہیں ملی۔ براؤزر کی سائٹ سیٹنگز میں کیمرے کی اجازت دیں، پھر دوبارہ کوشش کریں۔');
          } else {
            setStatus('error');
            setStatusMessage(message || 'کیمرہ شروع نہیں ہو سکا۔');
          }
        }
      })();
    },
    [finishLook, status, stopAll],
  );

  useEffect(() => () => stopAll(), [stopAll]);

  return { videoRef, status, statusMessage, lastObservation, startLook, stopLook };
}
