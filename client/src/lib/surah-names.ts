/**
 * surah-names — the complete surah name→number knowledge for voice/typed
 * commands («سورۃ ناس پڑھ کر سناؤ», "Surah An-Nas sunao", «سورت 114»).
 *
 * SURAH_URDU / SURAH_ALIASES are the same metadata QuranReader searches
 * with (moved here so both reuse ONE copy). The parser additionally
 * understands transliterations and bare numbers, and normalizes the
 * Arabic-script spelling variants users actually type (ی/ي, ک/ك,
 * ہ/ة, missing diacritics, missing «ال» prefix).
 */

// Urdu names for all 114 surahs (standard names).
export const SURAH_URDU: Record<number, string> = {
  1: 'الفاتحہ', 2: 'البقرہ', 3: 'آل عمران', 4: 'النساء', 5: 'المائدہ',
  6: 'الانعام', 7: 'الاعراف', 8: 'الانفال', 9: 'التوبہ', 10: 'یونس',
  11: 'ہود', 12: 'یوسف', 13: 'الرعد', 14: 'ابراہیم', 15: 'الحجر',
  16: 'النحل', 17: 'بنی اسرائیل', 18: 'الکہف', 19: 'مریم', 20: 'طٰہٰ',
  21: 'الانبیاء', 22: 'الحج', 23: 'المومنون', 24: 'النور', 25: 'الفرقان',
  26: 'الشعراء', 27: 'النمل', 28: 'القصص', 29: 'العنکبوت', 30: 'الروم',
  31: 'لقمان', 32: 'السجدہ', 33: 'الاحزاب', 34: 'سبا', 35: 'فاطر',
  36: 'یٰسین', 37: 'الصٰفٰت', 38: 'ص', 39: 'الزمر', 40: 'المومن',
  41: 'حم سجدہ', 42: 'الشوریٰ', 43: 'الزخرف', 44: 'الدخان', 45: 'الجاثیہ',
  46: 'الاحقاف', 47: 'محمد', 48: 'الفتح', 49: 'الحجرات', 50: 'ق',
  51: 'الذاریات', 52: 'الطور', 53: 'النجم', 54: 'القمر', 55: 'الرحمٰن',
  56: 'الواقعہ', 57: 'الحدید', 58: 'المجادلہ', 59: 'الحشر', 60: 'الممتحنہ',
  61: 'الصف', 62: 'الجمعہ', 63: 'المنافقون', 64: 'التغابن', 65: 'الطلاق',
  66: 'التحریم', 67: 'الملک', 68: 'القلم', 69: 'الحاقہ', 70: 'المعارج',
  71: 'نوح', 72: 'الجن', 73: 'المزمل', 74: 'المدثر', 75: 'القیامہ',
  76: 'الدہر', 77: 'المرسلات', 78: 'النبأ', 79: 'النازعات', 80: 'عبس',
  81: 'التکویر', 82: 'الانفطار', 83: 'المطففین', 84: 'الانشقاق', 85: 'البروج',
  86: 'الطارق', 87: 'الاعلیٰ', 88: 'الغاشیہ', 89: 'الفجر', 90: 'البلد',
  91: 'الشمس', 92: 'اللیل', 93: 'الضحیٰ', 94: 'الشرح', 95: 'التین',
  96: 'العلق', 97: 'القدر', 98: 'البینہ', 99: 'الزلزال', 100: 'العادیات',
  101: 'القارعہ', 102: 'التکاثر', 103: 'العصر', 104: 'الہمزہ', 105: 'الفیل',
  106: 'قریش', 107: 'الماعون', 108: 'الکوثر', 109: 'الکافرون', 110: 'النصر',
  111: 'اللہب', 112: 'الاخلاص', 113: 'الفلق', 114: 'الناس',
};

// Alternate/common names (search + voice parsing).
export const SURAH_ALIASES: Record<number, string[]> = {
  17: ['الاسراء'], 36: ['یاسین', 'یٰس'], 40: ['غافر'], 41: ['فصلت'],
  55: ['رحمن', 'رحمٰن'], 56: ['واقعہ'], 67: ['تبارک'], 76: ['الانسان'],
  94: ['الانشراح'], 111: ['المسد'], 1: ['فاتحہ', 'الحمد'],
  2: ['بقرہ'], 18: ['کہف'], 112: ['قل ہو اللہ'],
};

// Transliteration keys (normalized: lowercase, single spaces). Covers the
// standard English names plus the spellings Roman-Urdu speakers use.
const SURAH_TRANSLIT: Record<number, string[]> = {
  1: ['fatiha', 'al fatiha', 'fateha', 'al fateha'],
  2: ['baqara', 'baqarah', 'al baqara', 'al baqarah', 'bakara'],
  3: ['aal e imran', 'aal imran', 'al imran', 'aale imran', 'imran'],
  4: ['nisa', 'an nisa', 'al nisa'],
  5: ['maida', 'maidah', 'al maida', 'maeda'],
  6: ['anam', 'anaam', 'al anam'],
  7: ['araf', 'aaraf', 'al araf'],
  8: ['anfal', 'al anfal'],
  9: ['tauba', 'taubah', 'tawba', 'tawbah', 'at tauba', 'toba'],
  10: ['yunus', 'younus', 'younas'],
  11: ['hud', 'hood'],
  12: ['yusuf', 'yousuf', 'yusaf', 'yousaf'],
  13: ['raad', 'ar raad'],
  14: ['ibrahim', 'ibraheem'],
  15: ['hijr', 'al hijr'],
  16: ['nahl', 'an nahl', 'nahal'],
  17: ['isra', 'al isra', 'bani israil', 'bani israel'],
  18: ['kahf', 'kahaf', 'al kahf', 'al kahaf'],
  19: ['maryam', 'mariam'],
  20: ['taha', 'ta ha'],
  21: ['anbiya', 'ambiya', 'al anbiya'],
  22: ['hajj', 'al hajj'],
  23: ['muminun', 'muminoon', 'mominoon', 'al muminun'],
  24: ['nur', 'noor', 'an nur', 'an noor'],
  25: ['furqan', 'al furqan'],
  26: ['shuara', 'ash shuara'],
  27: ['naml', 'an naml', 'namal'],
  28: ['qasas', 'al qasas', 'kasas'],
  29: ['ankabut', 'ankaboot', 'al ankabut'],
  30: ['rum', 'ar rum', 'al rum'],
  31: ['luqman', 'loqman', 'lukman'],
  32: ['sajda', 'sajdah', 'as sajda'],
  33: ['ahzab', 'al ahzab'],
  34: ['saba'],
  35: ['fatir'],
  36: ['yaseen', 'yasin', 'ya sin', 'ya seen'],
  37: ['saffat', 'as saffat'],
  38: ['saad', 'swad'],
  39: ['zumar', 'az zumar'],
  40: ['mumin', 'ghafir', 'al mumin'],
  41: ['fussilat', 'fusilat', 'fasilat'],
  42: ['shura', 'ash shura', 'shoura'],
  43: ['zukhruf', 'az zukhruf'],
  44: ['dukhan', 'ad dukhan', 'dokhan'],
  45: ['jasiya', 'jathiya', 'al jasiya'],
  46: ['ahqaf', 'al ahqaf', 'ahkaf'],
  47: ['muhammad', 'mohammad', 'mohammed'],
  48: ['fath', 'fatah', 'al fath', 'fateh'],
  49: ['hujurat', 'hujrat', 'al hujurat'],
  50: ['qaf', 'qaaf'],
  51: ['zariyat', 'dhariyat', 'az zariyat'],
  52: ['tur', 'toor', 'at tur'],
  53: ['najm', 'an najm', 'najam'],
  54: ['qamar', 'kamar', 'al qamar'],
  55: ['rahman', 'rehman', 'ar rahman', 'al rahman'],
  56: ['waqia', 'waqiah', 'waqiya', 'al waqia', 'wakia'],
  57: ['hadid', 'hadeed', 'al hadid'],
  58: ['mujadila', 'mujadalah', 'al mujadila'],
  59: ['hashr', 'hashar', 'al hashr'],
  60: ['mumtahina', 'mumtahanah', 'al mumtahina'],
  61: ['saf', 'saff', 'as saf', 'as saff'],
  62: ['jumuah', 'jumua', 'juma', 'al jumuah', 'jummah'],
  63: ['munafiqun', 'munafiqoon', 'al munafiqun'],
  64: ['taghabun', 'at taghabun'],
  65: ['talaq', 'talak', 'at talaq'],
  66: ['tahrim', 'at tahrim', 'tehreem'],
  67: ['mulk', 'al mulk'],
  68: ['qalam', 'kalam', 'al qalam'],
  69: ['haqqah', 'al haqqah'],
  70: ['maarij', 'al maarij'],
  71: ['nuh', 'nooh'],
  72: ['jinn', 'jin', 'al jinn'],
  73: ['muzzammil', 'muzammil', 'al muzzammil'],
  74: ['muddassir', 'mudassir', 'mudathir', 'al muddassir'],
  75: ['qiyama', 'qiyamah', 'al qiyama', 'kiyama'],
  76: ['dahr', 'insan', 'al insan', 'ad dahr'],
  77: ['mursalat', 'al mursalat'],
  78: ['naba', 'an naba', 'nabaa'],
  79: ['naziat', 'an naziat'],
  80: ['abasa'],
  81: ['takwir', 'takweer', 'at takwir'],
  82: ['infitar', 'al infitar'],
  83: ['mutaffifin', 'mutafifin', 'al mutaffifin'],
  84: ['inshiqaq', 'al inshiqaq'],
  85: ['buruj', 'burooj', 'al buruj'],
  86: ['tariq', 'at tariq', 'tarik'],
  87: ['ala', 'aala', 'al ala', 'a la'],
  88: ['ghashiya', 'ghashiyah', 'al ghashiya'],
  89: ['fajr', 'fajar', 'al fajr'],
  90: ['balad', 'al balad'],
  91: ['shams', 'ash shams'],
  92: ['layl', 'lail', 'al layl'],
  93: ['duha', 'ad duha', 'zoha'],
  94: ['sharh', 'inshirah', 'ash sharh', 'al inshirah'],
  95: ['tin', 'teen', 'at tin'],
  96: ['alaq', 'alak', 'al alaq'],
  97: ['qadr', 'kadar', 'al qadr'],
  98: ['bayyina', 'bayyinah', 'al bayyina'],
  99: ['zilzal', 'zalzala', 'zalzalah', 'az zilzal'],
  100: ['adiyat', 'aadiyat', 'al adiyat'],
  101: ['qaria', 'qariah', 'al qaria', 'karia'],
  102: ['takasur', 'takathur', 'at takasur'],
  103: ['asr', 'al asr'],
  104: ['humaza', 'humazah', 'al humaza'],
  105: ['fil', 'feel', 'al fil'],
  106: ['quraish', 'quraysh', 'quresh'],
  107: ['maun', 'maun', 'al maun', 'maoon'],
  108: ['kausar', 'kauthar', 'kawthar', 'al kausar', 'kosar'],
  109: ['kafirun', 'kafiroon', 'al kafirun'],
  110: ['nasr', 'nasar', 'an nasr'],
  111: ['lahab', 'lahb', 'al lahab', 'masad', 'al masad'],
  112: ['ikhlas', 'iklas', 'al ikhlas'],
  113: ['falaq', 'falak', 'al falaq'],
  114: ['nas', 'an nas', 'al nas', 'naas'],
};

/**
 * Normalize Arabic-script text for matching: strip diacritics/tatweel,
 * unify Arabic/Urdu letter variants (ي→ی, ك→ک, ة/ۀ→ہ, أإآ→ا, ى→ی),
 * collapse whitespace.
 */
export function normalizeArabicScript(text: string): string {
  return String(text || '')
    .replace(/[ً-ٰٟـ]/g, '')
    // superscript/dagger alif variants (یٰسین → یسین)
    .replace(/ٰ/g, '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ةۀ]/g, 'ہ')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ی')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLatin(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/[''`.-]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strip a leading «ال» / 'al ' from a name variant for loose matching. */
function stripAl(name: string): string {
  return name.replace(/^ال/, '').replace(/^al /, '');
}

// Pre-built candidate lists, longest first so «الناس» beats «النبأ»-style
// near-misses and full names beat short ones.
const ARABIC_CANDIDATES: { surah: number; name: string }[] = (() => {
  const list: { surah: number; name: string }[] = [];
  for (let n = 1; n <= 114; n++) {
    const names = [SURAH_URDU[n], ...(SURAH_ALIASES[n] || [])];
    for (const raw of names) {
      const norm = normalizeArabicScript(raw);
      if (norm) list.push({ surah: n, name: norm });
      const loose = stripAl(norm);
      if (loose && loose !== norm && loose.length >= 2) list.push({ surah: n, name: loose });
    }
  }
  return list.sort((a, b) => b.name.length - a.name.length);
})();

const LATIN_CANDIDATES: { surah: number; key: string }[] = (() => {
  const list: { surah: number; key: string }[] = [];
  for (let n = 1; n <= 114; n++) {
    for (const key of SURAH_TRANSLIT[n] || []) list.push({ surah: n, key });
  }
  return list.sort((a, b) => b.key.length - a.key.length);
})();

function containsToken(haystackPadded: string, needle: string): boolean {
  return haystackPadded.includes(` ${needle} `);
}

/**
 * Parse a surah reference out of free text (voice or typed, any script).
 * Returns the surah number 1–114, or null when no name/number is found.
 * Handles: «سورۃ ناس», «الناس», «فاتحہ», "Surah An-Nas", "yaseen sunao",
 * «سورت 114», «114 نمبر سورت», "surah 36".
 */
export function parseSurahReference(text: string): number | null {
  const raw = String(text || '');
  if (!raw) return null;

  // 1) Explicit number forms.
  const numPatterns = [
    /(?:سورت|سورۃ|سورة|سورہ|surah)\s*(?:نمبر\s*)?(\d{1,3})/i,
    /(\d{1,3})\s*(?:نمبر\s*)?(?:سورت|سورۃ|سورة|سورہ|surah)/i,
    /(?:surah|chapter)\s*(?:no\.?\s*)?(\d{1,3})/i,
  ];
  for (const pattern of numPatterns) {
    const m = raw.match(pattern);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 1 && n <= 114) return n;
    }
  }

  // 2) Arabic/Urdu-script names (padded token match on normalized text).
  const arabic = ` ${normalizeArabicScript(raw)} `;
  for (const candidate of ARABIC_CANDIDATES) {
    if (candidate.name.length < 2) continue; // single letters (ص، ق) too ambiguous
    if (containsToken(arabic, candidate.name)) return candidate.surah;
  }

  // 3) Transliteration / English names.
  const latin = ` ${normalizeLatin(raw)} `;
  if (/[a-z]/.test(latin)) {
    for (const candidate of LATIN_CANDIDATES) {
      if (containsToken(latin, candidate.key)) return candidate.surah;
    }
  }
  return null;
}

/** Display name for confirmations: «سورۃ الناس». */
export function surahDisplayName(n: number): string {
  return SURAH_URDU[n] ? `سورۃ ${SURAH_URDU[n]}` : `سورت ${n}`;
}
