/**
 * SilhouetteAvatar — Uniqa's new front avatar (user order 2026-11-28,
 * from his Stonic screenshot 1000051843_0_eumi.jpg).
 *
 * A FAINT, misty teal silhouette — head + shoulders dissolving into
 * soft smoke. Drawn entirely by us as SVG paths + gradients. NEVER
 * Stonic's assets (closed code), never a fetched image, never a face:
 * no eyes, no mouth, no features at all.
 *
 * The look (matching the reference EXACTLY — mist redraw 2026-11-28):
 * the figure is a LOW-OPACITY CLOUD, not a solid shape. Heavy blur
 * everywhere, no hard edge anywhere, no separate locks, no bright
 * core, no sparks, no shimmer. The head is a soft DARK patch inside
 * the mist, tilted slightly, rimmed by ONE faint arc of light on its
 * upper edge. The hair is ONE flowing mist mass sweeping down the
 * left side, with a softer fall on the right. The shoulders are wide
 * and soft and fade out at the bottom of the frame. Brightest wisp
 * is about 40% opacity. If it looks faint, THAT IS THE REFERENCE —
 * never sharpen it, never add definition to "help". (The 2026-11-28
 * locks redraw went the wrong way: five versions of ever clearer
 * separate locks, while the reference has no locks at all — only
 * mist. This version removes them entirely.)
 *
 * She MOVES, gently and continuously (pure CSS animation, see
 * .usil-* in index.css): slow breathing glow (~7s) and one slow
 * drift of the whole mist (~11s). Never fast, never distracting.
 * While she speaks the glow pulses a little faster.
 * prefers-reduced-motion stills her.
 */

export default function SilhouetteAvatar({
  isSpeaking,
  terminated,
}: {
  isSpeaking: boolean;
  terminated: boolean;
}) {
  return (
    <svg
      className={`usil-svg${isSpeaking ? ' speaking' : ''}${terminated ? ' terminated' : ''}`}
      viewBox="20 20 360 320"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="یونیکا — ہلکی سی دھند جیسی سلیوٹ"
      data-testid="silhouette-avatar"
    >
      <defs>
        <radialGradient id="usil-mist-glow" cx="50%" cy="36%" r="65%">
          <stop offset="0%" stopColor="#9be9f5" stopOpacity="0.34" />
          <stop offset="50%" stopColor="#22d3ee" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#0e7490" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="usil-mist-body" x1="0%" y1="0%" x2="30%" y2="100%">
          <stop offset="0%" stopColor="#cffafe" stopOpacity="0.62" />
          <stop offset="45%" stopColor="#67e8f9" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#155e75" stopOpacity="0.2" />
        </linearGradient>
        <linearGradient id="usil-mist-fade" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.48" />
          <stop offset="70%" stopColor="#155e75" stopOpacity="0.24" />
          <stop offset="100%" stopColor="#155e75" stopOpacity="0" />
        </linearGradient>
        <filter id="usil-mist" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
        <filter id="usil-mist-soft" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
        <filter id="usil-mist-head" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <filter id="usil-rim" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
      </defs>

      {/* Faint breathing halo behind her — barely there, like the reference. */}
      <ellipse className="usil-halo" cx="200" cy="165" rx="150" ry="155" fill="url(#usil-mist-glow)" />

      <g className="usil-breathe">
        {/* The whole mist drifts as ONE cloud — never separate locks. */}
        <g className="usil-drift">
          {/* Hair — ONE flowing mist mass, LEFT-HEAVY like the
              reference: a long sweep down the left side past the
              shoulder, a shorter fall on the right. No separate
              locks, no gaps — one cloud. */}
          <path
            d="M200 34 C158 38 126 64 110 104 C98 138 84 184 70 224 C58 258 48 288 44 310 C66 304 88 290 100 264 C112 238 116 206 124 176 C132 146 142 118 162 96 C174 80 186 64 200 58 C220 62 238 78 250 100 C260 120 264 146 266 172 C268 196 264 214 256 228 C268 226 278 210 282 190 C288 164 284 134 272 108 C260 84 244 34 200 34 Z"
            fill="url(#usil-mist-body)"
            filter="url(#usil-mist)"
            opacity="0.9"
          />
          {/* Smoke texture — a few lighter wisps inside the cloud,
              following the left sweep, never gaps, never locks. */}
          <ellipse cx="108" cy="172" rx="28" ry="70" fill="#a5f3fc" opacity="0.30" filter="url(#usil-mist-soft)" transform="rotate(16 108 172)" />
          <ellipse cx="262" cy="140" rx="22" ry="48" fill="#a5f3fc" opacity="0.22" filter="url(#usil-mist-soft)" transform="rotate(-12 262 140)" />
          <ellipse cx="196" cy="64" rx="46" ry="22" fill="#cffafe" opacity="0.30" filter="url(#usil-mist-soft)" />
          <ellipse cx="72" cy="262" rx="24" ry="42" fill="#67e8f9" opacity="0.22" filter="url(#usil-mist-soft)" transform="rotate(16 72 262)" />

          {/* Flow streaks — wide, soft, bright strands INSIDE the
              mist that show the hair flowing down the left side,
              like the reference. Same mist family, no dark gaps
              between them, never separate locks. */}
          <g fill="none" strokeLinecap="round" filter="url(#usil-mist)">
            <path d="M192 52 C150 80 118 130 100 190 C86 236 74 262 66 284" stroke="#cffafe" strokeWidth="12" opacity="0.30" />
            <path d="M214 62 C180 96 150 150 132 210 C122 240 112 258 104 272" stroke="#a5f3fc" strokeWidth="9" opacity="0.24" />
            <path d="M232 72 C252 108 264 150 268 196" stroke="#a5f3fc" strokeWidth="8" opacity="0.20" />
          </g>

          {/* Shoulders — wide, soft, gently draped, fading out. */}
          <path
            d="M44 340 C52 296 86 260 124 242 C150 230 172 222 190 216 L212 216 C232 222 254 230 280 242 C316 260 348 296 356 340 Z"
            fill="url(#usil-mist-fade)"
            filter="url(#usil-mist)"
            opacity="0.95"
          />

          {/* The head — a soft DARK patch inside the mist, tilted
              slightly, FACELESS: no eyes, no mouth, no features. */}
          <ellipse
            cx="204"
            cy="108"
            rx="38"
            ry="50"
            fill="#07222e"
            opacity="0.38"
            filter="url(#usil-mist-head)"
            transform="rotate(-8 204 108)"
          />
          {/* One faint rim of light along the upper edge of the head. */}
          <path
            d="M166 82 C176 60 192 50 208 50 C228 52 244 66 250 86"
            fill="none"
            stroke="#cffafe"
            strokeWidth="2.5"
            strokeLinecap="round"
            opacity="0.55"
            filter="url(#usil-rim)"
            transform="rotate(-8 204 108)"
          />
        </g>
      </g>
    </svg>
  );
}
