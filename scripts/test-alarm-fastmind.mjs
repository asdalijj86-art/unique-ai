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
 *  6. Her own decision (2026-11-27, lib/decision + server/decision.js
 *     mirror): decision-seeking inputs in Urdu / Roman Urdu / English
 *     → detected; factual inputs (weather, maths, date, prayer time,
 *     "what is this") → untouched; neutral replies carry no
 *     recommendation; the fallback line decides («تم یہ کرو») with
 *     feeling, from the turn's own words only. The server mirror must
 *     agree with the client on the whole corpus.
 *  7. Anticipatory fast mind (2026-11-27, `upcoming` reason in
 *     lib/awareness): the trigger fires only with a real upcoming
 *     item (morning, pre-18:30 story, approaching saved date, late
 *     rest) and returns null / falls through with none; once per kind
 *     per day; the fit gate (manner by kind, night gentle-only,
 *     same-feeling 30-min veto) and the line pools name only the real
 *     item.
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
  `export * from ${JSON.stringify(join(repoRoot, 'client/src/lib/decision.ts'))};`,
  `export { FAST_MIND_GUIDANCE, OWN_DECISION_GUIDANCE, ANTICIPATORY_MIND_GUIDANCE } from ${JSON.stringify(join(repoRoot, 'client/src/lib/persona.ts'))};`,
].join('\n'));
const bundled = join(outDir, 'alarm-libs.mjs');
execSync(
  `${join(repoRoot, 'client/node_modules/.bin/esbuild')} ${entry} --bundle --format=esm --outfile=${bundled}`,
  { stdio: 'pipe' },
);
const L = await import(pathToFileURL(bundled).href);
// Server mirror of the decision detector (plain Node ESM) — it must
// agree with the client lib on the whole corpus (section 6).
const S = await import(pathToFileURL(join(repoRoot, 'server/decision.js')).href);

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

console.log('\n── 6) Her own decision ──────────────────────────────');
const DECISION_CORPUS = [
  'مجھے نیا فون لینا چاہیے یا نہیں؟',
  'آج شام باہر جاؤں یا گھر رہوں؟',
  'کیا کروں؟',
  'کون سا بہتر ہے — چائے یا کافی؟',
  'کیسا رہے گا اگر میں کل چھٹی لے لوں؟',
  'تمہاری رائے کیا ہے؟',
  'مشورہ دو',
  'فیصلہ نہیں ہو رہا',
  'kya karoon?',
  'should I take a day off tomorrow?',
  'which is better, tea or coffee?',
  'kaisa rahega?',
  'what should I do?',
  'do you think I should go?',
];
for (const s of DECISION_CORPUS) {
  check(`decision-seeking: «${s.slice(0, 34)}»`, L.isDecisionSeeking(s), true);
}
const FACTUAL_CORPUS = [
  'کراچی میں موسم کیسا ہے؟',
  'کل موسم کیسا رہے گا؟',
  '2+2 کتنا ہے؟',
  '100 روپے کا 10 فیصد کتنا ہے؟',
  'آج تاریخ کیا ہے؟',
  'نماز کا وقت کیا ہے؟',
  'یہ کیا ہے؟',
  'what is the capital of France?',
  'مجھے سمجھ نہیں آ رہا یہ کیسے کام کرتا ہے',
  'السلام علیکم، کیا حال ہے؟',
];
for (const s of FACTUAL_CORPUS) {
  check(`factual (untouched): «${s.slice(0, 34)}»`, L.isDecisionSeeking(s), false);
}
checkTrue('neutral both-sides reply has NO recommendation',
  !L.hasRecommendation('دونوں راستے اچھے ہیں — باہر جانا بھی ٹھیک ہے اور گھر رہنا بھی۔'));
checkTrue('«تم یہ کرو» reply HAS a recommendation',
  L.hasRecommendation('میری رائے یہ ہے جان — تم یہ کرو: گھر رہنا۔'));
{
  const fb = L.decisionFallbackLine('آج شام باہر جاؤں یا گھر رہوں؟', 'دونوں ٹھیک ہیں۔', { feminine: true, hour: 15 });
  checkTrue('fallback (options) decides + feels + names first option as infinitive',
    fb.includes('تم یہ کرو') && L.hasFeeling(fb) && fb.includes('باہر جانا'), fb);
}
{
  const fb = L.decisionFallbackLine('آج شام باہر جاؤں یا گھر رہوں؟', 'دونوں ٹھیک ہیں۔', { feminine: false, hour: 15 });
  // The pet name «جان» as its own word — «جانا» (the infinitive) is
  // not the pet name, so a bare substring check would lie here.
  checkTrue('fallback (masculine) has no pet name «جان»', !/جان(?=[،۔—\s]|$)/.test(fb) && fb.includes('تم یہ کرو'), fb);
}
{
  const fb = L.decisionFallbackLine('کیا کروں؟', 'سوچ کر فیصلہ کریں۔', { feminine: true, hour: 15 });
  checkTrue('fallback (no options) still decides + feels', fb.includes('تم یہ کرو') && L.hasFeeling(fb), fb);
}
{
  const fb = L.decisionFallbackLine('کیا کروں؟', 'سوچ کر فیصلہ کریں۔', { feminine: true, hour: 23 });
  checkTrue('fallback at 23:00 decides rest', fb.includes('آرام'), fb);
}
{
  const fb = L.decisionFallbackLine('تھک گیا ہوں، باہر جاؤں یا گھر رہوں؟', 'دونوں ٹھیک ہیں۔', { feminine: true, hour: 15 });
  checkTrue('fallback when tired picks the restful option', fb.includes('گھر رہنا'), fb);
}
{
  // Mirror agreement: the server detector must give the SAME verdict
  // as the client on every string in both corpora.
  let agree = true;
  let bad = '';
  for (const s of [...DECISION_CORPUS, ...FACTUAL_CORPUS]) {
    if (L.isDecisionSeeking(s) !== S.isDecisionSeeking(s)) { agree = false; bad = s; break; }
    if (L.hasRecommendation(s) !== S.hasRecommendation(s)) { agree = false; bad = `hasRecommendation: ${s}`; break; }
  }
  checkTrue('server mirror agrees with client detector on the whole corpus', agree, bad);
  const fbCases = [
    ['آج شام باہر جاؤں یا گھر رہوں؟', 'دونوں ٹھیک ہیں۔', { feminine: true, hour: 15 }],
    ['کیا کروں؟', 'سوچ کر فیصلہ کریں۔', { feminine: true, hour: 23 }],
    ['should I go out or stay home?', 'both are fine.', { feminine: false, hour: 15 }],
    ['تھک گیا ہوں، باہر جاؤں یا گھر رہوں؟', 'دونوں ٹھیک ہیں۔', { feminine: true, hour: 15 }],
  ];
  let fbAgree = true;
  let fbBad = '';
  for (const [u, r, o] of fbCases) {
    if (L.decisionFallbackLine(u, r, o) !== S.decisionFallbackLine(u, r, o)) { fbAgree = false; fbBad = String(u); break; }
  }
  checkTrue('server mirror fallback lines match the client exactly', fbAgree, fbBad);
}
checkTrue('OWN_DECISION_GUIDANCE exists: own decision + never neutral',
  typeof L.OWN_DECISION_GUIDANCE === 'string'
  && /own clear decision/i.test(L.OWN_DECISION_GUIDANCE)
  && /never stays neutral/i.test(L.OWN_DECISION_GUIDANCE)
  && L.OWN_DECISION_GUIDANCE.includes('تم یہ کرو'),
  String(L.OWN_DECISION_GUIDANCE));
checkTrue('ANTICIPATORY_MIND_GUIDANCE exists: thinks ahead + 18:30 + no-lie',
  typeof L.ANTICIPATORY_MIND_GUIDANCE === 'string'
  && /thinks AHEAD/i.test(L.ANTICIPATORY_MIND_GUIDANCE)
  && L.ANTICIPATORY_MIND_GUIDANCE.includes('18:30')
  && /only ever claims preparation she really did/i.test(L.ANTICIPATORY_MIND_GUIDANCE),
  String(L.ANTICIPATORY_MIND_GUIDANCE));
{
  const { readFileSync } = await import('node:fs');
  const serverSrc = readFileSync(join(repoRoot, 'server/index.js'), 'utf8');
  checkTrue('server prompt: HER OWN DECISION addition present',
    serverSrc.includes('HER OWN DECISION (ADD-ONLY 2026-11-27'));
  checkTrue('server prompt: ANTICIPATORY FAST MIND addition present',
    serverSrc.includes('ANTICIPATORY FAST MIND (ADD-ONLY 2026-11-27'));
  checkTrue('server prompt: new entries appended AFTER CROSS-CHARACTER FEELING (ADD-ONLY)',
    serverSrc.indexOf('HER OWN DECISION') > serverSrc.indexOf('CROSS-CHARACTER FEELING')
    && serverSrc.indexOf('ANTICIPATORY FAST MIND') > serverSrc.indexOf('HER OWN DECISION'));
  checkTrue('server: per-turn decision directive wired',
    serverSrc.includes('decisionDirective') && serverSrc.includes('DECISION — THIS message asks for advice'));
  checkTrue('server: decision fallback wired (both reply paths)',
    (serverSrc.match(/decisionFallbackLine/g) || []).length >= 3);
  checkTrue('server: factual early returns untouched (weather/calc still bypass chat)',
    serverSrc.includes('if (intent === "weather"') && serverSrc.includes('if (intent === "calculator"'));
}

console.log('\n── 7) Anticipatory fast mind (`upcoming`) ────────────');
{
  const bday = [{ id: 'b1', label: 'میری سالگرہ', month: 11, day: 30, kind: 'birthday' }];
  check('morning 08:00, date in 3 days → date kind (date beats morning)',
    L.getUpcomingItem(at(2026, 10, 27, 8), { dates: bday })?.kind, 'date');
  check('17:30, date in 3 days → story kind (imminent today wins)',
    L.getUpcomingItem(at(2026, 10, 27, 17, 30), { dates: bday })?.kind, 'story');
  check('14:00, no dates → null (stays silent midday)',
    L.getUpcomingItem(at(2026, 10, 27, 14), { dates: [] }), null);
  check('08:00, no dates → morning',
    L.getUpcomingItem(at(2026, 10, 27, 8), { dates: [] })?.kind, 'morning');
  check('02:00, no dates → rest',
    L.getUpcomingItem(at(2026, 10, 27, 2), { dates: [] })?.kind, 'rest');
  check('date 5 days away at 08:00 → morning (too far to count)',
    L.getUpcomingItem(at(2026, 10, 27, 8), { dates: [{ id: 'b2', label: 'میری سالگرہ', month: 12, day: 2, kind: 'birthday' }] })?.kind, 'morning');
  check('date TODAY at 08:00 → morning (today belongs to forgotten-date)',
    L.getUpcomingItem(at(2026, 10, 27, 8), { dates: [{ id: 'b3', label: 'میری سالگرہ', month: 11, day: 27, kind: 'birthday' }] })?.kind, 'morning');
  check('nextUpcomingDate: tomorrow is 1 day away',
    L.nextUpcomingDate(bday, at(2026, 10, 29, 10))?.daysAway, 1);
  check('upcomingKey is once-per-kind-per-day',
    L.upcomingKey({ kind: 'morning', label: 'آج کا دن' }, at(2026, 10, 27, 8)), 'morning:2026-11-27');
}
{
  const base = {
    now: at(2026, 10, 27, 10),
    lastActivityAt: at(2026, 10, 27, 9, 50),
    sessionStartedAt: at(2026, 10, 27, 9, 0),
    sessionMessages: 1,
    lastFiredAt: 0,
    lastNightFired: '',
    hour: 10,
  };
  check('morning quiet 10 min + real upcoming item → upcoming',
    L.decideAwarenessTrigger({ ...base, upcomingItem: { kind: 'morning', label: 'آج کا دن' }, upcomingSpokenKey: '' }), 'upcoming');
  check('same kind already spoken today → NOT upcoming (falls to quiet)',
    L.decideAwarenessTrigger({ ...base, upcomingItem: { kind: 'morning', label: 'آج کا دن' }, upcomingSpokenKey: 'morning:2026-11-27' }), 'quiet');
  check('no upcoming item → NOT upcoming (plain quiet)',
    L.decideAwarenessTrigger({ ...base }), 'quiet');
  check('night 02:00 after late-night already fired → upcoming rest',
    L.decideAwarenessTrigger({
      now: at(2026, 10, 27, 2),
      lastActivityAt: at(2026, 10, 27, 1, 50),
      sessionStartedAt: at(2026, 10, 26, 23, 0),
      sessionMessages: 1,
      lastFiredAt: at(2026, 10, 27, 1, 0),
      lastNightFired: new Date(at(2026, 10, 27, 2)).toDateString(),
      hour: 2,
      upcomingItem: { kind: 'rest', label: 'کل کا دن' },
      upcomingSpokenKey: '',
    }), 'upcoming');
}
{
  const line = L.pickAwarenessLine('upcoming', true, { hour: 9, upcomingItem: { kind: 'morning', label: 'آج کا دن' } });
  checkTrue('morning upcoming line names the 6:30 story', line.includes('6:30') && line.includes('سٹوری'), line);
}
{
  const line = L.pickAwarenessLine('upcoming', true, { hour: 17, upcomingItem: { kind: 'story', label: 'شام 6:30 کی سٹوری' } });
  checkTrue('story upcoming line names 6:30', line.includes('6:30'), line);
}
{
  // The date pool has two lines (one names the days away) — sample it
  // the way the memory-line test does: every draw must name the real
  // label, and some draw must name the days.
  let sawDays = false;
  let allLabeled = true;
  for (let i = 0; i < 40; i++) {
    const line = L.pickAwarenessLine('upcoming', true, { hour: 10, upcomingItem: { kind: 'date', label: 'میری سالگرہ', daysAway: 2 } });
    if (!line.includes('میری سالگرہ')) allLabeled = false;
    if (line.includes('2 دن')) sawDays = true;
  }
  checkTrue('date upcoming lines always name the real label', allLabeled);
  checkTrue('date upcoming pool names the days away', sawDays);
}
{
  const line = L.pickAwarenessLine('upcoming', true, { hour: 2, upcomingItem: { kind: 'rest', label: 'کل کا دن' } });
  checkTrue('rest upcoming line is about tomorrow/rest', line.includes('کل') || line.includes('آرام'), line);
}
{
  const line = L.pickAwarenessLine('upcoming', false, { hour: 9, upcomingItem: { kind: 'morning', label: 'آج کا دن' } });
  checkTrue('masculine upcoming line has no «جان»', !line.includes('جان'), line);
}
{
  const line = L.pickAwarenessLine('upcoming', true, { tone: 'serious', upcomingItem: { kind: 'morning', label: 'آج کا دن' } });
  checkTrue('serious-tone upcoming line has no pet name', !line.includes('جان'), line);
}
{
  const line = L.pickAwarenessLine('upcoming', true, { hour: 14 });
  checkTrue('upcoming with NO real item claims nothing (presence only)',
    !line.includes('6:30') && !line.includes('سٹوری') && !line.includes('سالگرہ'), line);
}
check('upcoming morning by day → loving', L.decideProactiveFit('upcoming', { hour: 9, tone: 'neutral', lastManner: '', sinceLastMs: 0, upcomingKind: 'morning' }), { speak: true, manner: 'loving' });
check('upcoming date by day → caring', L.decideProactiveFit('upcoming', { hour: 10, tone: 'neutral', lastManner: '', sinceLastMs: 0, upcomingKind: 'date' }), { speak: true, manner: 'caring' });
check('upcoming at night → gentle', L.decideProactiveFit('upcoming', { hour: 2, tone: 'neutral', lastManner: '', sinceLastMs: 0, upcomingKind: 'rest' }), { speak: true, manner: 'gentle' });
check('upcoming + same loving manner 10 min later → STAY SILENT', L.decideProactiveFit('upcoming', { hour: 9, tone: 'neutral', lastManner: 'loving', sinceLastMs: 10 * 60_000, upcomingKind: 'morning' }), { speak: false, manner: 'loving' });
check('upcoming + same manner 40 min later → speak', L.decideProactiveFit('upcoming', { hour: 9, tone: 'neutral', lastManner: 'loving', sinceLastMs: 40 * 60_000, upcomingKind: 'morning' }), { speak: true, manner: 'loving' });

console.log(`\n${failed === 0 ? `ALL ${passed} CHECKS PASS (ALARM + FAST-MIND + DECISION + UPCOMING)` : `${failed} FAILED / ${passed} passed`}`);
process.exit(failed === 0 ? 0 : 1);
