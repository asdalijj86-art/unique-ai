// Voice website commands for Unique AI.
//
// Detects "open <site>" style spoken commands in Urdu, Roman Urdu and
// English (e.g. "یوٹیوب کھولو", "youtube kholo", "open youtube"),
// maps well-known sites to their URLs, and falls back to a Google
// search for anything unrecognized.

export type WebsiteCommand = {
  /** The URL to open. */
  url: string;
  /** Urdu display name used in the spoken confirmation, e.g. "یوٹیوب". */
  displayName: string;
  /** True when we fell back to a web search for an unknown site. */
  isSearchFallback: boolean;
};

type SiteEntry = {
  /** Lowercase match keys (Urdu / Roman Urdu / English), whitespace-normalized. */
  keys: string[];
  url: string;
  displayName: string;
};

const SITES: SiteEntry[] = [
  { keys: ['youtube', 'یوٹیوب', 'یو ٹیوب'], url: 'https://www.youtube.com', displayName: 'یوٹیوب' },
  { keys: ['facebook', 'فیس بک'], url: 'https://www.facebook.com', displayName: 'فیس بک' },
  { keys: ['google', 'گوگل'], url: 'https://www.google.com', displayName: 'گوگل' },
  { keys: ['gmail', 'جی میل'], url: 'https://mail.google.com', displayName: 'جی میل' },
  { keys: ['whatsapp', 'واٹس ایپ', 'واٹساپ', 'whatsapp web'], url: 'https://web.whatsapp.com', displayName: 'واٹس ایپ' },
  { keys: ['instagram', 'انسٹاگرام', 'انسٹا', 'insta'], url: 'https://www.instagram.com', displayName: 'انسٹاگرام' },
  { keys: ['twitter', 'ٹویٹر'], url: 'https://x.com', displayName: 'ٹویٹر' },
  { keys: ['tiktok', 'ٹک ٹاک'], url: 'https://www.tiktok.com', displayName: 'ٹک ٹاک' },
  { keys: ['google maps', 'گوگل میپس', 'maps', 'میپس'], url: 'https://maps.google.com', displayName: 'گوگل میپس' },
  { keys: ['google drive', 'گوگل ڈرائیو', 'drive', 'ڈرائیو'], url: 'https://drive.google.com', displayName: 'گوگل ڈرائیو' },
  { keys: ['google docs', 'گوگل ڈاکس', 'docs', 'ڈاکس'], url: 'https://docs.google.com', displayName: 'گوگل ڈاکس' },
  { keys: ['play store', 'پلے اسٹور', 'playstore'], url: 'https://play.google.com', displayName: 'پلے اسٹور' },
  { keys: ['daraz', 'دراز'], url: 'https://www.daraz.pk', displayName: 'دراز' },
  { keys: ['olx', 'او ایل ایکس'], url: 'https://www.olx.com.pk', displayName: 'او ایل ایکس' },
  { keys: ['amazon', 'ایمیزون'], url: 'https://www.amazon.com', displayName: 'ایمیزون' },
  { keys: ['wikipedia', 'وکی پیڈیا', 'wiki', 'ویکی'], url: 'https://ur.wikipedia.org', displayName: 'وکی پیڈیا' },
  { keys: ['github', 'گٹ ہب'], url: 'https://github.com', displayName: 'گٹ ہب' },
  { keys: ['stackoverflow', 'اسٹیک اوور فلو'], url: 'https://stackoverflow.com', displayName: 'اسٹیک اوور فلو' },
  { keys: ['capcut', 'کیپ کٹ'], url: 'https://www.capcut.com', displayName: 'کیپ کٹ' },
  { keys: ['ludo', 'لڈو'], url: 'https://playboardit.com/play/ludo', displayName: 'لڈو' },
  { keys: ['bbc urdu', 'بی بی سی اردو'], url: 'https://www.bbc.com/urdu', displayName: 'بی بی سی اردو' },
  { keys: ['quran', 'قرآن'], url: 'https://quran.com', displayName: 'قرآن' },
  { keys: ['gemini', 'جیمنائی'], url: 'https://gemini.google.com', displayName: 'جیمنائی' },
  { keys: ['chatgpt', 'چیٹ جی پی ٹی'], url: 'https://chat.openai.com', displayName: 'چیٹ جی پی ٹی' },
];

// "Open" verbs in Urdu / Roman Urdu / English. Longer, more specific
// phrases come first so alternation prefers them ("khol do" before "khol").
const OPEN_VERBS = [
  'کھول دو',
  'کھولو',
  'کھولیں',
  'اوپن کریں',
  'اوپن کرو',
  'چلائیں',
  'چلاؤ',
  'khol do',
  'khol de',
  'kholo',
  'khol',
  'open kar do',
  'open karo',
  'open kar',
  'chalao',
  'play',
  'launch',
  'visit',
  'go to',
  'goto',
  'open',
];

const LEADING_VERB_PATTERN = new RegExp(`^(?:${OPEN_VERBS.join('|')})\\s+(.+)$`, 'i');
const TRAILING_VERB_PATTERN = new RegExp(`^(.+?)\\s+(?:${OPEN_VERBS.join('|')})$`, 'i');

function lightNormalize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[.؟?!,،۔'"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripFillerWords(normalized: string): string {
  let name = normalized;
  // Leading fillers: "the", "website", "app", "my" ...
  name = name.replace(/^(the|website|web site|site|سائٹ|ویب سائٹ|app|ایپ|my|میرا|میری|mera|meri)\s+/g, '');
  // Trailing fillers: "... website", "... app", "... ko" ...
  name = name.replace(/\s+(the|website|web site|site|سائٹ|ویب سائٹ|app|ایپ|ko|ki|ka|کو|کی|کا)$/g, '');
  return name.trim();
}

/**
 * Returns a WebsiteCommand when `text` is an "open website" style command,
 * otherwise null. Matching is case-insensitive and tolerant of Urdu,
 * Roman Urdu and English phrasing.
 */
export function parseWebsiteCommand(text: string): WebsiteCommand | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const leadingSite = trimmed.match(LEADING_VERB_PATTERN)?.[1];
  const trailingSite = leadingSite ? undefined : trimmed.match(TRAILING_VERB_PATTERN)?.[1];
  const rawSite = leadingSite ?? trailingSite ?? null;
  if (!rawSite) return null;

  const siteName = lightNormalize(rawSite);
  if (!siteName) return null;

  // First try the name as-is (so compounds like "واٹس ایپ" are not
  // mangled by filler-word stripping), then try with fillers removed.
  const known = SITES.find((site) => site.keys.includes(siteName))
    ?? SITES.find((site) => site.keys.includes(stripFillerWords(siteName)));
  if (known) {
    return { url: known.url, displayName: known.displayName, isSearchFallback: false };
  }

  // Fallback: search the web for the requested site name.
  return {
    url: `https://www.google.com/search?q=${encodeURIComponent(rawSite.trim())}`,
    displayName: rawSite.trim(),
    isSearchFallback: true,
  };
}
