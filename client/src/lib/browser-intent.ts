/**
 * Uniqa's own side browser — intent detector (user order 2026-11-28).
 *
 * When he tells Uniqa to open a site or search something — «یوٹیوب
 * کھولو», «فیس بک کھولو», «ٹک ٹاک کھولو», «گوگل پر موسم تلاش کرو»,
 * «کراچی سرچ کرو» — this parses it into a BrowserRequest the side
 * panel opens at once, in the app, with no new tab and no Gemini
 * quota spent. It reuses the existing site list through
 * parseWebsiteCommand (lib/voice-commands) so a site name resolves
 * exactly the way the old voice commands did.
 *
 * Pure module (no DOM, no storage) — tested by
 * scripts/test-side-browser.mjs with the same esbuild pattern as
 * the decision / study detectors.
 *
 * Boundaries (deliberate, to protect the other local commands):
 * - Site-qualified searches («یوٹیوب پر گانا تلاش کرو») stay with
 *   the brain's youtube_search — only BARE searches come here.
 * - Study-shaped text (کلاس / مضمون / امتحان / اسائنمنٹ …) never
 *   fires — a study question phrased with «تلاش کرو» still reaches
 *   the study flow.
 * - «موسم کیسا ہے؟» and other fact questions have no search/open
 *   verb, so they never fire — the brain answers them as before.
 */

import { parseWebsiteCommand } from './voice-commands';

export type BrowserRequest = {
  /** URL to load in the panel. '' = no page — search/home view. */
  url: string;
  /** Urdu display name, e.g. «یوٹیوب», «گوگل», «براؤزر». */
  displayName: string;
  /** When present the panel opens in search view for this query
   *  ('' = empty search box, e.g. «گوگل کھولو»). */
  searchQuery?: string;
};

/** Quick site chips on the panel's home view. */
export const QUICK_SITES: { url: string; displayName: string }[] = [
  { url: 'https://www.youtube.com', displayName: 'یوٹیوب' },
  { url: 'https://www.facebook.com', displayName: 'فیس بک' },
  { url: 'https://www.tiktok.com', displayName: 'ٹک ٹاک' },
  { url: 'https://www.instagram.com', displayName: 'انسٹاگرام' },
  { url: 'https://www.google.com', displayName: 'گوگل' },
  { url: 'https://ur.wikipedia.org', displayName: 'وکی پیڈیا' },
];

/**
 * Hosts that refuse to render inside another page (X-Frame-Options /
 * CSP frame-ancestors). This is the sites' own policy — no code can
 * change it — so the panel shows the honest blocked message + the
 * one-tap new-tab button for these instead of a blank frame. Only
 * hosts we are SURE about are listed here; anything else is tried
 * in the frame first, and the panel's load timeout offers the same
 * new-tab escape when a page will not load inside.
 */
export const BLOCKED_EMBED_HOSTS: string[] = [
  'youtube.com',
  'youtu.be',
  'facebook.com',
  'instagram.com',
  'tiktok.com',
  'x.com',
  'twitter.com',
  'web.whatsapp.com',
  'mail.google.com',
  'google.com',
  'maps.google.com',
  'drive.google.com',
  'docs.google.com',
  'play.google.com',
  'github.com',
  'chat.openai.com',
  'gemini.google.com',
];

export function isBlockedEmbedUrl(rawUrl: string): boolean {
  let host = '';
  try {
    host = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (host.startsWith('www.')) host = host.slice(4);
  return BLOCKED_EMBED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/** «example.com» → https://example.com; a full URL passes through;
 *  anything with spaces (a search phrase) is not a URL → null. */
export function normalizeBrowserUrl(input: string): string | null {
  const t = String(input || '').trim();
  if (!t || /\s/.test(t)) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/\S*)?$/i.test(t)) return `https://${t}`;
  return null;
}

function normalize(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/[۔؟?!.،,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Study-shaped text must never be stolen by the search patterns.
 *  (2026-11-28: سٹڈی/اسٹڈی were missing, so «سٹڈی کھولو» fell into
 *  the side-browser search instead of Study Studio.) */
const STUDY_GUARD =
  /(کلاس|مضمون|سبق|باب|امتحان|اسائنمنٹ|سوال|پڑھائی|ہوم ورک|کتاب|class|subject|chapter|lesson|exam|assignment|homework|question|study|نصاب|syllabus|سٹڈی|اسٹڈی)/;

/** «یوٹیوب پر X» / «youtube par X» — a site-qualified search that
 *  belongs to the brain's youtube_search, not to this panel.
 *  NOTE: no \b after «پر» — JS \b is ASCII-only, so there is no
 *  word boundary between an Urdu letter and a space; (\s|$) does
 *  the job instead. */
const SITE_QUALIFIED_SEARCH =
  /^(یوٹیوب|youtube|فیس بک|facebook|ٹک ٹاک|tiktok|انسٹاگرام|instagram|ٹویٹر|twitter)\s+(پر|par|pe|on)(\s|$)/;

/** Strip a trailing search verb + trailing fillers from a query. */
function cleanQuery(q: string): string {
  return String(q || '')
    .replace(/\s*(تلاش کرو|سرچ کرو|search karo|google karo|گوگل کرو|تلاش|سرچ|search|دکھاؤ|دیکھو|dikhao|dekho)\s*$/gi, ' ')
    .replace(/\s*(کو|پر|کی|کا|کے|mein|me|please|ذرا|میرے لیے|mujhe)\s*$/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** «براؤزر کھولو» / «browser kholo» — open the panel's home view. */
const BROWSER_HOME =
  /^(براؤزر|browser)\s*(کھولو|کھول دو|کھولیں|دکھاؤ|open karo|open kar do|open|kholo|khol do)$/i;

export function parseBrowserCommand(text: string): BrowserRequest | null {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const t = normalize(raw);
  if (!t || STUDY_GUARD.test(t)) return null;

  // 1) The browser itself.
  if (BROWSER_HOME.test(t) || /^(کھولو|open)\s*(براؤزر|browser)$/i.test(t)) {
    return { url: '', displayName: 'براؤزر' };
  }

  // 2) Bare search — «گوگل پر X تلاش کرو», «X سرچ کرو», «search X».
  // Site-qualified searches («یوٹیوب پر X تلاش کرو») are NOT ours.
  if (!SITE_QUALIFIED_SEARCH.test(t)) {
    let m = t.match(/^(?:گوگل پر|google par|google pe|google on)\s+(.+)$/);
    if (m) {
      const q = cleanQuery(m[1]);
      if (q.length >= 2) return { url: '', displayName: 'گوگل', searchQuery: q };
    }
    m = t.match(/^(.+?)\s+(?:سرچ کرو|تلاش کرو|search karo|google karo|گوگل کرو|سرچ|تلاش|search)$/);
    if (m) {
      const q = cleanQuery(m[1]);
      if (q.length >= 2) return { url: '', displayName: q, searchQuery: q };
    }
    m = t.match(/^(?:search|google)\s+(.+)$/);
    if (m) {
      const q = cleanQuery(m[1]);
      if (q.length >= 2) return { url: '', displayName: 'گوگل', searchQuery: q };
    }
  }

  // 3) Open a site — the existing voice-command parser, so names
  //    resolve exactly as before («یوٹیوب کھولو» → youtube.com).
  const site = parseWebsiteCommand(raw);
  if (!site) return null;
  if (site.isSearchFallback) {
    // Unknown name + an open verb: search for it in the panel
    // instead of the old fall-through (which built a Google URL and
    // let the popup blocker kill the tab).
    const q = site.displayName.trim();
    if (q.length < 2) return null;
    return { url: '', displayName: q, searchQuery: q };
  }
  // «گوگل کھولو» means the search box, not google.com (which refuses
  // to frame) — open the panel in search view, ready to type.
  if (site.url === 'https://www.google.com') {
    return { url: '', displayName: 'گوگل', searchQuery: '' };
  }
  return { url: site.url, displayName: site.displayName };
}
