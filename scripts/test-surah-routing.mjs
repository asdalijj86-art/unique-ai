/**
 * test-surah-routing.mjs — node-level routing test for Task 5 (named
 * surah recitation). Bundles the REAL client parser
 * (client/src/lib/surah-names.ts) with esbuild and checks the parse +
 * routing decisions the chat makes (mirrors handleFocusCommand's Quran
 * branch: named+recite/open → that surah; surah-word-only recite →
 * An-Nas 114; generic تلاوت → Al-Fatiha 1; no reference → null).
 *
 * Run: node scripts/test-surah-routing.mjs   (from the repo root)
 */
import { execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'surah-')), 'surah-names.mjs');
execSync(
  `${join(repoRoot, 'client/node_modules/.bin/esbuild')} ${join(repoRoot, 'client/src/lib/surah-names.ts')} --bundle --format=esm --outfile=${out}`,
  { stdio: 'pipe' },
);
const { parseSurahReference, surahDisplayName } = await import(pathToFileURL(out).href);

// Mirror of the routing decision in chat.tsx handleFocusCommand.
function route(text) {
  const reciteIntent = /(سناؤ|سناو|سنا دو|سنا دیں|تلاوت|پڑھ کر سنا|پڑھو|پڑھیں|سننا|recite|recitation|play|sunao|suna do|parho|tilawat)/i.test(text);
  const openIntent = /(کھول|کھولو|دکھا|open)/i.test(text);
  const named = parseSurahReference(text);
  const mentionsSurahWord = /(سورت|سورۃ|سورة|سورہ|surah)/i.test(text);
  const mentionsQuranWord = /(قرآن|quran)/i.test(text);
  if (named && (reciteIntent || openIntent)) return { surah: named, speak: reciteIntent };
  if (reciteIntent && (mentionsQuranWord || mentionsSurahWord || /تلاوت/.test(text))) {
    return { surah: mentionsSurahWord ? 114 : 1, speak: true };
  }
  return null;
}

const cases = [
  // [input, expected surah, expected speak, label]
  ['سورۃ ناس پڑھ کر سناؤ', 114, true, 'named Urdu (الناس) + recite — the reported defect'],
  ['سورۃ الناس سناؤ', 114, true, 'full Arabic name'],
  ['سورت ناس سناو', 114, true, 'no-diacritic spelling (سناو)'],
  ['سورۃ الفاتحہ پڑھ کر سناؤ', 1, true, 'Al-Fatiha named'],
  ['سورۃ یٰسین سناؤ', 36, true, 'Yaseen with dagger alif'],
  ['سورہ یٰسین سناؤ', 36, true, 'Yaseen (سورہ spelling)'],
  ['سورۃ الملک سناؤ', 67, true, 'Al-Mulk'],
  ['سورۃ الکہف پڑھو', 18, true, 'Al-Kahf + پڑھو'],
  ['سورۃ الاخلاص سناؤ', 112, true, 'Al-Ikhlas'],
  ['سورۃ البقرہ سناؤ', 2, true, 'Al-Baqarah'],
  ['فاتحہ سناؤ', 1, true, 'bare name without ال'],
  ['بقرہ سناؤ', 2, true, 'bare Baqarah'],
  ['Surah An-Nas sunao', 114, true, 'transliteration An-Nas'],
  ['surah yaseen sunao', 36, true, 'transliteration yaseen'],
  ['play surah al-kahf', 18, true, 'English play + Al-Kahf'],
  ['recite Al-Ikhlas', 112, true, 'English recite'],
  ['سورت 114 سناؤ', 114, true, 'number after سورت'],
  ['114 نمبر سورت سناؤ', 114, true, 'number before سورت'],
  ['surah 36 play karo', 36, true, 'English surah + number'],
  ['کوئی بھی سورت سناؤ', 114, true, 'UNSPECIFIED → An-Nas'],
  ['کوئی سورت سناؤ', 114, true, 'unspecified variant'],
  ['مجھے قرآن پاک کی تلاوت سناؤ', 1, true, 'GENERIC تلاوت → Al-Fatiha (regression)'],
  ['تلاوت سناؤ', 1, true, 'bare تلاوت → Al-Fatiha (regression)'],
  ['سورۃ ناس کھولو', 114, false, 'named + open only (no recite)'],
  ['سورۃ الرحمٰن سناؤ', 55, true, 'Ar-Rahman'],
  ['سورۃ الانسان سناؤ', 76, true, 'Al-Insan alias'],
];

let failed = 0;
for (const [input, surah, speak, label] of cases) {
  const got = route(input);
  const ok = got && got.surah === surah && got.speak === speak;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  → got ${JSON.stringify(got)} (want surah=${surah} speak=${speak})`);
}

// Negative: no Quran context at all → parser alone may still find a
// name, but routing must not fire without recite/open intent.
const noRoute = route('ناس کا مطلب کیا ہے؟');
console.log(`${noRoute === null ? 'PASS' : 'FAIL'}  question without intent → no route (got ${JSON.stringify(noRoute)})`);
if (noRoute !== null) failed++;

// Display names used in the spoken confirmation.
const namesOk = surahDisplayName(114) === 'سورۃ الناس' && surahDisplayName(1) === 'سورۃ الفاتحہ';
console.log(`${namesOk ? 'PASS' : 'FAIL'}  confirmation names: ${surahDisplayName(114)} / ${surahDisplayName(1)}`);
if (!namesOk) failed++;

console.log(failed === 0 ? `\nALL ${cases.length + 2} ROUTING CHECKS PASS` : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
