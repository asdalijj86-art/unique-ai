/**
 * SilhouetteAvatar — Uniqa's new front avatar (user order 2026-11-28,
 * from his Stonic screenshot 1000051843_0_eumi.jpg).
 *
 * A glowing teal FACELESS female silhouette — long flowing hair, head
 * + shoulders — drawn entirely by us as SVG paths + gradients. NEVER
 * Stonic's assets (closed code), never a fetched image, never a face:
 * no eyes, no mouth, no features at all.
 *
 * The look (matching the reference, 2026-11-28 fix): the head itself
 * is DARK teal — the face is a shadow, not a light — rimmed by a
 * soft cyan glow, while the hair is WISPY: separate flowing locks
 * with dark gaps between them, sweeping out to both sides and over
 * the shoulders. Wide shoulders anchor the bottom of the frame.
 *
 * She MOVES, gently and continuously (pure CSS animation, see
 * .usil-* in index.css): slow breathing glow (~6s), hair swaying
 * softly (three locks, staggered 7–9.5s), a faint shimmer sweep,
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
        {/* The head is a SHADOW (dark teal), not a light — the glow
            lives in the hair around it, exactly like the reference. */}
        <linearGradient id="usil-face" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#155e75" />
          <stop offset="55%" stopColor="#0e3a4d" />
          <stop offset="100%" stopColor="#082a3a" />
        </linearGradient>
        <linearGradient id="usil-shimmer" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="50%" stopColor="#ecfeff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <clipPath id="usil-clip">
          <path d="M52 322 C64 306 76 282 84 252 C96 210 92 166 104 128 C118 84 150 52 196 44 C224 52 244 70 260 94 C278 122 282 158 290 194 C296 220 292 248 300 274 C308 300 326 318 348 322 C346 288 318 252 282 232 C256 220 232 211 218 200 L186 200 C172 210 148 219 122 232 C84 252 56 288 52 340 Z" />
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
        {/* Back hair — SEPARATE flowing locks with dark gaps between
            them (wispy, not one solid mass). Outer locks sway slowest. */}
        <g className="usil-sway-c" filter="url(#usil-soft2)" opacity="0.8">
          <path
            d="M196 44 C150 52 118 84 104 128 C92 166 96 210 84 252 C76 282 64 306 52 322 C74 318 92 300 100 274 C108 248 104 220 110 194 C118 158 122 122 140 94 C156 70 176 52 196 44 Z"
            fill="url(#usil-hair)"
          />
          <path
            d="M204 44 C250 52 282 84 296 128 C308 166 304 210 316 252 C324 282 336 306 348 322 C326 318 308 300 300 274 C292 248 296 220 290 194 C282 158 278 122 260 94 C244 70 224 52 204 44 Z"
            fill="url(#usil-hair)"
          />
        </g>
        <g className="usil-sway-c" filter="url(#usil-soft)">
          <path
            d="M196 44 C150 52 118 84 104 128 C92 166 96 210 84 252 C76 282 64 306 52 322 C74 318 92 300 100 274 C108 248 104 220 110 194 C118 158 122 122 140 94 C156 70 176 52 196 44 Z"
            fill="url(#usil-hair)"
            opacity="0.9"
          />
          <path
            d="M204 44 C250 52 282 84 296 128 C308 166 304 210 316 252 C324 282 336 306 348 322 C326 318 308 300 300 274 C292 248 296 220 290 194 C282 158 278 122 260 94 C244 70 224 52 204 44 Z"
            fill="url(#usil-hair)"
            opacity="0.9"
          />
        </g>

        {/* Wide shoulders — the anchor at the bottom of the frame. */}
        <path
          d="M52 340 C56 288 84 252 122 232 C148 219 172 210 186 200 L218 200 C232 211 256 220 282 232 C318 252 346 288 350 340 Z"
          fill="url(#usil-hair)"
          opacity="0.95"
        />
        {/* Bright collarbone edge along the top of the shoulders. */}
        <path
          d="M122 232 C148 219 172 210 186 200 L218 200 C232 211 256 220 282 232"
          fill="none"
          stroke="#a5f3fc"
          strokeWidth="2"
          opacity="0.6"
          strokeLinecap="round"
        />

        {/* Neck (dark, short, behind the head). */}
        <path
          d="M188 168 L187 200 C187 212 194 220 202 220 C210 220 216 212 216 200 L215 167 Z"
          fill="url(#usil-face)"
        />

        {/* Glowing rim behind the head — the light that outlines her. */}
        <g filter="url(#usil-soft2)" opacity="0.9">
          <path
            d="M200 38 C232 38 254 66 253 104 C252 138 238 166 214 176 C200 181 184 178 174 166 C158 148 150 122 152 96 C154 64 170 38 200 38 Z"
            fill="#22d3ee"
          />
        </g>
        {/* The head itself — smooth, DARK, FACELESS: no eyes, no
            mouth, no features. The light is around her, not on her. */}
        <path
          d="M200 46 C228 46 248 72 247 106 C246 136 234 160 214 169 C202 174 188 171 179 160 C165 144 158 120 160 96 C162 68 176 46 200 46 Z"
          fill="url(#usil-face)"
          stroke="#67e8f9"
          strokeWidth="1.6"
          strokeOpacity="0.75"
        />
        {/* Crown — hair falling over the top of the head, with side
            falls that frame the dark face. */}
        <path
          d="M200 36 C172 36 152 58 148 90 C147 104 149 118 148 132 C156 116 158 96 168 80 C178 66 188 58 200 56 C214 58 226 68 234 84 C242 100 244 118 252 132 C252 116 254 100 250 84 C242 54 224 36 200 36 Z"
          fill="url(#usil-hair)"
        />

        {/* Front hair locks over the shoulders — each sways on its
            own slow rhythm, with a dark gap between lock and body. */}
        <g className="usil-sway-a">
          <path
            d="M182 60 C158 84 146 118 144 156 C142 192 150 226 142 258 C138 280 128 300 116 314 C134 310 148 292 154 268 C160 242 154 212 158 184 C162 150 168 118 182 92 C186 80 186 68 182 60 Z"
            fill="url(#usil-hair)"
          />
        </g>
        <g className="usil-sway-b">
          <path
            d="M218 60 C242 84 254 118 256 156 C258 192 250 226 258 258 C262 280 272 300 284 314 C266 310 252 292 246 268 C240 242 246 212 242 184 C238 150 232 118 218 92 C214 80 214 68 218 60 Z"
            fill="url(#usil-hair)"
          />
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
