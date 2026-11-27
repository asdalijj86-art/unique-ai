/**
 * test-side-browser.mjs — Uniqa's own side browser (user order
 * 2026-11-28, voice).
 *
 * Bundles the REAL client libs with esbuild (same pattern as
 * test-stonic-behaviour.mjs / test-alarm-fastmind.mjs) and proves,
 * headlessly:
 *  1. Site opens in Urdu / Roman Urdu / English resolve to the
 *     right URLs through the existing voice-command site list.
 *  2. Bare searches («گوگل پر X تلاش کرو», «X سرچ کرو», «search X»)
 *     become panel searches; «براؤزر کھولو» opens the home view;
 *     «گوگل کھولو» opens the search view (google.com refuses to
 *     frame, so the panel opens ready to search instead).
 *  3. Non-commands stay null: fact questions, decisions, alarms,
 *     site-qualified searches («یوٹیوب پر گانا تلاش کرو» — the
 *     brain's youtube_search keeps those), and study-shaped text.
 *  4. Embed blocks: the big sites (YouTube, Facebook, Instagram,
 *     TikTok, X, WhatsApp Web, Gmail, Google, Drive, GitHub,
 *     ChatGPT, Gemini) are blocked; ordinary sites are not.
 *  5. URL normalisation: bare domains get https://, phrases do not.
 *  6. The persona mirror constants + the server ADD-ONLY prompt
 *     entries exist and carry the no-fake rules.
 *
 * Run: node scripts/test-side-browser.mjs   (from the repo root)
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(join(tmpdir(), 'side-browser-'));
const entry = join(outDir, 'entry.ts');
writeFileSync(entry, [
  `export * from ${JSON.stringify(join(repoRoot, 'client/src/lib/browser-intent.ts'))};`,
  `export { SIDE_BROWSER_GUIDANCE, HOW_TO_GUIDANCE } from ${JSON.stringify(join(repoRoot, 'client/src/lib/persona.ts'))};`,
].join('\n'));
const bundled = join(outDir, 'side-browser-libs.mjs');
execSync(
  `${join(repoRoot, 'client/node_modules/.bin/esbuild')} ${entry} --bundle --format=esm --outfile=${bundled}`,
  { stdio: 'pipe' },
);
const L = await import(pathToFileURL(bundled).href);

let passed = 0;
let failed = 0;
function check(label, actual, want) {
  const ok = JSON.stringify(actual) === JSON.stringify(want);
  if (ok) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}\n      got:  ${JSON.stringify(actual)}\n      want: ${JSON.stringify(want)}`); }
}
function checkTrue(label, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label} ${detail}`); }
}

console.log('\n── 1) Site opens ────────────────────────────────────');
check('«یوٹیوب کھولو» → youtube.com', L.parseBrowserCommand('یوٹیوب کھولو'), { url: 'https://www.youtube.com', displayName: 'یوٹیوب' });
check('«فیس بک کھولو» → facebook.com', L.parseBrowserCommand('فیس بک کھولو'), { url: 'https://www.facebook.com', displayName: 'فیس بک' });
check('«ٹک ٹاک کھولو» → tiktok.com', L.parseBrowserCommand('ٹک ٹاک کھولو'), { url: 'https://www.tiktok.com', displayName: 'ٹک ٹاک' });
check('«انسٹا کھولو» → instagram.com', L.parseBrowserCommand('انسٹا کھولو'), { url: 'https://www.instagram.com', displayName: 'انسٹاگرام' });
check('«youtube kholo» → youtube.com', L.parseBrowserCommand('youtube kholo'), { url: 'https://www.youtube.com', displayName: 'یوٹیوب' });
check('«open tiktok» → tiktok.com', L.parseBrowserCommand('open tiktok'), { url: 'https://www.tiktok.com', displayName: 'ٹک ٹاک' });
check('«یوٹیوب کھول دو» → youtube.com', L.parseBrowserCommand('یوٹیوب کھول دو'), { url: 'https://www.youtube.com', displayName: 'یوٹیوب' });
check('«وکی پیڈیا کھولو» → ur.wikipedia.org', L.parseBrowserCommand('وکی پیڈیا کھولو'), { url: 'https://ur.wikipedia.org', displayName: 'وکی پیڈیا' });

console.log('\n── 2) Searches + home ───────────────────────────────');
check('«گوگل پر موسم تلاش کرو» → search موسم', L.parseBrowserCommand('گوگل پر موسم تلاش کرو'), { url: '', displayName: 'گوگل', searchQuery: 'موسم' });
check('«گوگل پر لاہور کا موسم تلاش کرو» → search لاہور کا موسم', L.parseBrowserCommand('گوگل پر لاہور کا موسم تلاش کرو'), { url: '', displayName: 'گوگل', searchQuery: 'لاہور کا موسم' });
check('«کراچی سرچ کرو» → search کراچی', L.parseBrowserCommand('کراچی سرچ کرو'), { url: '', displayName: 'کراچی', searchQuery: 'کراچی' });
check('«search weather» → search weather', L.parseBrowserCommand('search weather'), { url: '', displayName: 'گوگل', searchQuery: 'weather' });
check('«weather search» → search weather', L.parseBrowserCommand('weather search'), { url: '', displayName: 'weather', searchQuery: 'weather' });
check('«براؤزر کھولو» → home', L.parseBrowserCommand('براؤزر کھولو'), { url: '', displayName: 'براؤزر' });
check('«browser kholo» → home', L.parseBrowserCommand('browser kholo'), { url: '', displayName: 'براؤزر' });
check('«گوگل کھولو» → search view, not google.com', L.parseBrowserCommand('گوگل کھولو'), { url: '', displayName: 'گوگل', searchQuery: '' });
check('unknown «زوم کھولو» → search زوم', L.parseBrowserCommand('زوم کھولو'), { url: '', displayName: 'زوم', searchQuery: 'زوم' });

console.log('\n── 3) Non-commands stay null ────────────────────────');
check('fact question «آج موسم کیسا ہے؟» → null', L.parseBrowserCommand('آج موسم کیسا ہے؟'), null);
check('«مجھے یوٹیوب کے بارے میں بتاؤ» → null', L.parseBrowserCommand('مجھے یوٹیوب کے بارے میں بتاؤ'), null);
check('site-qualified «یوٹیوب پر گانا تلاش کرو» → null (brain keeps it)', L.parseBrowserCommand('یوٹیوب پر گانا تلاش کرو'), null);
check('decision «کیا کروں؟» → null', L.parseBrowserCommand('کیا کروں؟'), null);
check('alarm «الارم لگا دو» → null', L.parseBrowserCommand('الارم لگا دو'), null);
check('study «کلاس دس کی ریاضی تلاش کرو» → null', L.parseBrowserCommand('کلاس دس کی ریاضی تلاش کرو'), null);
check('study «امتحان کی تیاری تلاش کرو» → null', L.parseBrowserCommand('امتحان کی تیاری تلاش کرو'), null);
check('empty → null', L.parseBrowserCommand('   '), null);

console.log('\n── 4) Embed blocks ──────────────────────────────────');
for (const host of ['youtube.com', 'www.youtube.com', 'youtu.be', 'facebook.com', 'instagram.com', 'tiktok.com', 'x.com', 'twitter.com', 'web.whatsapp.com', 'mail.google.com', 'google.com', 'maps.google.com', 'drive.google.com', 'docs.google.com', 'play.google.com', 'github.com', 'chat.openai.com', 'gemini.google.com', 'm.youtube.com']) {
  checkTrue(`${host} is blocked`, L.isBlockedEmbedUrl(`https://${host}/some/page`));
}
for (const host of ['example.com', 'example.org', 'ur.wikipedia.org', 'en.wikipedia.org', 'news.example.pk']) {
  checkTrue(`${host} is NOT blocked`, !L.isBlockedEmbedUrl(`https://${host}/page`));
}
checkTrue('invalid URL is not blocked', !L.isBlockedEmbedUrl('not a url'));

console.log('\n── 5) URL normalisation ─────────────────────────────');
check('bare domain gets https://', L.normalizeBrowserUrl('example.com'), 'https://example.com');
check('full URL passes through', L.normalizeBrowserUrl('https://x.com/foo'), 'https://x.com/foo');
check('subdomain + path', L.normalizeBrowserUrl('sub.example.co.uk/path'), 'https://sub.example.co.uk/path');
check('phrase is not a URL', L.normalizeBrowserUrl('hello world'), null);
check('empty is not a URL', L.normalizeBrowserUrl('  '), null);

console.log('\n── 6) Quick sites + mirrors ─────────────────────────');
checkTrue('QUICK_SITES has 6 entries incl. the big four', L.QUICK_SITES.length === 6 && ['یوٹیوب', 'فیس بک', 'ٹک ٹاک', 'انسٹاگرام'].every((n) => L.QUICK_SITES.some((s) => s.displayName === n)));
checkTrue('SIDE_BROWSER_GUIDANCE names the side browser + never pretends', L.SIDE_BROWSER_GUIDANCE.includes('side browser') && L.SIDE_BROWSER_GUIDANCE.includes('never pretends'));
checkTrue('HOW_TO_GUIDANCE says plainly when unknown + never invents', L.HOW_TO_GUIDANCE.includes('یقینی طور پر نہیں آتا') && L.HOW_TO_GUIDANCE.includes('Never invent'));

console.log('\n── 7) Server ADD-ONLY entries ───────────────────────');
const serverPrompt = readFileSync(join(repoRoot, 'server/index.js'), 'utf8');
checkTrue('OWN SIDE BROWSER entry exists (2026-11-28)', serverPrompt.includes('OWN SIDE BROWSER (ADD-ONLY 2026-11-28'));
checkTrue('DOWNLOAD AND HOW-TO entry exists (2026-11-28)', serverPrompt.includes('DOWNLOAD AND HOW-TO (ADD-ONLY 2026-11-28'));
checkTrue('side-browser entry forbids pretending it opened inside', serverPrompt.includes('never pretend it opened inside'));
checkTrue('how-to entry forbids inventing a download link', serverPrompt.includes('Never invent a download link'));
checkTrue('previous STUDY — UPCOMING entry still present (append-only)', serverPrompt.includes('STUDY — UPCOMING / ANTICIPATORY (ADD-ONLY 2026-11-28'));

console.log(`\nside-browser: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
