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
  /** Who is present: Unique (male, blue/violet) or Uniqa (female,
   *  cyan glow, flowing hair). Default Unique. */
  persona?: 'unique' | 'uniqa';
};

/** The user's official avatar portrait (particle man on near-black). */
const AVATAR_UNIQUE = '/avatar.webp';
/** Uniqa's portrait — generated 2026-11-25 in the SAME particle style
 *  (cyan dots, flowing hair on near-black, Stonic's Love glow). It is
 *  our own art for our own character: NOT a photo of a real person
 *  and NOT Stonic's face. */
const AVATAR_UNIQA = '/uniqa-avatar.webp';

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
/** Mouth centers, measured from each portrait (source-photo
 *  fractions). Unique: 0.552, 0.334. Uniqa: 0.50, 0.51 — her face
 *  sits lower in her frame, so the lip patch needs her own
 *  landmarks; the display window is the same for both. */
const MOUTH_SRC: Record<'unique' | 'uniqa', { x: number; y: number }> = {
  unique: { x: 0.552, y: 0.334 },
  uniqa: { x: 0.5, y: 0.51 },
};

/** Shared geometry for both photo layers (base + lip patch). */
const frameStyle: CSSProperties = {
  width: `${ZOOM * 100}%`,
  height: `${ZOOM * 100}%`,
  left: `${-WIN_X * ZOOM * 100}%`,
  top: `${-WIN_Y * ZOOM * 100}%`,
};

/** Feathered ellipse over the mouth — the only place the lip patch
 *  shows. Per persona: each portrait's mouth lands at a different
 *  wrapper fraction (Unique 0.5025/0.3925, Uniqa 0.4375/0.6125). */
function mouthStyle(persona: 'unique' | 'uniqa'): CSSProperties {
  const m = MOUTH_SRC[persona];
  const mx = (m.x - WIN_X) * ZOOM;
  const my = (m.y - WIN_Y) * ZOOM;
  const mask =
    `radial-gradient(ellipse 12% 8.5% at ${mx * 100}% ${my * 100}%, ` +
    '#000 48%, rgba(0,0,0,0.65) 62%, transparent 80%)';
  return { WebkitMaskImage: mask, maskImage: mask };
}

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

/** Uniqa's sparks — cyan and white (her cyan palette, 2026-11-25:
 *  Stonic's Love glows cyan — no gold, no pink, no violet). */
const SPARKS_UNIQA = [
  { x: 50, y: -4, d: '0s', s: 7, c: '#67e8f9' },
  { x: 78, y: 2, d: '0.7s', s: 5, c: '#22d3ee' },
  { x: 97, y: 22, d: '1.3s', s: 6, c: '#a5f3fc' },
  { x: 104, y: 50, d: '0.4s', s: 5, c: '#ffffff' },
  { x: 96, y: 79, d: '1.8s', s: 7, c: '#67e8f9' },
  { x: 76, y: 99, d: '0.9s', s: 5, c: '#a5f3fc' },
  { x: 50, y: 106, d: '1.5s', s: 6, c: '#22d3ee' },
  { x: 24, y: 99, d: '0.2s', s: 5, c: '#ffffff' },
  { x: 3, y: 79, d: '1.1s', s: 7, c: '#a5f3fc' },
  { x: -4, y: 50, d: '1.6s', s: 5, c: '#67e8f9' },
  { x: 3, y: 21, d: '0.5s', s: 6, c: '#ffffff' },
  { x: 23, y: 1, d: '2s', s: 5, c: '#22d3ee' },
] as const;

/** Uniqa's flowing hair — cyan strands that sway around the globe
 *  (2026-11-25, Stonic's Love glows cyan; 2026-11-24 gold removal
 *  still holds: no gold). Pure SVG + CSS animation, drawn around
 *  the orb's edge only; the portrait itself already carries her
 *  long particle hair. Unique gets no hair overlay. */
const HAIR_STRANDS = [
  'M100 6 C 78 16, 54 34, 40 62',
  'M70 10 C 52 22, 34 44, 24 72',
  'M130 10 C 148 22, 166 44, 176 72',
  'M26 58 C 12 76, 6 100, 12 124',
  'M174 58 C 188 76, 194 100, 188 124',
  'M100 2 C 100 -6, 100 -10, 100 -14',
  'M56 188 C 50 196, 46 202, 44 208',
  'M144 188 C 150 196, 154 202, 156 208',
] as const;

/* ---------------- component ---------------- */

export default function AiOrb({ isSpeaking = false, isThinking = false, size = 212, persona = 'unique' }: AiOrbProps) {
  const state = isSpeaking ? 'speaking' : isThinking ? 'thinking' : 'idle';
  const avatarSrc = persona === 'uniqa' ? AVATAR_UNIQA : AVATAR_UNIQUE;
  const sparks = persona === 'uniqa' ? SPARKS_UNIQA : SPARKS;
  const mouth = MOUTH_SRC[persona];
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
      className={`ai-orb ai-orb-${state} ai-orb-${persona}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={persona === 'uniqa' ? 'یونیکا — Unique AI' : 'یونیک — Unique AI'}
    >
      {persona === 'uniqa' && (
        <span className="ai-orb-hair" aria-hidden="true">
          <svg viewBox="0 0 200 200">
            <defs>
              <linearGradient id="uniqa-hair-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#67e8f9" />
                <stop offset="55%" stopColor="#22d3ee" />
                <stop offset="100%" stopColor="#0ea5e9" />
              </linearGradient>
            </defs>
            <g fill="none" stroke="url(#uniqa-hair-grad)" strokeLinecap="round">
              {HAIR_STRANDS.map((d, i) => (
                <path key={i} className="ai-orb-hair-strand" d={d} />
              ))}
            </g>
          </svg>
        </span>
      )}
      <span className="ai-orb-ring" aria-hidden="true" />
      <span className="ai-orb-ring2" aria-hidden="true" />
      <span className="ai-orb-core" aria-hidden="true">
        <span className="ai-orb-photo">
          <span className="ai-orb-frame" style={frameStyle}>
            <img src={avatarSrc} alt="" draggable={false} />
          </span>
          <span className="ai-orb-lips" style={mouthStyle(persona)}>
            <span
              className="ai-orb-frame ai-orb-lips-frame"
              style={{ ...frameStyle, transformOrigin: `${mouth.x * 100}% ${mouth.y * 100}%` }}
              ref={lipsFrameRef}
            >
              <img src={avatarSrc} alt="" draggable={false} />
            </span>
          </span>
        </span>
        <span className="ai-orb-glass" aria-hidden="true" />
      </span>
      <span className="ai-orb-halo" aria-hidden="true" />
      <span className="ai-orb-shimmer" aria-hidden="true" />
      {sparks.map((sp, i) => (
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
