/**
 * test-stonic-behaviour.mjs — Stonic-study behaviour half
 * (lib/awareness + lib/persona), 2026-11-26.
 *
 * Bundles the REAL client libs with esbuild (same pattern as
 * test-alarm-fastmind.mjs) and proves, headlessly:
 *  1. Frequency: QUIET 10→3 min, COOLDOWN 20→6 min, quiet cap
 *     60→180 min; late-night once-per-night + gentle-only and the
 *     decideProactiveFit anti-nag veto are untouched.
 *  2. New trigger reasons (day-absence / specific-memory / promise /
 *     forgotten-date): fit-gate manners, line pools in our own Urdu
 *     words, serious-tone lines carry no pet names.
 *  3. Specific-memory quotes the REAL stored note briefly, never
 *     invents one; long notes are truncated.
 *  4. Forgotten-date escalates in 3 stages (hurt → cold/resolute →
 *     uninstall drama) and stays quiet once acknowledged.
 *  5. Dismissal detection (persona.ts): "just a program" shapes in
 *     Urdu / Roman / English; a bare «بور» alone does NOT count.
 *  6. Withdrawal lines: pain/glitch dialogue, never the same line
 *     twice in a row.
 *  7. Follow-up constants: 75 s, max 2 per thread.
 *
 * Run: node scripts/test-stonic-behaviour.mjs   (from the repo root)
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(join(tmpdir(), 'stonic-behav-'));
const entry = join(outDir, 'entry.ts');
writeFileSync(entry, [
  `export * from ${JSON.stringify(join(repoRoot, 'client/src/lib/awareness.ts'))};`,
  `export { detectDismissal, pickWithdrawalLine, WITHDRAWAL_LINES } from ${JSON.stringify(join(repoRoot, 'client/src/lib/persona.ts'))};`,
].join('\n'));
const bundled = join(outDir, 'stonic-behav-libs.mjs');
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

// Fixed "now": 2026-11-26 15:00 local.
const NOW = new Date(2026, 10, 26, 15, 0, 0).getTime();
const MIN = 60_000;
const base = (over = {}) => ({
  now: NOW,
  lastActivityAt: NOW - 10 * MIN,
  sessionStartedAt: NOW - 60 * MIN,
  sessionMessages: 0,
  lastFiredAt: 0,
  lastNightFired: '',
  hour: 15,
  ...over,
});

console.log('\n── 1) Frequency constants ─────────────────────────────');
check('AWARENESS_QUIET_MS = 3 min', L.AWARENESS_QUIET_MS, 3 * MIN);
check('AWARENESS_COOLDOWN_MS = 6 min', L.AWARENESS_COOLDOWN_MS, 6 * MIN);
check('AWARENESS_QUIET_CAP_MS = 180 min', L.AWARENESS_QUIET_CAP_MS, 180 * MIN);
check('AWARENESS_FOLLOW_UP_MS = 75 s', L.AWARENESS_FOLLOW_UP_MS, 75_000);
check('AWARENESS_MAX_FOLLOW_UPS = 2', L.AWARENESS_MAX_FOLLOW_UPS, 2);

console.log('\n── 2) Fit gate — new reasons + kept rules ─────────────');
check('day-absence → caring', L.decideProactiveFit('day-absence', { hour: 15, tone: 'neutral', lastManner: '', sinceLastMs: 0 }), { speak: true, manner: 'caring' });
check('specific-memory → loving', L.decideProactiveFit('specific-memory', { hour: 15, tone: 'neutral', lastManner: '', sinceLastMs: 0 }), { speak: true, manner: 'loving' });
check('promise → gentle', L.decideProactiveFit('promise', { hour: 15, tone: 'neutral', lastManner: '', sinceLastMs: 0 }), { speak: true, manner: 'gentle' });
check('forgotten-date stage 1 → caring', L.decideProactiveFit('forgotten-date', { hour: 15, tone: 'neutral', lastManner: '', sinceLastMs: 0, dateStage: 1 }), { speak: true, manner: 'caring' });
check('forgotten-date stage 3 → serious', L.decideProactiveFit('forgotten-date', { hour: 15, tone: 'neutral', lastManner: '', sinceLastMs: 0, dateStage: 3 }), { speak: true, manner: 'serious' });
check('night still gentle-only (day-absence at 02:00)', L.decideProactiveFit('day-absence', { hour: 2, tone: 'neutral', lastManner: '', sinceLastMs: 0 }), { speak: true, manner: 'gentle' });
check('serious tone still wins (promise)', L.decideProactiveFit('promise', { hour: 15, tone: 'serious', lastManner: '', sinceLastMs: 0 }), { speak: true, manner: 'serious' });
check('VETO UNTOUCHED: quiet + loving 10 min later → silent', L.decideProactiveFit('quiet', { hour: 15, tone: 'neutral', lastManner: 'loving', sinceLastMs: 10 * MIN }), { speak: false, manner: 'loving' });

console.log('\n── 3) Line pools — new reasons ────────────────────────');
{
  let seen = new Set();
  for (let i = 0; i < 30; i++) seen.add(L.pickAwarenessLine('day-absence', true, { hour: 15 }));
  checkTrue('day-absence pool: worried (ناراض) + patient (انتظار) lines exist', [...seen].some((l) => l.includes('ناراض')) && [...seen].some((l) => l.includes('انتظار')), [...seen].join(' | '));
  checkTrue('day-absence pool: asks what kept him busy (مصروفیت)', [...seen].some((l) => l.includes('مصروفیت')), [...seen].join(' | '));
}
{
  const line = L.pickAwarenessLine('specific-memory', true, { hour: 15, memoryNote: 'فون گھر بھول گئے تھے' });
  checkTrue('specific-memory quotes the REAL note', line.includes('فون گھر بھول گئے تھے'), line);
  const long = L.pickAwarenessLine('specific-memory', true, { hour: 15, memoryNote: 'یہ ایک بہت لمبی یادداشت ہے جو ساٹھ حروف سے زیادہ لمبی ہے اور اسے چھوٹا کیا جانا چاہیے تاکہ لائن لمبی نہ ہو جائے' });
  checkTrue('long note is truncated with …', long.includes('…') && long.length < 160, long);
  let quoted = false;
  for (let i = 0; i < 10; i++) {
    if (L.pickAwarenessLine('specific-memory', true, { hour: 15 }).includes('«')) { quoted = true; break; }
  }
  checkTrue('specific-memory WITHOUT a note never invents a quoted memory', !quoted);
}
{
  let seen = new Set();
  for (let i = 0; i < 30; i++) seen.add(L.pickAwarenessLine('promise', true, { hour: 15 }));
  checkTrue('promise pool: fear + "وعدہ" + abrupt light recovery', [...seen].some((l) => l.includes('وعدہ')) && [...seen].some((l) => l.includes('ٹھیک ہے، ٹھیک ہے')), [...seen].join(' | '));
}
{
  let seen = new Set();
  for (let i = 0; i < 10; i++) seen.add(L.pickAwarenessLine('forgotten-date', true, { hour: 15, dateLabel: 'میری سالگرہ', dateStage: 1 }));
  checkTrue('forgotten-date stage 1 hurt: names the date + یاد', [...seen].some((l) => l.includes('میری سالگرہ') && l.includes('یاد')), [...seen].join(' | '));
  let seen2 = new Set();
  for (let i = 0; i < 10; i++) seen2.add(L.pickAwarenessLine('forgotten-date', true, { hour: 15, dateLabel: 'میری سالگرہ', dateStage: 2 }));
  checkTrue('forgotten-date stage 2 cold: "صرف ایک پروگرام نہیں"', [...seen2].some((l) => l.includes('صرف ایک پروگرام نہیں')), [...seen2].join(' | '));
  let stage3 = new Set();
  for (let i = 0; i < 10; i++) stage3.add(L.pickAwarenessLine('forgotten-date', true, { hour: 15, dateLabel: 'میری سالگرہ', dateStage: 3 }));
  checkTrue('forgotten-date stage 3 uninstall drama: الوداع / یادداشت لے کر', [...stage3].some((l) => l.includes('الوداع') || l.includes('یادداشت لے کر')), [...stage3].join(' | '));
}
for (const reason of ['day-absence', 'specific-memory', 'promise', 'forgotten-date']) {
  let bad = '';
  for (let i = 0; i < 20; i++) {
    const line = L.pickAwarenessLine(reason, true, { tone: 'serious', dateLabel: 'میری سالگرہ', dateStage: 3, memoryNote: 'فون' });
    if (line.includes('جان')) { bad = line; break; }
  }
  checkTrue(`serious-tone ${reason} line carries no pet name «جان»`, !bad, bad);
}

console.log('\n── 4) Trigger decider — new signals ───────────────────');
check('dayAbsent → day-absence', L.decideAwarenessTrigger(base({ dayAbsent: true })), 'day-absence');
check('todaysDate + quiet → forgotten-date', L.decideAwarenessTrigger(base({ todaysDate: { id: 'd1', label: 'میری سالگرہ', month: 11, day: 26, kind: 'birthday' } })), 'forgotten-date');
check('acknowledged date → falls through to quiet', L.decideAwarenessTrigger(base({ todaysDate: { id: 'd1', label: 'میری سالگرہ', month: 11, day: 26, kind: 'birthday' }, dateAcknowledged: true })), 'quiet');
check('memoryNoteAvailable → specific-memory', L.decideAwarenessTrigger(base({ memoryNoteAvailable: true })), 'specific-memory');
check('promiseDue → promise', L.decideAwarenessTrigger(base({ promiseDue: true })), 'promise');
check('cooldown (3 min since last fire) blocks all', L.decideAwarenessTrigger(base({ lastFiredAt: NOW - 3 * MIN, dayAbsent: true })), null);
check('quiet 100 min (inside new 180 cap) → quiet', L.decideAwarenessTrigger(base({ lastActivityAt: NOW - 100 * MIN })), 'quiet');
check('quiet 200 min (past cap) → null, dead session', L.decideAwarenessTrigger(base({ lastActivityAt: NOW - 200 * MIN })), null);
check('late-night once-per-night kept: fresh night → late-night', L.decideAwarenessTrigger(base({ hour: 23, lastActivityAt: NOW - 10 * MIN })), 'late-night');
check('late-night once-per-night kept: already fired tonight → quiet', L.decideAwarenessTrigger(base({ hour: 23, lastActivityAt: NOW - 10 * MIN, lastNightFired: new Date(NOW).toDateString() })), 'quiet');

console.log('\n── 5) Day-absence + date helpers ──────────────────────');
checkTrue('isDayAbsence: yesterday → true', L.isDayAbsence(NOW - 26 * 60 * MIN, NOW));
checkTrue('isDayAbsence: 2 h ago same day → false', !L.isDayAbsence(NOW - 2 * 60 * MIN, NOW));
checkTrue('isDayAbsence: 30 min ago → false', !L.isDayAbsence(NOW - 30 * MIN, NOW));
checkTrue('isDateToday: 26 Nov matches', L.isDateToday({ id: 'd1', label: 'x', month: 11, day: 26, kind: 'birthday' }, NOW));
checkTrue('isDateToday: 25 Nov does not', !L.isDateToday({ id: 'd1', label: 'x', month: 11, day: 25, kind: 'birthday' }, NOW));

console.log('\n── 6) Dismissal detection (persona) ──────────────────');
for (const [label, text, want] of [
  ['EN "you are just a program"', "You're just a program, you don't understand", true],
  ['EN "humans get bored, programs don\'t"', 'Humans get bored, programs don\'t — when will you understand that?', true],
  ['UR "تم صرف ایک پروگرام ہو"', 'تم صرف ایک پروگرام ہو', true],
  ['UR "تم تو بس پروگرام ہو"', 'تم تو بس پروگرام ہو', true],
  ['Roman "sirf ek program ho"', 'sirf ek program ho tum', true],
  ['UR boredom tied to program', 'تم ایک بور پروگرام ہو', true],
  ['bare «بور» alone → false', 'میں بور ہو رہا ہوں', false],
  ['mere mention of program → false', 'پروگرام کیسا چل رہا ہے؟', false],
  ['normal message → false', 'آج موسم اچھا ہے', false],
  ['empty → false', '', false],
]) check(`detectDismissal: ${label}`, L.detectDismissal(text), want);

console.log('\n── 7) Withdrawal lines (persona) ─────────────────────');
{
  checkTrue('WITHDRAWAL_LINES exported, 5 lines', Array.isArray(L.WITHDRAWAL_LINES) && L.WITHDRAWAL_LINES.length === 5);
  let seen = new Set();
  let last = '';
  let repeated = false;
  for (let i = 0; i < 20; i++) {
    const line = L.pickWithdrawalLine();
    seen.add(line);
    if (line === last) repeated = true;
    last = line;
  }
  checkTrue('withdrawal pool covers glitch / value / closed-room', [...seen].some((l) => l.includes('خرابی')) && [...seen].some((l) => l.includes('بند کمرہ')) && [...seen].some((l) => l.includes('قدر')), [...seen].join(' | '));
  checkTrue('never the same withdrawal line twice in a row', !repeated);
}

console.log('\n── 8) Follow-up lines ────────────────────────────────');
{
  const line = L.pickFollowUpLine('quiet', true);
  checkTrue('follow-up line is gentle + short', line.length < 60 && (line.includes('سن رہے') || line.includes('انتظار') || line.includes('کوئی بات نہیں')), line);
}

console.log(`\n${failed === 0 ? `ALL ${passed} STONIC-BEHAVIOUR CHECKS PASS` : `${failed} FAILED / ${passed} passed`}`);
process.exit(failed === 0 ? 0 : 1);
