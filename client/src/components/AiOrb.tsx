/**
 * AiOrb — the center hero avatar for the Jarvis-style interface.
 * A futuristic glowing AI orb (NOT a human photo): rotating conic ring,
 * layered glass core, orbiting particles and a breathing inner light.
 * States: idle (calm), thinking (faster, violet), speaking (bright pulse).
 */

type AiOrbProps = {
  isSpeaking?: boolean;
  isThinking?: boolean;
  size?: number;
};

/**
 * Sparkling lights dancing around the globe's edge — gold, cyan and white
 * twinkles with staggered timing so the orb shimmers and catches the eye.
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

export default function AiOrb({ isSpeaking = false, isThinking = false, size = 190 }: AiOrbProps) {
  const state = isSpeaking ? 'speaking' : isThinking ? 'thinking' : 'idle';
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
        <span className="ai-orb-nucleus" aria-hidden="true" />
        <span className="ai-orb-particle p1" aria-hidden="true" />
        <span className="ai-orb-particle p2" aria-hidden="true" />
        <span className="ai-orb-particle p3" aria-hidden="true" />
        <svg className="ai-orb-arcs" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="38" fill="none" strokeWidth="1.4" strokeDasharray="40 26" className="arc a1" />
          <circle cx="50" cy="50" r="30" fill="none" strokeWidth="1.1" strokeDasharray="22 30" className="arc a2" />
        </svg>
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
