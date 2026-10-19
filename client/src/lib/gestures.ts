// Hand gesture recognition for Unique AI — client-side only.
//
// Uses MediaPipe Hands loaded at runtime from CDN (never bundled, no server
// calls for gesture processing). Recognizes:
//   open_palm → "رکو" (stop speaking)
//   fist      → mic on/off
//   thumbs_up → latest messages (scroll to bottom)
//   point     → focus the message box
//   wave      → dismiss the gesture panel
//   clap      → wake up Unique AI (two hands come together, like the viral
//               "Maya AI" hand-clap activation)
//
// A gesture is emitted only after it is stable for several consecutive
// frames, and the same gesture has a cooldown so it does not repeat.
// Clap is edge-triggered (hands apart → hands together) so quick claps work.

export type GestureName = 'open_palm' | 'fist' | 'thumbs_up' | 'point' | 'wave' | 'clap' | 'none';

export type HandLandmark = { x: number; y: number; z: number };

declare global {
  interface Window {
    Hands?: new (config: { locateFile: (file: string) => string }) => MediaPipeHandsInstance;
  }
}

type MediaPipeHandsInstance = {
  setOptions: (options: Record<string, unknown>) => void;
  onResults: (cb: (results: { multiHandLandmarks?: HandLandmark[][] }) => void) => void;
  send: (input: { image: HTMLVideoElement }) => Promise<void>;
  close: () => void;
};

const HANDS_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/hands.js';

let handsLoadPromise: Promise<void> | null = null;

/** Inject the MediaPipe Hands script from CDN (once). */
export function loadMediaPipeHands(): Promise<void> {
  if (typeof window !== 'undefined' && window.Hands) return Promise.resolve();
  if (handsLoadPromise) return handsLoadPromise;
  handsLoadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = HANDS_CDN;
    script.async = true;
    script.onload = () => {
      if (window.Hands) resolve();
      else reject(new Error('MediaPipe Hands لوڈ نہیں ہوا۔'));
    };
    script.onerror = () => reject(new Error('MediaPipe Hands ڈاؤن لوڈ نہیں ہو سکا۔ انٹرنیٹ چیک کریں۔'));
    document.head.appendChild(script);
  });
  return handsLoadPromise;
}

export function createHands(): MediaPipeHandsInstance {
  if (!window.Hands) throw new Error('MediaPipe Hands لوڈ نہیں ہوا۔');
  const hands = new window.Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`,
  });
  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 0,
    minDetectionConfidence: 0.55,
    minTrackingConfidence: 0.5,
  });
  return hands;
}

// Landmark indices (MediaPipe Hands: 21 points).
const WRIST = 0;
const FINGER_TIPS = { thumb: 4, index: 8, middle: 12, ring: 16, pinky: 20 } as const;
const FINGER_PIPS = { thumb: 2, index: 6, middle: 10, ring: 14, pinky: 18 } as const;

function dist(a: HandLandmark, b: HandLandmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** A finger counts as extended when its tip is clearly farther from the wrist than its PIP joint. */
function isExtended(lm: HandLandmark[], tip: number, pip: number): boolean {
  return dist(lm[tip], lm[WRIST]) > dist(lm[pip], lm[WRIST]) * 1.12;
}

function extendedFingers(lm: HandLandmark[]): Record<keyof typeof FINGER_TIPS, boolean> {
  return {
    thumb: isExtended(lm, FINGER_TIPS.thumb, FINGER_PIPS.thumb),
    index: isExtended(lm, FINGER_TIPS.index, FINGER_PIPS.index),
    middle: isExtended(lm, FINGER_TIPS.middle, FINGER_PIPS.middle),
    ring: isExtended(lm, FINGER_TIPS.ring, FINGER_PIPS.ring),
    pinky: isExtended(lm, FINGER_TIPS.pinky, FINGER_PIPS.pinky),
  };
}

/**
 * Classify a single frame of hand landmarks into a static gesture.
 * Wave is temporal and is detected by the hook, not here.
 */
export function classifyStaticGesture(landmarks: HandLandmark[] | undefined): GestureName {
  if (!landmarks || landmarks.length < 21) return 'none';
  const f = extendedFingers(landmarks);
  const count = [f.thumb, f.index, f.middle, f.ring, f.pinky].filter(Boolean).length;

  if (count === 5) return 'open_palm';
  if (count === 0) return 'fist';
  if (f.thumb && !f.index && !f.middle && !f.ring && !f.pinky) return 'thumbs_up';
  if (!f.thumb && f.index && !f.middle && !f.ring && !f.pinky) return 'point';
  return 'none';
}

/** Urdu label for each gesture, shown in the UI. */
export const GESTURE_LABELS: Record<Exclude<GestureName, 'none'>, string> = {
  open_palm: 'کھلا ہاتھ — آواز روکو',
  fist: 'مٹھی — مائیک آن/آف',
  thumbs_up: 'انگوٹھا — تازہ پیغامات',
  point: 'اشارہ — لکھنے کا خانہ',
  wave: 'ہاتھ ہلاؤ — پینل بند کرو',
  clap: 'تالی بجاؤ — Unique AI جگاؤ 👏',
};

// --- clap detection ---------------------------------------------------------
// A clap = two hands that were apart come together. We track the distance
// between the two palm centers across frames and fire on the transition
// (apart → together), so even a quick clap is caught.

/** Approximate palm center: average of wrist + four MCP joints. */
function palmCenter(lm: HandLandmark[]): HandLandmark {
  const idx = [0, 5, 9, 13, 17];
  let x = 0, y = 0, z = 0;
  for (const i of idx) {
    x += lm[i].x; y += lm[i].y; z += lm[i].z;
  }
  const n = idx.length;
  return { x: x / n, y: y / n, z: z / n };
}

const CLAP_TOGETHER_DIST = 0.14; // palms this close (normalized) = touching
const CLAP_APART_DIST = 0.32;    // palms this far = clearly separate

/**
 * Given all detected hands' landmarks, return the current two-palm distance,
 * or null when fewer than two hands are visible.
 */
export function twoPalmDistance(allLandmarks: HandLandmark[][] | undefined): number | null {
  if (!allLandmarks || allLandmarks.length < 2) return null;
  const a = allLandmarks[0];
  const b = allLandmarks[1];
  if (!a || a.length < 21 || !b || b.length < 21) return null;
  return dist(palmCenter(a), palmCenter(b));
}

/**
 * Edge-triggered clap detection. Call every frame with the previous and
 * current two-palm distances (null when <2 hands visible). Returns true on
 * the exact frame the hands come together after being apart.
 */
export function detectClap(prevDist: number | null, currDist: number | null): boolean {
  if (prevDist === null || currDist === null) return false;
  return prevDist >= CLAP_APART_DIST && currDist <= CLAP_TOGETHER_DIST;
}
