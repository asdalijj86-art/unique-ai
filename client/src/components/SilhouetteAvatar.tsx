/**
 * SilhouetteAvatar — Uniqa's new front avatar (user order 2026-11-28,
 * from his Stonic screenshot 1000051843_0_eumi.jpg).
 *
 * A glowing teal FACELESS female silhouette — long flowing hair, head
 * + shoulders — drawn entirely by us as SVG paths + gradients. NEVER
 * Stonic's assets (closed code), never a fetched image, never a face:
 * no eyes, no mouth, no features at all.
 *
 * The look (matching the reference): the head itself is DARK teal —
 * the face is a shadow, not a light — tilted a few degrees, rimmed
 * by a soft cyan glow, while the hair is WISPY: separate flowing
 * locks with dark gaps between them, sweeping mostly to the LEFT in
 * long S-curves and down past the shoulders, each strand
 * individually visible with a pale edge and soft smoky outline. The
 * locks merge into a soft luminous mass at the crown and separate as
 * they fall. Slim draped shoulders anchor the bottom of the frame.
 * The whole figure is smoky and ethereal — pale wisps on dark teal —
 * NOT one solid bright mass (2026-11-28 redraws: v1 read as a smooth
 * blue hooded blob on his laptop; v2's locks came out straight and
 * comb-like; v3 added curves but they were too gentle to read, so v4
 * re-drew the locks as wide sweeping S-curves with soft edges; v5 cut
 * the right locks shorter for the reference's left-heavy asymmetry,
 * tilted the head a touch more and softened the crown glow).
 *
 * She MOVES, gently and continuously (pure CSS animation, see
 * .usil-* in index.css): slow breathing glow (~6s), hair swaying
 * softly (locks on staggered 7–9.5s rhythms), a faint shimmer sweep,
 * twinkling sparks. Never fast, never distracting. While she speaks
 * the glow pulses a little faster. prefers-reduced-motion stills her.
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
      aria-label="یونیکا — چمکتی ہوئی سلیوٹ"
      data-testid="silhouette-avatar"
    >
      <defs>
        <radialGradient id="usil-glow" cx="50%" cy="38%" r="65%">
          <stop offset="0%" stopColor="#a5f3fc" stopOpacity="0.85" />
          <stop offset="45%" stopColor="#22d3ee" stopOpacity="0.38" />
          <stop offset="100%" stopColor="#0e7490" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="usil-hair" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#67e8f9" />
          <stop offset="45%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#0e7490" />
        </linearGradient>
        {/* The locks are PALE — near-white at the crown fading to
            teal at the tips — so each strand reads against the dark
            gaps between them, like the reference's smoky wisps. */}
        <linearGradient id="usil-lock" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ecfeff" />
          <stop offset="45%" stopColor="#a5f3fc" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
        {/* The head is a SHADOW (dark teal), not a light — the glow
            lives in the hair around it, exactly like the reference. */}
        <linearGradient id="usil-face" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#155e75" />
          <stop offset="55%" stopColor="#0e3a4d" />
          <stop offset="100%" stopColor="#082a3a" />
        </linearGradient>
        {/* Slim draped shoulders — dark teal, never bright cyan. */}
        <linearGradient id="usil-shoulder" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#2a8aa5" />
          <stop offset="55%" stopColor="#14607c" />
          <stop offset="100%" stopColor="#0c3a4e" />
        </linearGradient>
        <linearGradient id="usil-shimmer" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="50%" stopColor="#ecfeff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <clipPath id="usil-clip">
          <path d="M62 340 C68 300 82 258 90 220 C98 182 94 142 108 106 C124 64 158 40 200 38 C244 40 274 64 290 98 C304 128 304 162 308 196 C312 232 324 268 334 300 C338 312 340 326 340 340 Z" />
        </clipPath>
        <filter id="usil-soft" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3.2" />
        </filter>
        <filter id="usil-soft2" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>

      {/* Breathing halo behind her — the slow glow that says alive. */}
      <ellipse className="usil-halo" cx="200" cy="170" rx="150" ry="160" fill="url(#usil-glow)" />

      <g className="usil-breathe">
        {/* Back hair — a SOFT smoky mass behind everything (heavily
            blurred, half transparent): the glow, not a solid shape. */}
        <g className="usil-sway-c" filter="url(#usil-soft2)" opacity="0.5">
          <path
            d="M218 42 C172 46 140 78 130 120 C122 156 130 196 118 232 C110 258 98 282 86 300 C112 296 130 276 138 250 C146 224 142 196 150 168 C160 132 170 100 192 76 C202 64 210 52 218 42 Z"
            fill="url(#usil-hair)"
          />
          <path
            d="M222 42 C264 48 290 78 298 118 C304 152 298 192 306 226 C312 254 322 278 332 296 C310 290 298 268 292 242 C286 216 290 188 282 160 C272 126 254 98 234 76 C228 64 224 52 222 42 Z"
            fill="url(#usil-hair)"
          />
        </g>

        {/* Luminous crown mass — the locks merge into it at the top
            and separate as they fall, so the crown never reads as
            separate fingers. */}
        <ellipse filter="url(#usil-soft2)" opacity="0.35" cx="205" cy="70" rx="70" ry="45" fill="#67e8f9" />

        {/* LEFT locks — separate wispy ribbons sweeping down-left in
            wide S-curves, each with a dark gap to the next, soft
            smoky edges. Drawn BEHIND the head so their roots vanish
            into the crown. */}
        <g className="usil-sway-c" filter="url(#usil-soft)">
          <path
            d="M196 54 C140 70 104 104 92 146 C80 182 98 216 82 250 C70 278 58 306 50 332 C86 308 98 280 108 252 C120 218 106 184 116 148 C126 108 162 72 222 54 L196 54 Z"
            fill="url(#usil-lock)"
            opacity="0.92"
            stroke="#cffafe"
            strokeWidth="1"
            strokeOpacity="0.4"
          />
        </g>
        <g className="usil-sway-a" filter="url(#usil-soft)">
          <path
            d="M206 50 C162 66 134 98 122 136 C112 170 126 202 116 234 C104 266 88 292 78 316 C108 292 124 266 140 236 C152 204 138 172 148 138 C160 100 184 68 228 52 L206 50 Z"
            fill="url(#usil-lock)"
            opacity="0.92"
            stroke="#cffafe"
            strokeWidth="1"
            strokeOpacity="0.4"
          />
        </g>
        <g className="usil-sway-b" filter="url(#usil-soft)">
          <path
            d="M212 54 C188 68 172 96 164 126 C154 156 168 184 156 210 C150 234 150 260 148 284 C170 260 173 234 176 210 C180 184 174 156 180 128 C188 98 204 70 226 56 L212 54 Z"
            fill="url(#usil-lock)"
            opacity="0.92"
            stroke="#cffafe"
            strokeWidth="1"
            strokeOpacity="0.4"
          />
        </g>

        {/* RIGHT locks — shorter, falling over the right shoulder. */}
        <g className="usil-sway-b" filter="url(#usil-soft)">
          <path
            d="M232 56 C256 68 272 92 278 122 C284 150 276 178 282 204 C286 228 290 242 296 252 C300 242 297 228 294 204 C290 178 295 150 290 122 C284 92 268 68 244 56 L232 56 Z"
            fill="url(#usil-lock)"
            opacity="0.92"
            stroke="#cffafe"
            strokeWidth="1"
            strokeOpacity="0.4"
          />
        </g>
        <g className="usil-sway-c" filter="url(#usil-soft)">
          <path
            d="M232 60 C248 74 258 96 262 122 C265 144 260 168 264 190 C266 200 269 208 272 214 C278 204 274 190 272 172 C270 150 274 128 270 108 C266 88 254 70 240 60 L232 60 Z"
            fill="url(#usil-lock)"
            opacity="0.92"
            stroke="#cffafe"
            strokeWidth="1"
            strokeOpacity="0.4"
          />
        </g>

        {/* Slim shoulders — the anchor at the bottom of the frame. */}
        <path
          d="M118 340 C122 302 140 278 166 264 C182 255 196 247 204 236 L230 236 C240 247 254 255 270 264 C296 278 312 302 318 340 Z"
          fill="url(#usil-shoulder)"
          opacity="0.95"
          filter="url(#usil-soft)"
        />
        {/* Bright edge along the top of the shoulders. */}
        <path
          d="M166 264 C182 255 196 247 204 236 L230 236 C240 247 254 255 270 264"
          fill="none"
          stroke="#a5f3fc"
          strokeWidth="1.8"
          opacity="0.55"
          strokeLinecap="round"
        />

        {/* Neck (dark, slim, behind the head). */}
        <path
          d="M204 158 L201 210 C201 228 208 244 217 244 C226 244 232 228 232 210 L230 156 C224 162 210 162 204 158 Z"
          fill="url(#usil-face)"
        />

        {/* Glowing rim behind the head — soft and subtle now, so the
            head reads as a shadow with light around it, not a blob. */}
        <g filter="url(#usil-soft2)" opacity="0.55">
          <path
            d="M218 46 C246 46 265 74 264 108 C263 140 249 164 229 173 C217 178 202 175 192 164 C178 148 172 123 174 98 C176 69 191 46 218 46 Z"
            fill="#22d3ee"
          />
        </g>
        {/* The head itself — smooth, DARK, FACELESS, tilted a few
            degrees like the reference: no eyes, no mouth, no
            features. The light is around her, not on her. */}
        <g transform="rotate(12 218 112)">
          <path
            d="M218 48 C248 48 266 76 265 110 C264 142 250 166 231 175 C220 180 208 177 198 167 C183 151 177 125 179 97 C181 69 196 48 218 48 Z"
            fill="url(#usil-face)"
            stroke="#67e8f9"
            strokeWidth="1.6"
            strokeOpacity="0.75"
          />
          {/* Crown — hair falling over the top of the head, with side
              falls that frame the dark face. */}
          <path
            d="M218 38 C186 38 163 60 155 90 C151 104 153 118 151 132 C159 116 161 95 172 79 C183 63 196 54 210 52 C227 52 242 61 250 77 C258 91 260 110 266 126 C268 111 266 95 260 80 C249 54 235 38 218 38 Z"
            fill="url(#usil-hair)"
          />
        </g>

        {/* Front lock over the left shoulder — falls IN FRONT of the
            shoulder from the jaw, swaying on its own rhythm. */}
        <g className="usil-sway-a" filter="url(#usil-soft)">
          <path
            d="M188 150 C170 174 160 200 156 226 C153 248 146 270 140 290 C158 270 164 248 167 226 C171 200 177 174 191 154 C190 152 189 151 188 150 Z"
            fill="url(#usil-lock)"
            opacity="0.92"
            stroke="#cffafe"
            strokeWidth="1"
            strokeOpacity="0.4"
          />
        </g>

        {/* Hair-thin wisps peeling off the main locks — the finest
            strands, drawn as pale strokes. */}
        <g fill="none" stroke="#cffafe" strokeLinecap="round">
          <g className="usil-sway-a">
            <path d="M202 62 C158 82 118 122 98 172 C86 202 76 222 68 238" strokeWidth="3.5" opacity="0.65" />
            <path d="M212 68 C182 102 162 152 154 202 C150 222 144 242 138 258" strokeWidth="3" opacity="0.6" />
          </g>
          <g className="usil-sway-b">
            <path d="M238 64 C270 92 290 132 298 172 C302 192 308 212 314 228" strokeWidth="3.5" opacity="0.6" />
          </g>
        </g>

        {/* Faint shimmer sweeping across her, clipped to her shape. */}
        <g clipPath="url(#usil-clip)">
          <rect className="usil-shimmer" x="-140" y="0" width="120" height="380" fill="url(#usil-shimmer)" />
        </g>
      </g>

      {/* Twinkling sparks around her. */}
      <g fill="#cffafe">
        <circle className="usil-twinkle" style={{ animationDelay: '0s' }} cx="120" cy="90" r="2.4" />
        <circle className="usil-twinkle" style={{ animationDelay: '0.9s' }} cx="300" cy="70" r="2" />
        <circle className="usil-twinkle" style={{ animationDelay: '1.7s' }} cx="330" cy="200" r="2.6" />
        <circle className="usil-twinkle" style={{ animationDelay: '0.5s' }} cx="86" cy="220" r="1.8" />
        <circle className="usil-twinkle" style={{ animationDelay: '2.2s' }} cx="250" cy="30" r="2" />
        <circle className="usil-twinkle" style={{ animationDelay: '1.2s' }} cx="160" cy="330" r="2.2" />
      </g>
    </svg>
  );
}
