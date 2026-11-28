/**
 * SilhouetteAvatar — Uniqa's new front avatar (user order 2026-11-28,
 * from his Stonic screenshot 1000051843_0_eumi.jpg).
 *
 * A FAINT, misty teal silhouette — head + shoulders dissolving into
 * soft smoke. Drawn entirely by us as SVG paths + gradients. NEVER
 * Stonic's assets (closed code), never a fetched image, never a face:
 * no eyes, no mouth, no features at all.
 *
 * The look (matching the reference EXACTLY — mist redraws 2026-11-28):
 * the figure is a LUMINOUS CLOUD sculpted from overlapping soft
 * ellipses: crown, a LONG left fall in a clear vertical column, a
 * shorter right fall, full back — the falls are denser columns
 * INSIDE one cloud, no dark gaps between them, never separate
 * locks. Thin light strands fan from the crown down both sides and
 * show the direction of the flow. The face is SOFTLY LIT — a gentle
 * glow, slightly brighter than the hair around it, tilted slightly,
 * a touch higher so the hair has room to flow below it, rimmed by
 * ONE faint arc of light on its upper edge and a soft dark rim under
 * the chin. (v4's mistake, found in a side-by-side: the face was a
 * DARK patch, a black hole in the mist, and the hair was too faint
 * and too short — from the user's eyes it matched nothing at all.
 * v5 removed the dark patch; v6 rebuilt the hair as overlapping
 * ellipses; v7 narrowed the falls into vertical columns and lifted
 * the face.) The shoulders are wide and soft and fade out at the
 * bottom, with a brighter band along their top edge where the mist
 * catches the light. If it looks faint, THAT IS THE REFERENCE —
 * never sharpen it, never add definition to "help".
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
          <stop offset="0%" stopColor="#cffafe" stopOpacity="0.75" />
          <stop offset="45%" stopColor="#67e8f9" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#155e75" stopOpacity="0.28" />
        </linearGradient>
        {/* The face is SOFTLY LIT in the reference — a gentle glow,
            never a dark hole. Pale at the top, fading down. */}
        <linearGradient id="usil-face-glow" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#cffafe" stopOpacity="0.55" />
          <stop offset="55%" stopColor="#67e8f9" stopOpacity="0.38" />
          <stop offset="100%" stopColor="#155e75" stopOpacity="0.22" />
        </linearGradient>
        <linearGradient id="usil-mist-fade" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.40" />
          <stop offset="70%" stopColor="#155e75" stopOpacity="0.20" />
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
          {/* Hair — a flowing mist mass: crown, a LONG left fall in
              a clear vertical column, a shorter right fall, full
              back. The falls are denser columns INSIDE one cloud —
              no dark gaps between them, never separate locks. */}
          <g fill="url(#usil-mist-body)" filter="url(#usil-mist)" opacity="0.95">
            <ellipse cx="200" cy="50" rx="70" ry="32" />
            <ellipse cx="140" cy="98" rx="38" ry="54" transform="rotate(16 140 98)" />
            <ellipse cx="104" cy="170" rx="30" ry="62" transform="rotate(12 104 170)" />
            <ellipse cx="78" cy="248" rx="24" ry="56" transform="rotate(10 78 248)" />
            <ellipse cx="260" cy="100" rx="34" ry="50" transform="rotate(-14 260 100)" />
            <ellipse cx="280" cy="166" rx="26" ry="48" transform="rotate(-10 280 166)" />
            <ellipse cx="288" cy="222" rx="22" ry="36" transform="rotate(-8 288 222)" />
            <ellipse cx="200" cy="128" rx="66" ry="88" />
          </g>
          {/* Fine strands — thin light streaks fanning from the crown
              down both sides, like the reference's flowing hair.
              Same mist family, no dark gaps, never separate locks. */}
          <g fill="none" strokeLinecap="round" filter="url(#usil-mist)">
            <path d="M192 52 C150 80 118 130 100 190 C86 238 72 268 62 296" stroke="#cffafe" strokeWidth="10" opacity="0.40" />
            <path d="M186 48 C140 90 104 150 84 220 C72 258 60 286 52 306" stroke="#cffafe" strokeWidth="7" opacity="0.30" />
            <path d="M206 58 C170 100 140 160 122 224 C112 254 102 276 94 292" stroke="#67e8f9" strokeWidth="6" opacity="0.28" />
            <path d="M214 62 C180 96 150 150 132 210 C122 240 112 260 104 276" stroke="#a5f3fc" strokeWidth="7" opacity="0.30" />
            <path d="M232 72 C252 108 264 150 268 196" stroke="#a5f3fc" strokeWidth="6" opacity="0.26" />
            <path d="M222 60 C246 92 262 130 270 172 C274 196 274 214 270 230" stroke="#cffafe" strokeWidth="5" opacity="0.24" />
            <path d="M176 54 C140 84 116 126 102 176 C92 212 82 244 72 268" stroke="#a5f3fc" strokeWidth="4" opacity="0.26" />
          </g>

          {/* Shoulders — wide, soft, gently draped, fading out. */}
          <path
            d="M44 340 C52 296 86 260 124 242 C150 230 172 222 190 216 L212 216 C232 222 254 230 280 242 C316 260 348 296 356 340 Z"
            fill="url(#usil-mist-fade)"
            filter="url(#usil-mist)"
            opacity="0.95"
          />
          {/* Brighter band along the top edge of the shoulders,
              like the reference — the mist catches the light there. */}
          <ellipse cx="200" cy="232" rx="130" ry="16" fill="#a5f3fc" opacity="0.30" filter="url(#usil-mist-soft)" />

          {/* The face — SOFTLY LIT, like the reference: a gentle
              glow, never a dark hole. FACELESS: no eyes, no mouth,
              no features. Tilted slightly, a touch higher so the
              hair has room to flow below it. A soft dark rim under
              the chin keeps the oval nestled in the hair. */}
          <ellipse
            cx="204"
            cy="100"
            rx="34"
            ry="46"
            fill="url(#usil-face-glow)"
            filter="url(#usil-mist-head)"
            transform="rotate(-8 204 100)"
          />
          <path
            d="M172 130 C184 148 200 154 220 148 C234 142 242 130 244 118"
            fill="none"
            stroke="#06222e"
            strokeWidth="6"
            strokeLinecap="round"
            opacity="0.35"
            filter="url(#usil-mist-head)"
            transform="rotate(-8 204 100)"
          />
          {/* One faint rim of light along the upper edge of the head. */}
          <path
            d="M166 74 C176 52 192 42 208 42 C228 44 244 58 250 78"
            fill="none"
            stroke="#cffafe"
            strokeWidth="2.5"
            strokeLinecap="round"
            opacity="0.55"
            filter="url(#usil-rim)"
            transform="rotate(-8 204 100)"
          />
        </g>
      </g>
    </svg>
  );
}
