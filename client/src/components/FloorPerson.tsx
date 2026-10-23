/**
 * FloorPerson — the CARTOON HUMAN characters who live on the office
 * floor (user orders, 2026-10-23 23:43: «یہ روبوٹ نہیں — کارٹون
 * لگاؤ، انسان جیسے دکھائی دیں، خوبصورت چہرے ہوں» — the robots are
 * GONE; the round-3/4 robot-boys are retired). Like the people in
 * his reference video: chibi figures with round faces, big friendly
 * eyes, hair, colored clothes, little legs and arms.
 *
 * رنگ و وردی (user decision, 2026-10-24 00:03):
 *  - the whole office wears ONE color family — Unique AI's own
 *    blue/violet brand — so all SEVEN agents wear the SAME office
 *    uniform: navy blazer + white shirt + violet tie + dark
 *    trousers. An agent's individuality is ONLY his face, his hair
 *    and his name label.
 *  - یونیک the BOSS keeps a distinct boss look in the same family:
 *    a deeper-blue suit, violet tie and a pocket square.
 *  - یونیکا the MANAGER is a GIRL: long hair, a gold hair band,
 *    a gold-accented outfit — her golden distinction, present on
 *    the floor only while she is summoned (FloorScene's rule).
 *
 * ONE inline SVG per character (no image assets — smooth on a
 * low-end Chromebook), defined once as a markup string so every
 * render of a character is the identical figure. Class hooks
 * (person-fig / person-eyes / person-arm-l …) are what index.css
 * animates per state — the figure never invents activity:
 *   idle / rest → breathing sway + blinking eyes only;
 *   working     → typing arms AT his computer + amber ring
 *                 (the scene's real AgentTaskState);
 *   walking     → leg-swing gait (+ 📄 in hand only on a REAL
 *                 office-handoff flight);
 *   done        → two brief happy hops, then he settles.
 */

export type HairStyle =
  | 'wavy'    // boss: dark wavy hair
  | 'long'    // Uniqa: long girl's hair
  | 'side'    // دانیال: neat side-part
  | 'wave'    // حسن: soft dark-brown wave
  | 'curly'   // عمر: tight curls
  | 'fringe'  // علی: swept fringe
  | 'spiky'   // حمزہ: spiky top
  | 'cap'     // یوسف: short hair + white prayer cap
  | 'buzz';   // احمد: short buzz with a tiny fringe

export interface PersonDef {
  skin: string;
  hair: string;
  style: HairStyle;
  /** 'uniform' = the shared office uniform (all 7 agents);
   *  'boss' / 'manager' = the hosts' distinct looks. */
  outfit: 'uniform' | 'boss' | 'manager';
}

/** The cast. The uniform is IDENTICAL for every agent — only skin,
 *  hair color and hair style differ (plus یوسف's white cap). */
const UNIFORM = { blazer: '#2b3a6e', shirt: '#f4f7ff', tie: '#7c3aed', trousers: '#232c49' };

export const PERSON_DEFS: Record<string, PersonDef> = {
  unique: { skin: '#f0bd8d', hair: '#241a12', style: 'wavy', outfit: 'boss' },
  uniqa: { skin: '#f6cfa3', hair: '#3a2415', style: 'long', outfit: 'manager' },
  talash: { skin: '#f0bd8d', hair: '#181410', style: 'side', outfit: 'uniform' },
  'khabar-mausam': { skin: '#e8b184', hair: '#4a2c17', style: 'wave', outfit: 'uniform' },
  'hisab-kitab': { skin: '#d99e6f', hair: '#14100d', style: 'curly', outfit: 'uniform' },
  likhai: { skin: '#f4c491', hair: '#5b3a1e', style: 'fringe', outfit: 'uniform' },
  media: { skin: '#eec09a', hair: '#6e2f16', style: 'spiky', outfit: 'uniform' },
  'quran-namaz': { skin: '#e2a878', hair: '#1c1712', style: 'cap', outfit: 'uniform' },
  builder: { skin: '#dda26e', hair: '#33241a', style: 'buzz', outfit: 'uniform' },
};

export function personDefFor(key: string): PersonDef {
  return PERSON_DEFS[key] || PERSON_DEFS.talash;
}

/** Hair shapes (drawn over the head circle, cx≈32, top≈11). */
function hairPath(style: HairStyle, hair: string): string {
  switch (style) {
    case 'wavy':
      return `<path d="M17.5 26 C15.8 15.5 22.5 9.6 32 9.6 C41.5 9.6 48.2 15.5 46.5 26 C44.8 20.8 42.6 18.9 39.8 19.6 C38.4 16.8 35.6 15.6 32.6 16.6 C29.4 14.9 25.8 15.9 24 18.6 C21.2 18.1 19.1 20.6 17.5 26 Z" fill="${hair}"/>`;
    case 'long':
      // Back hair is drawn separately (behind the body); this is
      // the top + side sweep with a center part.
      return `<path d="M17 27 C15.6 15.8 22.8 9.8 32 9.8 C41.2 9.8 48.4 15.8 47 27 C45.4 21.2 43.4 18.4 40.6 17.9 C38.2 15 35 14.4 32 16.4 C29 14.4 25.8 15 23.4 17.9 C20.6 18.4 18.6 21.2 17 27 Z" fill="${hair}"/>`
        + `<path d="M17.6 18.4 C23 12.4 41 12.4 46.4 18.4" stroke="#fbbf24" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
    case 'side':
      return `<path d="M17.5 25.5 C16.2 15.8 23 10 32 10 C41 10 47.8 15.8 46.5 25.5 C45 19.4 41 16.9 34.5 17.2 C26.5 17.5 19.8 19.6 17.5 25.5 Z" fill="${hair}"/>`
        + `<path d="M38 12.2 C33 15.5 26 17 19.5 21.5" stroke="rgba(255,255,255,.16)" stroke-width="2" fill="none" stroke-linecap="round"/>`;
    case 'wave':
      return `<path d="M17.5 25.5 C16 16 22.8 10.2 32 10.2 C41.2 10.2 48 16 46.5 25.5 C45.2 20.4 42.8 18.6 39.6 19.2 C38.6 16.4 35.4 15.5 32.4 17 C29.6 15.4 26.2 16.2 24.6 18.9 C21.6 18.6 19 20.7 17.5 25.5 Z" fill="${hair}"/>`;
    case 'curly':
      return `<g fill="${hair}"><circle cx="21" cy="19" r="4.6"/><circle cx="26.5" cy="14.8" r="5"/><circle cx="32.5" cy="13.6" r="5.2"/><circle cx="38.5" cy="14.8" r="5"/><circle cx="43.5" cy="19" r="4.6"/><rect x="17" y="18" width="30" height="7" rx="3.5"/></g>`;
    case 'fringe':
      return `<path d="M17.5 26.5 C16.4 16.2 23.4 10.4 32 10.4 C40.6 10.4 47.6 16.2 46.5 26.5 C42 20.5 34 18.8 26.5 20.6 C22.4 21.6 19.2 23.4 17.5 26.5 Z" fill="${hair}"/>`;
    case 'spiky':
      return `<path d="M18 25 L19.5 15.5 L23.5 19.5 L26 11.5 L30.5 17.5 L34 10.5 L37 17 L41 12 L43.5 19 L46.5 16 L46 25 C40 19.8 24 19.8 18 25 Z" fill="${hair}"/>`;
    case 'cap':
      return `<path d="M19 22.5 C20 15.5 25 11.8 32 11.8 C39 11.8 44 15.5 45 22.5 L42.5 22.5 C41 17.8 37 15.6 32 15.6 C27 15.6 23 17.8 21.5 22.5 Z" fill="${hair}"/>`
        + `<path d="M18.6 15.8 C21.5 11.4 26.4 9.4 32 9.4 C37.6 9.4 42.5 11.4 45.4 15.8 C42.5 14.2 37.5 13.4 32 13.4 C26.5 13.4 21.5 14.2 18.6 15.8 Z" fill="#f8fafc"/>`
        + `<ellipse cx="32" cy="11.6" rx="10.5" ry="2.4" fill="#eef2f7"/>`;
    case 'buzz':
      return `<path d="M18.5 23.5 C17.6 16.4 23.8 11.4 32 11.4 C40.2 11.4 46.4 16.4 45.5 23.5 C41 18.6 23 18.6 18.5 23.5 Z" fill="${hair}"/>`;
  }
}

/** The chibi human figure as an SVG markup string. Class hooks
 *  (person-fig / person-eyes / person-arm-l …) are what index.css
 *  animates per state — keep them in sync. ViewBox matches the old
 *  figure's footprint so floor anchoring is unchanged. */
export function personSVG(def: PersonDef): string {
  const { skin, hair, style, outfit } = def;
  const isGirl = outfit === 'manager';
  const blazer = outfit === 'boss' ? '#1d3160' : outfit === 'manager' ? '#7a5b16' : UNIFORM.blazer;
  const shirt = outfit === 'manager' ? '#fff7dd' : UNIFORM.shirt;
  const tie = outfit === 'boss' ? '#8b5cf6' : UNIFORM.tie;
  const trousers = UNIFORM.trousers;
  const backHair = isGirl
    ? `<path d="M16.5 20 C14.8 34 15.8 46 18.6 54 L24 54 C21.5 42 21 30 22.5 21 Z" fill="${hair}"/>`
      + `<path d="M47.5 20 C49.2 34 48.2 46 45.4 54 L40 54 C42.5 42 43 30 41.5 21 Z" fill="${hair}"/>`
    : '';
  return `<svg class="floor-person-svg" viewBox="0 0 64 78" fill="none" aria-hidden="true" focusable="false">`
    + `<g class="person-fig">`
    + backHair
    // legs + shoes
    + `<g class="person-leg person-leg-l"><rect x="24.5" y="57" width="6.4" height="12.5" rx="3" fill="${trousers}"/><rect x="22.8" y="68.6" width="9.6" height="3.8" rx="1.9" fill="#3b2a1a"/></g>`
    + `<g class="person-leg person-leg-r"><rect x="33.1" y="57" width="6.4" height="12.5" rx="3" fill="${trousers}"/><rect x="31.6" y="68.6" width="9.6" height="3.8" rx="1.9" fill="#3b2a1a"/></g>`
    // arms (sleeve + hand), pivoting at the shoulder
    + `<g class="person-arm person-arm-l"><rect x="11.5" y="41" width="6" height="16" rx="3" fill="${blazer}"/><circle cx="14.5" cy="58.5" r="3" fill="${skin}"/></g>`
    + `<g class="person-arm person-arm-r"><rect x="46.5" y="41" width="6" height="16" rx="3" fill="${blazer}"/><circle cx="49.5" cy="58.5" r="3" fill="${skin}"/></g>`
    // torso: blazer with lapels, shirt, tie
    + `<rect x="18.5" y="39" width="27" height="20.5" rx="7" fill="${blazer}"/>`
    + `<path d="M26 39.5 L32 47 L38 39.5 L36.4 39.5 L32 44.6 L27.6 39.5 Z" fill="${shirt}"/>`
    + (isGirl
      ? `<circle cx="32" cy="47.5" r="2.1" fill="#fde047" stroke="#b45309" stroke-width=".7"/><path d="M29.4 41.5 Q32 44 34.6 41.5" stroke="#fde047" stroke-width="1.5" fill="none" stroke-linecap="round"/>`
      : `<path d="M30.9 44.8 L33.1 44.8 L32.6 47 L33.4 53.5 L32 55.4 L30.6 53.5 L31.4 47 Z" fill="${tie}"/>`)
    + (outfit === 'boss' ? `<rect x="38.6" y="48.5" width="4.6" height="3.2" rx="1" fill="#c4b5fd"/>` : '')
    // head: ears, face, features, hair
    + `<g class="person-head">`
    + `<circle cx="16.8" cy="25" r="3" fill="${skin}"/><circle cx="47.2" cy="25" r="3" fill="${skin}"/>`
    + `<circle cx="32" cy="24.5" r="14.8" fill="${skin}"/>`
    + `<ellipse cx="22.6" cy="29.8" rx="2.9" ry="1.9" fill="#f49bb0" opacity=".55"/>`
    + `<ellipse cx="41.4" cy="29.8" rx="2.9" ry="1.9" fill="#f49bb0" opacity=".55"/>`
    + `<g class="person-eyes">`
    + `<ellipse cx="26.3" cy="24.8" rx="2.5" ry="3.1" fill="#ffffff"/><ellipse cx="37.7" cy="24.8" rx="2.5" ry="3.1" fill="#ffffff"/>`
    + `<circle cx="26.5" cy="25.2" r="1.75" fill="#2b1c10"/><circle cx="37.5" cy="25.2" r="1.75" fill="#2b1c10"/>`
    + `<circle cx="27.1" cy="24.4" r=".62" fill="#ffffff"/><circle cx="38.1" cy="24.4" r=".62" fill="#ffffff"/>`
    + `</g>`
    + `<path d="M23.6 20.6 Q26.3 19.2 29 20.4" stroke="${hair}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`
    + `<path d="M35 20.4 Q37.7 19.2 40.4 20.6" stroke="${hair}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`
    + `<path d="M31 28.6 Q32.2 30 30.9 30.9" stroke="rgba(146, 84, 40, .55)" stroke-width="1.1" fill="none" stroke-linecap="round"/>`
    + (isGirl
      ? `<path d="M27.8 33.4 Q32 36.4 36.2 33.4" stroke="#a34a5e" stroke-width="1.9" fill="none" stroke-linecap="round"/><path d="M28.6 33.2 Q32 35 35.4 33.2 Q32 34.1 28.6 33.2 Z" fill="#e2708a"/>`
      : `<path d="M28 33.2 Q32 36 36 33.2" stroke="#8a4b2a" stroke-width="1.8" fill="none" stroke-linecap="round"/>`)
    + hairPath(style, hair)
    + `</g>`
    + `</g></svg>`;
}

/** A floor character, rendered from the shared markup string — one
 *  figure per cast member, everywhere. The string is a local
 *  constant (built from the fixed cast palette), never user input. */
export function FloorPerson({ personKey }: { personKey: string }) {
  return (
    <span
      className="floor-person"
      data-person={personKey}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: personSVG(personDefFor(personKey)) }}
    />
  );
}
