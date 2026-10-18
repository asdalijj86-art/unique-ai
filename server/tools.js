// Unique AI professional toolbox — free, no-key API integrations.
//
// All functions are defensive: external calls have timeouts, every failure
// returns a structured { ok:false, error } so callers can fall back to chat.
// No API keys are required by any tool in this module.

const FETCH_TIMEOUT_MS = 9000;

async function fetchJson(url, { timeoutMs = FETCH_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'UniqueAI/1.0 (personal-assistant)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// 1. web_search — DuckDuckGo Instant Answer, Wikipedia fallback
// ---------------------------------------------------------------------------
export async function webSearch(query) {
  const q = String(query || '').trim();
  if (!q) return { ok: false, error: 'empty-query' };
  // Primary: DuckDuckGo Instant Answer API (free, no key).
  try {
    const data = await fetchJson(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`
    );
    const results = [];
    if (data.AbstractText) {
      results.push({
        title: data.Heading || q,
        snippet: data.AbstractText.slice(0, 300),
        url: data.AbstractURL || '',
      });
    }
    const topics = Array.isArray(data.RelatedTopics) ? data.RelatedTopics : [];
    for (const t of topics) {
      if (results.length >= 5) break;
      const item = t.Topics ? t.Topics[0] : t;
      if (item && item.Text) {
        results.push({
          title: (item.Text.split('—')[0] || item.Text).slice(0, 90),
          snippet: item.Text.slice(0, 220),
          url: item.FirstURL || '',
        });
      }
    }
    if (results.length > 0) return { ok: true, query: q, results };
  } catch {
    // fall through to Wikipedia
  }
  // Fallback: Wikipedia opensearch (Urdu first, then English).
  for (const lang of ['ur', 'en']) {
    try {
      const data = await fetchJson(
        `https://${lang}.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(q)}&limit=5&format=json&origin=*`
      );
      const titles = data[1] || [];
      const descs = data[2] || [];
      const urls = data[3] || [];
      const results = titles.slice(0, 5).map((t, i) => ({
        title: t,
        snippet: (descs[i] || '').slice(0, 220),
        url: urls[i] || '',
      }));
      if (results.length > 0) return { ok: true, query: q, results, source: 'wikipedia' };
    } catch {
      // try next language
    }
  }
  return { ok: false, error: 'no-results', query: q };
}

// ---------------------------------------------------------------------------
// 2. weather — wttr.in (free, no key)
// ---------------------------------------------------------------------------
const URDU_CITY_MAP = {
  'لاہور': 'Lahore', 'کراچی': 'Karachi', 'اسلام آباد': 'Islamabad',
  'راولپنڈی': 'Rawalpindi', 'پشاور': 'Peshawar', 'کوئٹہ': 'Quetta',
  'ملتان': 'Multan', 'فیصل آباد': 'Faisalabad', 'حیدرآباد': 'Hyderabad',
  'سیالکوٹ': 'Sialkot', 'گوجرانوالہ': 'Gujranwala', 'سرگودھا': 'Sargodha',
  'بہاولپور': 'Bahawalpur', 'ایبٹ آباد': 'Abbottabad', 'مری': 'Murree',
  'مسقط': 'Muscat', 'دبئی': 'Dubai', 'ابوظہبی': 'Abu Dhabi',
  'ریاض': 'Riyadh', 'جدہ': 'Jeddah', 'دوحہ': 'Doha', 'کویت': 'Kuwait',
};

const WEATHER_URDU = [
  [/sunny/i, 'دھوپ نکلی ہے'], [/clear/i, 'موسم صاف ہے'],
  [/partly\s*cloud/i, 'ہلکے بادل ہیں'], [/cloud/i, 'ابر آلود ہے'],
  [/overcast/i, 'گہرے بادل ہیں'], [/mist|fog/i, 'دھند ہے'],
  [/thunder/i, 'گرج چمک کے ساتھ بارش ہے'], [/drizzle/i, 'بوندا باندی ہے'],
  [/rain|shower/i, 'بارش ہو رہی ہے'], [/snow/i, 'برف باری ہے'],
  [/storm/i, 'طوفان ہے'], [/wind/i, 'تیز ہوا ہے'],
];

export function resolveCityName(city) {
  const c = String(city || '').trim();
  if (!c) return 'Lahore';
  return URDU_CITY_MAP[c] || c;
}

export async function getWeather(city) {
  const resolved = resolveCityName(city);
  try {
    const data = await fetchJson(`https://wttr.in/${encodeURIComponent(resolved)}?format=j1`);
    const cur = data?.current_condition?.[0];
    if (!cur) throw new Error('no-data');
    const descEn = cur.weatherDesc?.[0]?.value || '';
    const urdu = WEATHER_URDU.find(([re]) => re.test(descEn));
    return {
      ok: true,
      city: String(city || '').trim() || resolved,
      cityEn: resolved,
      tempC: cur.temp_C,
      feelsLikeC: cur.FeelsLikeC,
      humidity: cur.humidity,
      windKmph: cur.windspeedKmph,
      conditionEn: descEn,
      conditionUr: urdu ? urdu[1] : descEn,
    };
  } catch {
    return { ok: false, error: 'weather-unavailable', city: resolved };
  }
}

// ---------------------------------------------------------------------------
// 3. calculator — safe math parser (no eval). Shunting-yard.
// ---------------------------------------------------------------------------
const URDU_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
export function normalizeMathExpression(raw) {
  let s = String(raw || '');
  for (let i = 0; i < 10; i++) s = s.split(URDU_DIGITS[i]).join(String(i));
  return s
    .replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')
    .replace(/,/g, '')
    .replace(/\^/g, '**')
    .trim();
}

function tokenizeMath(s) {
  const tokens = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      let num = '';
      while (i < s.length && /[0-9.]/.test(s[i])) num += s[i++];
      if (num.split('.').length > 2) throw new Error('bad-number');
      tokens.push({ t: 'num', v: parseFloat(num) });
      continue;
    }
    if ('+-*/%()'.includes(ch)) { tokens.push({ t: 'op', v: ch }); i++; continue; }
    if (s.startsWith('**', i)) { tokens.push({ t: 'op', v: '**' }); i += 2; continue; }
    throw new Error(`bad-char:${ch}`);
  }
  return tokens;
}

const PRECEDENCE = { '**': 4, '*': 3, '/': 3, '%': 3, '+': 2, '-': 2, u: 5 };

export function evaluateMath(rawExpression) {
  const expr = normalizeMathExpression(rawExpression);
  if (!expr || !/^[0-9+\-*/%().\s*]+$/.test(expr.replace(/\*\*/g, '*'))) {
    return { ok: false, error: 'not-math' };
  }
  try {
    const tokens = tokenizeMath(expr);
    // Handle unary minus.
    const processed = [];
    for (let i = 0; i < tokens.length; i++) {
      const tk = tokens[i];
      if (tk.t === 'op' && tk.v === '-' &&
          (i === 0 || (processed.length && processed[processed.length - 1].t === 'op' && processed[processed.length - 1].v !== ')'))) {
        processed.push({ t: 'op', v: 'u' });
      } else processed.push(tk);
    }
    const out = [], ops = [];
    const applyOp = () => {
      const op = ops.pop().v;
      if (op === 'u') { out.push(-out.pop()); return; }
      const b = out.pop(), a = out.pop();
      if (a === undefined || b === undefined) throw new Error('bad-expr');
      switch (op) {
        case '+': out.push(a + b); break;
        case '-': out.push(a - b); break;
        case '*': out.push(a * b); break;
        case '/': if (b === 0) throw new Error('div-zero'); out.push(a / b); break;
        case '%': out.push(a % b); break;
        case '**': out.push(Math.pow(a, b)); break;
        default: throw new Error('bad-op');
      }
    };
    for (const tk of processed) {
      if (tk.t === 'num') out.push(tk.v);
      else if (tk.v === '(') ops.push(tk);
      else if (tk.v === ')') {
        while (ops.length && ops[ops.length - 1].v !== '(') applyOp();
        if (!ops.length) throw new Error('bad-paren');
        ops.pop();
      } else {
        while (
          ops.length && ops[ops.length - 1].v !== '(' &&
          (PRECEDENCE[ops[ops.length - 1].v] > PRECEDENCE[tk.v] ||
            (PRECEDENCE[ops[ops.length - 1].v] === PRECEDENCE[tk.v] && tk.v !== '**' && tk.v !== 'u'))
        ) applyOp();
        ops.push(tk);
      }
    }
    while (ops.length) {
      if (ops[ops.length - 1].v === '(') throw new Error('bad-paren');
      applyOp();
    }
    if (out.length !== 1 || !Number.isFinite(out[0])) throw new Error('bad-expr');
    const value = Math.round(out[0] * 1e10) / 1e10;
    return { ok: true, expression: expr, result: value };
  } catch (e) {
    return { ok: false, error: e.message || 'calc-error', expression: expr };
  }
}

// ---------------------------------------------------------------------------
// 4. youtube_search — Invidious public API, YouTube-search-URL fallback
// ---------------------------------------------------------------------------
export async function youtubeSearch(query) {
  const q = String(query || '').trim();
  if (!q) return { ok: false, error: 'empty-query' };
  try {
    const data = await fetchJson(
      `https://inv.nadeko.net/api/v1/search?q=${encodeURIComponent(q)}&type=video&page=1`
    );
    const videos = (Array.isArray(data) ? data : [])
      .filter((v) => v && v.videoId)
      .slice(0, 5)
      .map((v) => ({
        title: v.title || 'ویڈیو',
        url: `https://www.youtube.com/watch?v=${v.videoId}`,
        thumbnail: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
        author: v.author || '',
      }));
    if (videos.length > 0) return { ok: true, query: q, videos };
  } catch {
    // fall through to URL fallback
  }
  return {
    ok: true,
    query: q,
    fallback: true,
    searchUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
  };
}

// ---------------------------------------------------------------------------
// 5. news — DuckDuckGo with a news-oriented query (English fallback, as
//    DDG instant answers are thin for Urdu news queries)
// ---------------------------------------------------------------------------
export async function getNews(topic) {
  const q = String(topic || '').trim();
  const queries = [];
  if (q) queries.push(/خبر|news|khabar|headlines/i.test(q) ? q : `${q} تازہ ترین خبریں`);
  queries.push('latest news headlines today', 'top world news');
  for (const nq of queries) {
    const res = await webSearch(nq);
    if (res.ok && res.results.length > 0) {
      return { ok: true, topic: q, headlines: res.results.slice(0, 5) };
    }
  }
  return { ok: false, error: 'news-unavailable' };
}

// ---------------------------------------------------------------------------
// 6. currency — open.er-api.com (free, no key)
// ---------------------------------------------------------------------------
const CURRENCY_NAMES = {
  dollar: 'USD', dollars: 'USD', 'ڈالر': 'USD', usd: 'USD',
  rupees: 'PKR', rupee: 'PKR', 'روپے': 'PKR', 'روپیہ': 'PKR', pkr: 'PKR',
  inr: 'INR', 'بھارتی روپے': 'INR',
  euro: 'EUR', euros: 'EUR', 'یورو': 'EUR', eur: 'EUR',
  pound: 'GBP', pounds: 'GBP', 'پاؤنڈ': 'GBP', gbp: 'GBP',
  riyal: 'SAR', 'ریال': 'SAR', sar: 'SAR',
  dirham: 'AED', dirhams: 'AED', 'درہم': 'AED', aed: 'AED',
  dinar: 'KWD', 'دینار': 'KWD',
  yen: 'JPY', 'ین': 'JPY', jpy: 'JPY',
  yuan: 'CNY', 'یوان': 'CNY', cny: 'CNY',
  lira: 'TRY', 'ترک لیرا': 'TRY',
};

export function parseCurrencyRequest(text) {
  const t = String(text || '').toLowerCase();
  const amountMatch = t.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  const amount = amountMatch ? parseFloat(amountMatch[1]) : 1;
  // Find currency codes/names in order of appearance.
  const found = [];
  const sortedKeys = Object.keys(CURRENCY_NAMES).sort((a, b) => b.length - a.length);
  let scan = t;
  while (scan.length > 0) {
    let matched = null;
    for (const key of sortedKeys) {
      const idx = scan.indexOf(key);
      if (idx !== -1 && (matched === null || idx < matched.idx)) {
        matched = { idx, key, code: CURRENCY_NAMES[key] };
      }
    }
    if (!matched) break;
    if (!found.includes(matched.code)) found.push(matched.code);
    scan = scan.slice(matched.idx + matched.key.length);
  }
  const from = found[0] || 'USD';
  const to = found[1] || (from === 'PKR' ? 'USD' : 'PKR');
  return { amount, from, to };
}

export async function convertCurrency(amount, from, to) {
  try {
    const data = await fetchJson(`https://open.er-api.com/v6/latest/${from}`);
    const rate = data?.rates?.[to];
    if (!rate) throw new Error('no-rate');
    const result = Math.round(amount * rate * 100) / 100;
    return { ok: true, amount, from, to, rate, result };
  } catch {
    return { ok: false, error: 'currency-unavailable', amount, from, to };
  }
}

// ---------------------------------------------------------------------------
// 7. timer — parsed server-side, executed client-side
// ---------------------------------------------------------------------------
const TIME_UNITS = [
  [/گھنٹ[ہے]|hour|hr/i, 3600, 'گھنٹے'],
  [/منٹ|min/i, 60, 'منٹ'],
  [/سیکنڈ|second|sec/i, 1, 'سیکنڈ'],
];

export function parseTimerRequest(text) {
  const t = String(text || '');
  const numMatch = t.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  if (!numMatch) return null;
  const num = parseFloat(numMatch[1]);
  let seconds = num * 60; // default: minutes
  let unitUr = 'منٹ';
  for (const [re, mult, ur] of TIME_UNITS) {
    if (re.test(t)) { seconds = num * mult; unitUr = ur; break; }
  }
  seconds = Math.round(seconds);
  if (seconds <= 0 || seconds > 24 * 3600) return null;
  return { seconds, unitUr, amount: num };
}

// ---------------------------------------------------------------------------
// 9. prayer_times — Aladhan API (free, no key)
// ---------------------------------------------------------------------------
export async function getPrayerTimes(city, country) {
  const c = String(city || 'Lahore').trim();
  const countryParam = String(country || '').trim();
  const url = countryParam
    ? `https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(c)}&country=${encodeURIComponent(countryParam)}&method=2`
    : `https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(c)}&country=Pakistan&method=2`;
  try {
    const data = await fetchJson(url);
    const t = data?.data?.timings;
    if (!t) throw new Error('no-data');
    const clean = (v) => String(v || '').slice(0, 5);
    return {
      ok: true,
      city: c,
      date: data?.data?.date?.readable || '',
      hijri: data?.data?.date?.hijri
        ? `${data.data.date.hijri.day} ${data.data.date.hijri.month.en} ${data.data.date.hijri.year}`
        : '',
      times: {
        Fajr: clean(t.Fajr), Sunrise: clean(t.Sunrise), Dhuhr: clean(t.Dhuhr),
        Asr: clean(t.Asr), Maghrib: clean(t.Maghrib), Isha: clean(t.Isha),
      },
    };
  } catch {
    return { ok: false, error: 'prayer-unavailable', city: c };
  }
}

// ---------------------------------------------------------------------------
// 11. unit_convert — pure JS conversion table (no API)
// ---------------------------------------------------------------------------
const UNIT_ALIASES = {
  // length → meters
  km: ['km', 'کلومیٹر', 'kilometer', 'kilometers', 'kilometre'],
  m: ['m', 'میٹر', 'meter', 'meters', 'metre'],
  cm: ['cm', 'سینٹی میٹر', 'centimeter', 'centimeters'],
  mm: ['mm', 'ملی میٹر', 'millimeter'],
  mile: ['mile', 'miles', 'میل'],
  ft: ['ft', 'فٹ', 'feet', 'foot'],
  inch: ['inch', 'inches', 'انچ'],
  // weight → grams
  kg: ['kg', 'کلو', 'kilogram', 'kilograms', 'کلوگرام'],
  g: ['g', 'گرام', 'gram', 'grams'],
  lb: ['lb', 'lbs', 'پاؤنڈ', 'pound', 'pounds'],
  oz: ['oz', 'اونس', 'ounce'],
  ton: ['ton', 'tons', 'ٹن'],
  // volume → liters
  l: ['l', 'liter', 'liters', 'لیٹر', 'litre'],
  ml: ['ml', 'ملی لیٹر', 'milliliter'],
  gallon: ['gallon', 'gallons', 'گیلن'],
  // temperature (special)
  c: ['c', 'celsius', 'سیلسیس', 'centigrade'],
  f: ['f', 'fahrenheit', 'فارن ہائیٹ'],
  k: ['k', 'kelvin', 'کیلون'],
};

const UNIT_TO_BASE = {
  km: 1000, m: 1, cm: 0.01, mm: 0.001, mile: 1609.344, ft: 0.3048, inch: 0.0254,
  kg: 1000, g: 1, lb: 453.59237, oz: 28.349523125, ton: 1000000,
  l: 1, ml: 0.001, gallon: 3.785411784,
};

const UNIT_CATEGORY = {
  km: 'length', m: 'length', cm: 'length', mm: 'length', mile: 'length', ft: 'length', inch: 'length',
  kg: 'weight', g: 'weight', lb: 'weight', oz: 'weight', ton: 'weight',
  l: 'volume', ml: 'volume', gallon: 'volume',
  c: 'temperature', f: 'temperature', k: 'temperature',
};

const UNIT_URDU = {
  km: 'کلومیٹر', m: 'میٹر', cm: 'سینٹی میٹر', mm: 'ملی میٹر', mile: 'میل', ft: 'فٹ', inch: 'انچ',
  kg: 'کلوگرام', g: 'گرام', lb: 'پاؤنڈ', oz: 'اونس', ton: 'ٹن',
  l: 'لیٹر', ml: 'ملی لیٹر', gallon: 'گیلن',
  c: 'سیلسیس', f: 'فارن ہائیٹ', k: 'کیلون',
};

function resolveUnit(word) {
  const w = String(word || '').toLowerCase().trim();
  for (const [canon, aliases] of Object.entries(UNIT_ALIASES)) {
    if (canon === w || aliases.includes(w)) return canon;
  }
  return null;
}

export function parseUnitConvert(text) {
  const t = String(text || '');
  const amountMatch = t.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  if (!amountMatch) return null;
  const amount = parseFloat(amountMatch[1]);
  // Match whole words only (single-letter aliases like "m" must not match
  // inside "miles"). Build a regex per alias with word boundaries; for
  // non-Latin scripts use a simpler contains check.
  const found = [];
  const scan = ` ${t.toLowerCase()} `;
  for (const [canon, aliases] of Object.entries(UNIT_ALIASES)) {
    for (const a of [canon, ...aliases]) {
      const al = a.toLowerCase();
      const isLatin = /^[a-z]+$/.test(al);
      const re = isLatin
        ? new RegExp(`(?<![a-z])${al}(?![a-z])`)
        : new RegExp(al.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      const m = scan.match(re);
      if (m) { found.push({ idx: m.index, canon }); break; }
    }
  }
  found.sort((a, b) => a.idx - b.idx);
  const uniq = [];
  for (const f of found) if (!uniq.includes(f.canon)) uniq.push(f.canon);
  if (uniq.length < 2) return null;
  const from = uniq[0], to = uniq[1];
  if (UNIT_CATEGORY[from] !== UNIT_CATEGORY[to]) return null;
  return { amount, from, to };
}

export function convertUnits(amount, from, to) {
  const cat = UNIT_CATEGORY[from];
  if (!cat || cat !== UNIT_CATEGORY[to]) return { ok: false, error: 'incompatible-units' };
  let result;
  if (cat === 'temperature') {
    // Normalize to Celsius first.
    let c;
    if (from === 'c') c = amount;
    else if (from === 'f') c = (amount - 32) * 5 / 9;
    else c = amount - 273.15;
    if (to === 'c') result = c;
    else if (to === 'f') result = c * 9 / 5 + 32;
    else result = c + 273.15;
  } else {
    const base = amount * UNIT_TO_BASE[from];
    result = base / UNIT_TO_BASE[to];
  }
  result = Math.round(result * 10000) / 10000;
  return {
    ok: true, amount, from, to,
    fromUr: UNIT_URDU[from] || from, toUr: UNIT_URDU[to] || to,
    result,
  };
}

// ---------------------------------------------------------------------------
// 14. world_clock — pure JS, Intl.DateTimeFormat (no API)
// ---------------------------------------------------------------------------
const CITY_TIMEZONES = {
  'لاہور': 'Asia/Karachi', 'lahore': 'Asia/Karachi',
  'کراچی': 'Asia/Karachi', 'karachi': 'Asia/Karachi',
  'اسلام آباد': 'Asia/Karachi', 'islamabad': 'Asia/Karachi',
  'دبئی': 'Asia/Dubai', 'dubai': 'Asia/Dubai',
  'مسقط': 'Asia/Muscat', 'muscat': 'Asia/Muscat',
  'ابوظہبی': 'Asia/Dubai', 'abudhabi': 'Asia/Dubai', 'abu dhabi': 'Asia/Dubai',
  'ریاض': 'Asia/Riyadh', 'riyadh': 'Asia/Riyadh',
  'جدہ': 'Asia/Riyadh', 'jeddah': 'Asia/Riyadh',
  'دوحہ': 'Asia/Qatar', 'doha': 'Asia/Qatar',
  'کویت': 'Asia/Kuwait', 'kuwait': 'Asia/Kuwait',
  'لندن': 'Europe/London', 'london': 'Europe/London',
  'پیرس': 'Europe/Paris', 'paris': 'Europe/Paris',
  'نیویارک': 'America/New_York', 'new york': 'America/New_York', 'newyork': 'America/New_York',
  'ٹوکیو': 'Asia/Tokyo', 'tokyo': 'Asia/Tokyo',
  'بیجنگ': 'Asia/Shanghai', 'beijing': 'Asia/Shanghai',
  'دہلی': 'Asia/Kolkata', 'delhi': 'Asia/Kolkata', 'ممبئی': 'Asia/Kolkata', 'mumbai': 'Asia/Kolkata',
  'استنبول': 'Europe/Istanbul', 'istanbul': 'Europe/Istanbul',
  'قاہرہ': 'Africa/Cairo', 'cairo': 'Africa/Cairo',
};

export function getWorldTime(city) {
  const key = String(city || '').trim().toLowerCase();
  const tz = CITY_TIMEZONES[key];
  if (!tz) return { ok: false, error: 'unknown-city', city };
  try {
    const now = new Date();
    const time = new Intl.DateTimeFormat('ur-PK', {
      hour: '2-digit', minute: '2-digit', hour12: true, timeZone: tz,
    }).format(now);
    const date = new Intl.DateTimeFormat('ur-PK', {
      weekday: 'long', day: 'numeric', month: 'long', timeZone: tz,
    }).format(now);
    return { ok: true, city: String(city).trim(), timezone: tz, time, date };
  } catch {
    return { ok: false, error: 'clock-error', city };
  }
}

// ---------------------------------------------------------------------------
// 13. youtube_trending — video idea generation is done via Gemini in index.js
//    (kept here as a helper for prompt building).
// ---------------------------------------------------------------------------
export function videoIdeasPrompt(niche) {
  const n = String(niche || '').trim() || 'desi comedy and action';
  return `You are a YouTube Shorts strategist for a Pakistani desi channel. ` +
    `Generate 5 trending short-video ideas for this niche: "${n}". ` +
    `Each idea: a catchy Urdu title (under 60 characters), a one-line hook for the first 2 seconds, ` +
    `and why it can go viral right now. Number them 1-5. Keep it punchy, no fluff.`;
}

// ---------------------------------------------------------------------------
// 15. read_webpage — fetch + strip HTML to text (Gemini summarizes in index.js)
// ---------------------------------------------------------------------------
export async function fetchPageText(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl || '').trim());
  } catch {
    return { ok: false, error: 'bad-url' };
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    return { ok: false, error: 'bad-protocol' };
  }
  const host = url.hostname.toLowerCase();
  // Block localhost / private IPs / metadata endpoints.
  if (
    host === 'localhost' || host.endsWith('.localhost') ||
    host === '127.0.0.1' || host === '::1' || host === '0.0.0.0' ||
    /^10\./.test(host) || /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === '169.254.169.254' || host.endsWith('.internal')
  ) {
    return { ok: false, error: 'blocked-host' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { 'User-Agent': 'UniqueAI/1.0 (personal-assistant; webpage-reader)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentType = res.headers.get('content-type') || '';
    if (!/text\/html|text\/plain/.test(contentType)) {
      return { ok: false, error: 'not-html' };
    }
    const reader = res.body.getReader();
    const chunks = [];
    let received = 0;
    const MAX_BYTES = 1024 * 1024; // 1MB cap
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      if (received > MAX_BYTES) { reader.cancel(); break; }
      chunks.push(value);
    }
    const html = Buffer.concat(chunks).toString('utf8');
    // Strip scripts/styles, then all tags; collapse whitespace.
    let text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim().slice(0, 200) : url.hostname;
    if (text.length > 6000) text = text.slice(0, 6000);
    if (!text) return { ok: false, error: 'empty-page' };
    return { ok: true, url: url.toString(), title, text };
  } catch (e) {
    return { ok: false, error: 'fetch-failed', detail: e.message };
  } finally {
    clearTimeout(timer);
  }
}
// ---------------------------------------------------------------------------
// 8. notes — parsed server-side, stored client-side (localStorage)
// ---------------------------------------------------------------------------
export function parseNoteSave(text) {
  let t = String(text || '').trim();
  // Strip the command prefix up to ':' or the trigger words.
  const colon = t.indexOf(':');
  if (colon !== -1) return t.slice(colon + 1).trim();
  const cleaned = t
    .replace(/^(نوٹ لکھو|note likho|note karo|یاد رکھو|note bana|نوٹ بناؤ)\s*/i, '')
    .trim();
  return cleaned;
}
