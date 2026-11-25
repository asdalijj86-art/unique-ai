/**
 * test-alarm-fastmind.mjs — alarm parsing (lib/alarm) + fast-mind
 * gate (lib/awareness) + FAST_MIND_GUIDANCE record (lib/persona).
 *
 * Bundles the REAL client libs with esbuild (same pattern as
 * test-persona.mjs) and proves, headlessly:
 *  1. Alarm commands parse in Urdu / Roman Urdu / English, with the
 *     right fire time (absolute rolls to tomorrow when passed,
 *     relative minutes/hours/seconds work).
 *  2. Command-shaped only: a bare «الارم لگا دو» with no time, and
 *     long messages merely mentioning an alarm, parse to null — the
 *     brain asks which time instead of us guessing one.
 *  3. List / cancel (next / all) parse.
 *  4. Countdown + time formatting, storage round-trip, fire lines
 *     (feminine «جان», masculine without it).
 *  5. Fast-mind gate: serious tone → serious manner; night →
 *     gentle only; same loving manner too soon on 'quiet' → stay
 *     silent; long-work by day → caring. Serious lines carry no
 *     pet names; the memory-grounded quiet line appears only when
 *     the learning brain really holds something.
 *
 * Run: node scripts/test-alarm-fastmind.mjs   (from the repo root)
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(join(tmpdir(), 'alarm-'));
const entry = join(outDir, 'entry.ts');
writeFileSync(entry, [
  `export * from ${JSON.stringify(join(repoRoot, 'client/src/lib/alarm.ts'))};`,
  `export * from ${JSON.stringify(join(repoRoot, 'client/src/lib/awareness.ts'))};`,
  `export { FAST_MIND_GUIDANCE } from ${JSON.stringify(join(repoRoot, 'client/src/lib/persona.ts'))};`,
].join('\n'));
const bundled = join(outDir, 'alarm-libs.mjs');
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

// Fixed "now": 2026-11-26 10:00 local — morning alarms roll to tomorrow.
const NOW = new Date(2026, 10, 26, 10, 0, 0).getTime();
const at = (y, mo, d, h, mi = 0) => new Date(y, mo, d, h, mi, 0).getTime();

console.log('\n── 1) Alarm set parsing ───────────────────────────────');
{
  const c = L.parseAlarmCommand('صبح 7 بجے الارم لگا دو', NOW);
  check('«صبح 7 بجے الارم لگا دو» → set tomorrow 07:00', c && { type: c.type, fireAt: c.fireAt }, { type: 'set', fireAt: at(2026, 10, 27, 7) });
}
{
  const c = L.parseAlarmCommand('صبح 7 بجے مجھے اٹھنا ہے، الارم لگا دو', NOW);
  check('wake-up line → set, label «اٹھنا ہے»', c && { type: c.type, fireAt: c.fireAt, label: c.label }, { type: 'set', fireAt: at(2026, 10, 27, 7), label: 'اٹھنا ہے' });
}
{
  const c = L.parseAlarmCommand('صبح 7 بجے مجھے اٹھنا ہے', NOW);
  check('wake-up line WITHOUT the alarm word still sets', c && c.type, 'set');
}
{
  const c = L.parseAlarmCommand('سات بجے الارم لگا دو', NOW);
  check('Urdu word hour «سات بجے» → set tomorrow 07:00', c && { type: c.type, fireAt: c.fireAt }, { type: 'set', fireAt: at(2026, 10, 27, 7) });
}
{
  const c = L.parseAlarmCommand('رات 9 بجے کام کا الارم لگا دو', NOW);
  check('«رات 9 بجے کام کا الارم» → set today 21:00, label «کام»', c && { type: c.type, fireAt: c.fireAt, label: c.label }, { type: 'set', fireAt: at(2026, 10, 26, 21), label: 'کام' });
}
{
  const c = L.parseAlarmCommand('10 منٹ بعد الارم لگا دو', NOW);
  check('«10 منٹ بعد» → relative 600s', c && { type: c.type, fireAt: c.fireAt }, { type: 'set', fireAt: NOW + 600_000 });
}
{
  const c = L.parseAlarmCommand('30 سیکنڈ بعد الارم لگا دو', NOW);
  check('«30 سیکنڈ بعد» → relative 30s', c && { type: c.type, fireAt: c.fireAt }, { type: 'set', fireAt: NOW + 30_000 });
}
{
  const c = L.parseAlarmCommand('آدھے گھنٹے بعد الارم لگا دو', NOW);
  check('«آدھے گھنٹے بعد» → relative 30min', c && { type: c.type, fireAt: c.fireAt }, { type: 'set', fireAt: NOW + 30 * 60_000 });
}
{
  const c = L.parseAlarmCommand('set an alarm for 7:30', NOW);
  check('"set an alarm for 7:30" → set tomorrow 07:30', c && { type: c.type, fireAt: c.fireAt }, { type: 'set', fireAt: at(2026, 10, 27, 7, 30) });
}
{
  const c = L.parseAlarmCommand('in 5 minutes set an alarm', NOW);
  check('"in 5 minutes set an alarm" → relative 300s', c && { type: c.type, fireAt: c.fireAt }, { type: 'set', fireAt: NOW + 300_000 });
}
{
  const c = L.parseAlarmCommand('7 بج کر 30 منٹ پر الارم لگا دو', NOW);
  check('«7 بج کر 30 منٹ» → set today 07:30 rolls to tomorrow', c && { type: c.type, fireAt: c.fireAt }, { type: 'set', fireAt: at(2026, 10, 27, 7, 30) });
}

console.log('\n── 2) Command-shaped only ───────────────────────────');
check('bare «الارم لگا دو» (no time) → null (brain asks)', L.parseAlarmCommand('الارم لگا دو', NOW), null);
check('«کبھی بھی کام کرنا ہے الارم لگا دو» (no time) → null', L.parseAlarmCommand('کبھی بھی کام کرنا ہے الارم لگا دو', NOW), null);
check('long message merely mentioning alarm → null', L.parseAlarmCommand('کل میں نے ایک خواب دیکھا جس میں الارم بج رہا تھا اور میں نے سوچا کہ الارم کی آواز کتنی تیز ہوتی ہے اور پھر میں نے ناشتہ کیا اور دفتر گیا اور وہاں بھی الارم کی بات ہوئی', NOW), null);
check('«مجھے اٹھنا ہے» with no time → null', L.parseAlarmCommand('مجھے اٹھنا ہے', NOW), null);

console.log('\n── 3) List / cancel ─────────────────────────────────');
check('«الارم دکھاؤ» → list', L.parseAlarmCommand('الارم دکھاؤ', NOW), { type: 'list' });
check('«الارم بند کر دو» → cancel next', L.parseAlarmCommand('الارم بند کر دو', NOW), { type: 'cancel', scope: 'next' });
check('«سارے الارم بند کر دو» → cancel all', L.parseAlarmCommand('سارے الارم بند کر دو', NOW), { type: 'cancel', scope: 'all' });

console.log('\n── 4) Formatting + storage + fire lines ─────────────');
check('countdown 90s', L.formatCountdown(NOW + 90_000, NOW), '1 منٹ 30 سیکنڈ باقی');
check('countdown 8100s', L.formatCountdown(NOW + 8100_000, NOW), '2 گھنٹے 15 منٹ باقی');
check('countdown 45s', L.formatCountdown(NOW + 45_000, NOW), '45 سیکنڈ باقی');
check('time format 07:00', L.formatAlarmTime(at(2026, 10, 27, 7), NOW), 'صبح 7:00 (کل)');
check('time format 21:30 same day', L.formatAlarmTime(new Date(2026, 10, 26, 21, 30).getTime(), NOW), 'رات 9:30');
{
  const store = {};
  const fake = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
  const alarms = [L.makeAlarm(NOW + 600_000, 'اٹھنا'), L.makeAlarm(NOW + 3600_000, 'نماز')];
  L.saveAlarms(fake, alarms);
  const back = L.loadAlarms(fake);
  check('storage round-trip keeps both alarms', back.map((a) => a.label), ['اٹھنا', 'نماز']);
  check('nextAlarm is the earliest', L.nextAlarm(back, NOW)?.label, 'اٹھنا');
  check('dueAlarms: none due yet', L.dueAlarms(back, NOW).length, 0);
  check('dueAlarms: first due at +10min', L.dueAlarms(back, NOW + 600_000).length, 1);
}
checkTrue('fire line (feminine) uses «جان» + label', L.alarmFireLine({ id: 'x', fireAt: NOW, label: 'اٹھنا', createdAt: NOW }, true).includes('جان') && L.alarmFireLine({ id: 'x', fireAt: NOW, label: 'اٹھنا', createdAt: NOW }, true).includes('اٹھنا'));
checkTrue('fire line (masculine) has no «جان»', !L.alarmFireLine({ id: 'x', fireAt: NOW, label: 'اٹھنا', createdAt: NOW }, false).includes('جان'));

console.log('\n── 5) Fast-mind gate ────────────────────────────────');
checkTrue('FAST_MIND_GUIDANCE exists: memory + feeling + think', typeof L.FAST_MIND_GUIDANCE === 'string' && /memory/i.test(L.FAST_MIND_GUIDANCE) && /feeling/i.test(L.FAST_MIND_GUIDANCE) && /think/i.test(L.FAST_MIND_GUIDANCE));
check('serious tone → serious manner', L.decideProactiveFit('quiet', { hour: 15, tone: 'serious', lastManner: '', sinceLastMs: 0 }), { speak: true, manner: 'serious' });
check('night (02:00) → gentle', L.decideProactiveFit('quiet', { hour: 2, tone: 'neutral', lastManner: '', sinceLastMs: 0 }), { speak: true, manner: 'gentle' });
check('quiet + same loving manner 10 min later → STAY SILENT', L.decideProactiveFit('quiet', { hour: 15, tone: 'neutral', lastManner: 'loving', sinceLastMs: 10 * 60_000 }), { speak: false, manner: 'loving' });
check('quiet + same manner 40 min later → speak', L.decideProactiveFit('quiet', { hour: 15, tone: 'neutral', lastManner: 'loving', sinceLastMs: 40 * 60_000 }), { speak: true, manner: 'loving' });
check('long-work by day → caring', L.decideProactiveFit('long-work', { hour: 15, tone: 'neutral', lastManner: '', sinceLastMs: 0 }), { speak: true, manner: 'caring' });
check('late-night → gentle', L.decideProactiveFit('late-night', { hour: 23, tone: 'neutral', lastManner: '', sinceLastMs: 0 }), { speak: true, manner: 'gentle' });
{
  const line = L.pickAwarenessLine('quiet', true, { tone: 'serious' });
  checkTrue('serious-tone line carries no pet name «جان»', !line.includes('جان'), line);
}
{
  const line = L.pickAwarenessLine('late-night', true, { hour: 2 });
  checkTrue('late-night line is about the night', line.includes('رات'), line);
}
{
  // Memory line appears only with hasMemory — sample the pool.
  let seen = false;
  for (let i = 0; i < 40; i++) {
    if (L.pickAwarenessLine('quiet', true, { hour: 15, hasMemory: true }).includes('یاد رہتی ہیں')) { seen = true; break; }
  }
  checkTrue('memory-grounded line appears when hasMemory', seen);
  let seenWithout = false;
  for (let i = 0; i < 40; i++) {
    if (L.pickAwarenessLine('quiet', true, { hour: 15, hasMemory: false }).includes('یاد رہتی ہیں')) { seenWithout = true; break; }
  }
  checkTrue('memory-grounded line NEVER appears without memory', !seenWithout);
}

console.log(`\n${failed === 0 ? `ALL ${passed} ALARM + FAST-MIND CHECKS PASS` : `${failed} FAILED / ${passed} passed`}`);
process.exit(failed === 0 ? 0 : 1);
