/**
 * CabinRobot — the little robot-BOY who lives in each office cabin
 * (user's exact spec, 2026-10-23 21:43: «اس کے اندر چھوٹے چھوٹے
 * روبوٹ بھی ہونے چاہیے، لڑکے بنے ہوئے — وہ چلتے پھرتے نظر آئیں کام
 * کرنے کے لیے، ایک دوسرے کو فائل [دیتے نظر آئیں]»).
 *
 * ONE inline SVG (no image assets — smooth on a low-end Chromebook),
 * defined once as a markup string so the React cabins AND the
 * imperative file-flight traveler render the identical boy: round
 * head, antenna, blinking eyes, a smile, little body/arms/legs,
 * tinted per agent (Uniqa's robot is gold). A small badge on the
 * stage keeps the agent's own emoji identity beside him.
 *
 * ALL motion is CSS, keyed off the cabin's REAL state classes in
 * index.css (office-cabin-working / -done / -failed, the lit Uniqa
 * corner, the .office-fly-robot traveler) — this figure never
 * invents activity of its own:
 *   idle / rest → breathing sway + blinking eyes only;
 *   working     → pacing steps inside the cabin + typing arms +
 *                 a pulsing chest light (the cabin glows amber);
 *   done        → two brief happy hops, then he settles;
 *   traveling   → the flight executor clones this figure carrying
 *                 the 📄 (see flyFileOnce in AgentTeam.tsx) — driven
 *                 by the same real office-handoff flight plan.
 */

/** Per-agent robot tint (the hub/Unique dispatches in sky blue;
 *  Uniqa's robot is gold-accented like her corner). */
export const ROBOT_TINTS: Record<string, string> = {
  talash: '#38bdf8',
  'khabar-mausam': '#2dd4bf',
  'hisab-kitab': '#a78bfa',
  likhai: '#f472b6',
  media: '#fb923c',
  'quran-namaz': '#34d399',
  builder: '#fbbf24',
  uniqa: '#fde047',
  hub: '#7dd3fc',
};

export function robotTintFor(key: string): string {
  return ROBOT_TINTS[key] || '#a78bfa';
}

/** The robot-boy figure as an SVG markup string. Class hooks
 *  (robot-fig / robot-eyes / robot-arm-l …) are what index.css
 *  animates per state — keep them in sync. */
export function robotSVG(tint: string): string {
  return `<svg class="cabin-robot-svg" viewBox="0 0 64 78" fill="none" aria-hidden="true" focusable="false">`
    + `<g class="robot-fig">`
    + `<line x1="32" y1="8" x2="32" y2="13" stroke="${tint}" stroke-width="2" stroke-linecap="round"/>`
    + `<circle class="robot-antenna-ball" cx="32" cy="5.5" r="3" fill="${tint}"/>`
    + `<rect x="9" y="22" width="4.5" height="9" rx="2.25" fill="${tint}" opacity=".5"/>`
    + `<rect x="50.5" y="22" width="4.5" height="9" rx="2.25" fill="${tint}" opacity=".5"/>`
    + `<g class="robot-arm robot-arm-l"><rect x="12" y="43" width="5.5" height="15" rx="2.75" fill="#22355c" stroke="${tint}" stroke-opacity=".5"/><circle cx="14.75" cy="59.5" r="2.9" fill="${tint}" opacity=".65"/></g>`
    + `<g class="robot-arm robot-arm-r"><rect x="46.5" y="43" width="5.5" height="15" rx="2.75" fill="#22355c" stroke="${tint}" stroke-opacity=".5"/><circle cx="49.25" cy="59.5" r="2.9" fill="${tint}" opacity=".65"/></g>`
    + `<g class="robot-leg robot-leg-l"><rect x="24" y="58" width="6.5" height="12" rx="3" fill="#22355c" stroke="${tint}" stroke-opacity=".4"/><rect x="22.5" y="69" width="9.5" height="3.6" rx="1.8" fill="${tint}" opacity=".55"/></g>`
    + `<g class="robot-leg robot-leg-r"><rect x="33.5" y="58" width="6.5" height="12" rx="3" fill="#22355c" stroke="${tint}" stroke-opacity=".4"/><rect x="32" y="69" width="9.5" height="3.6" rx="1.8" fill="${tint}" opacity=".55"/></g>`
    + `<rect x="19" y="41" width="26" height="18" rx="6.5" fill="#1b2c4e" stroke="${tint}" stroke-width="1.4"/>`
    + `<circle class="robot-chest" cx="32" cy="50" r="3.4" fill="${tint}"/>`
    + `<rect x="29" y="38.5" width="6" height="3.5" fill="#24365a"/>`
    + `<rect x="14" y="12" width="36" height="27" rx="10" fill="#17263f" stroke="${tint}" stroke-width="1.6"/>`
    + `<rect x="18.5" y="17" width="27" height="17" rx="6" fill="#0a1526"/>`
    + `<g class="robot-eyes"><circle cx="26.5" cy="24.5" r="2.7" fill="${tint}"/><circle cx="37.5" cy="24.5" r="2.7" fill="${tint}"/></g>`
    + `<path d="M28.5 30 Q32 32.8 35.5 30" stroke="${tint}" stroke-width="1.6" stroke-linecap="round"/>`
    + `</g></svg>`;
}

/** The cabin's robot, rendered from the same markup string the
 *  flight traveler uses — one boy, everywhere. The string is a
 *  local constant (built from a fixed palette + the agent tint),
 *  never user input. */
export function CabinRobot({ tint }: { tint: string }) {
  return (
    <span
      className="cabin-robot"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: robotSVG(tint) }}
    />
  );
}
