/**
 * AiOrb — the center hero avatar for the Jarvis-style interface.
 * Avatar v3, the user's FINAL design (2026-10-22): his own supplied
 * portrait — a young man whose face and upper body are MADE of glowing
 * blue/violet particles (دانے دانے والا چہرہ), public/avatar.webp — sits
 * LARGE and CLEAR in the center of the glowing globe. The globe around it
 * keeps its rings, halo, glass highlight and edge sparkles.
 *
 * Framing: the square photo is shown through a zoomed window (see the math
 * constants below) so the head + shoulders fill the circle and read
 * clearly even at phone size. A gentle idle float (CSS, on the photo
 * wrapper) keeps the portrait feeling alive; both the base photo and the
 * lip patch live inside that wrapper, so they always move together and
 * never drift out of alignment.
 *
 * Lip movement: while `isSpeaking` is true, a soft-masked patch layer —
 * the same photo, visible only through a small feathered ellipse over the
 * mouth — is scaled/translated a few percent around the mouth center by a
 * small rAF driver that picks a new syllable-like pose every 90–190 ms.
 * At rest the patch transform is identity, so its dots sit exactly on the
 * base photo's dots and the patch is invisible. NOTE: this is rhythmic
 * lip motion synced to the speaking STATE, not phoneme-level lip-sync.
 * prefers-reduced-motion: no float (CSS) and no lip driver (JS checks the
 * media query and never starts).
 */

import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';

type AiOrbProps = {
  isSpeaking?: boolean;
  isThinking?: boolean;
  size?: number;
};

/** The user's official avatar portrait (particle man on near-black). */
const AVATAR_SRC = '/avatar.webp';

/* ---------------- framing + mouth remapping ----------------
 * Source photo is square. Measured landmarks (normalized 0–1):
 *   head/face bbox  x 0.385–0.722, y 0.025–0.395
 *   mouth bbox      x 0.512–0.592, y 0.315–0.353 → center (0.552, 0.334)
 * Display window: ZOOM 1.25 → the visible source window is 0.8 × 0.8,
 * its origin at (WIN_X, WIN_Y) = (0.15, 0.02), i.e. source region
 * x 0.15–0.95, y 0.02–0.82 — full head, neck, shoulders, upper torso.
 * A source point (u, v) lands at photo-wrapper fraction
 *   ((u − WIN_X) × ZOOM, (v − WIN_Y) × ZOOM)
 * so the mouth center lands at (0.5025, 0.3925) of the displayed circle.
 * (The wrapper's own extra scale(1.035) float margin is wrapper-local and
 * does not change any of these wrapper-local fractions.)
 */
const ZOOM = 1.25;
const WIN_X = 0.15;
const WIN_Y = 0.02;
const MOUTH_SRC = { x: 0.552, y: 0.334 }; // in source-photo fractions
const MOUTH_X = (MOUTH_SRC.x - WIN_X) * ZOOM; // 0.5025 — of wrapper width
const MOUTH_Y = (MOUTH_SRC.y - WIN_Y) * ZOOM; // 0.3925 — of wrapper height

/** Shared geometry for both photo layers (base + lip patch). */
const frameStyle: CSSProperties = {
  width: `${ZOOM * 100}%`,
  height: `${ZOOM * 100}%`,
  left: `${-WIN_X * ZOOM * 100}%`,
  top: `${-WIN_Y * ZOOM * 100}%`,
};

/** Feathered ellipse over the mouth — the only place the lip patch shows. */
const mouthMask =
  `radial-gradient(ellipse 12% 8.5% at ${MOUTH_X * 100}% ${MOUTH_Y * 100}%, ` +
  '#000 48%, rgba(0,0,0,0.65) 62%, transparent 80%)';

const lipsStyle: CSSProperties = {
  WebkitMaskImage: mouthMask,
  maskImage: mouthMask,
};

/**
 * Sparkling lights dancing around the globe's edge — gold, cyan and white
 * twinkles with staggered timing so the orb shimmers and catches the eye.
 * Kept subtle: the portrait itself already carries the particle magic.
 */
const SPARKS = [
  { x: 50, y: -4, d: '0s', s: 7, c: '#fde68a' },
  { x: 78, y: 2, d: '0.7s', s: 5, c: '#a5f3fc' },
  { x: 97, y: 22, d: '1.3s', s: 6, c: '#ffffff' },
  { x: 104, y: 50, d: '0.4s', s: 5, c: '#f0abfc' },
  { x: 96, y: 79, d: '1.8s', s: 7, c: '#fde68a' },
  { x: 76, y: 99, d: '0.9s', s: 5, c: '#a5f3fc' },
  { x: 50, y: 106, d: '1.5s', s: 6, c: '#ffffff' },
  { x: 24, y: 99, d: '0.2s', s: 5, c: '#f0abfc' },
  { x: 3, y: 79, d: '1.1s', s: 7, c: '#a5f3fc' },
  { x: -4, y: 50, d: '1.6s', s: 5, c: '#fde68a' },
  { x: 3, y: 21, d: '0.5s', s: 6, c: '#ffffff' },
  { x: 23, y: 1, d: '2s', s: 5, c: '#fde68a' },
] as const;

/* ---------------- component ---------------- */

export default function AiOrb({ isSpeaking = false, isThinking = false, size = 212 }: AiOrbProps) {
  const state = isSpeaking ? 'speaking' : isThinking ? 'thinking' : 'idle';
  const speakingRef = useRef(isSpeaking);
  speakingRef.current = isSpeaking;
  const lipsFrameRef = useRef<HTMLSpanElement | null>(null);
  const kickRef = useRef<(() => void) | null>(null);

  /* Lip-motion driver: runs only while speaking (plus a short ramp-out
   * tail). Amplitude ramps smoothly in/out so the lips never snap. */
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    let running = false;
    let gain = 0; // 0..1 envelope (ramps with speaking state)
    let value = 0; // current mouth openness 0..1
    let target = 0; // current syllable pose
    let nextAt = 0; // when the next pose is picked (rAF clock)
    let last = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
      last = now;
      const speaking = speakingRef.current;
      gain += ((speaking ? 1 : 0) - gain) * Math.min(1, dt * (speaking ? 5 : 3.5));
      if (speaking && now >= nextAt) {
        // New syllable pose every 90–190 ms; ~30% fully closed (word gaps).
        target = Math.random() < 0.3 ? 0 : 0.3 + Math.random() * 0.7;
        nextAt = now + 90 + Math.random() * 100;
      }
      if (!speaking) target = 0;
      value += (target - value) * Math.min(1, dt * 22);
      const el = lipsFrameRef.current;
      if (el) {
        const open = gain * value;
        el.style.transform =
          open > 0.004
            ? `translateY(${(open * 1.3).toFixed(2)}px) scaleY(${(1 + open * 0.085).toFixed(3)})`
            : '';
      }
      if (speaking || gain > 0.004 || value > 0.004) {
        raf = requestAnimationFrame(tick);
      } else {
        running = false;
      }
    };

    const kick = () => {
      if (!running) {
        running = true;
        last = 0;
        raf = requestAnimationFrame(tick);
      }
    };
    kickRef.current = kick;
    if (speakingRef.current) kick();
    return () => {
      cancelAnimationFrame(raf);
      running = false;
      kickRef.current = null;
    };
  }, []);

  /* Restart the driver whenever a new reply starts speaking. */
  useEffect(() => {
    if (isSpeaking) kickRef.current?.();
  }, [isSpeaking]);

  return (
    <div
      className={`ai-orb ai-orb-${state}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label="Unique AI"
    >
      <span className="ai-orb-ring" aria-hidden="true" />
      <span className="ai-orb-ring2" aria-hidden="true" />
      <span className="ai-orb-core" aria-hidden="true">
        <span className="ai-orb-photo">
          <span className="ai-orb-frame" style={frameStyle}>
            <img src={AVATAR_SRC} alt="" draggable={false} />
          </span>
          <span className="ai-orb-lips" style={lipsStyle}>
            <span
              className="ai-orb-frame ai-orb-lips-frame"
              style={{ ...frameStyle, transformOrigin: `${MOUTH_SRC.x * 100}% ${MOUTH_SRC.y * 100}%` }}
              ref={lipsFrameRef}
            >
              <img src={AVATAR_SRC} alt="" draggable={false} />
            </span>
          </span>
        </span>
        <span className="ai-orb-glass" aria-hidden="true" />
      </span>
      <span className="ai-orb-halo" aria-hidden="true" />
      <span className="ai-orb-shimmer" aria-hidden="true" />
      {SPARKS.map((sp, i) => (
        <span
          key={i}
          className="ai-orb-sparkle"
          aria-hidden="true"
          style={{
            left: `${sp.x}%`,
            top: `${sp.y}%`,
            width: sp.s,
            height: sp.s,
            background: sp.c,
            boxShadow: `0 0 ${sp.s * 2}px ${sp.c}, 0 0 ${sp.s * 4}px ${sp.c}`,
            animationDelay: sp.d,
          }}
        />
      ))}
    </div>
  );
}
