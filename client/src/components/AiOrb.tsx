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
    </div>
  );
}
