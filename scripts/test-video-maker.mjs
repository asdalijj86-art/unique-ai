// Headless tests for client/src/lib/video-maker.ts (pure logic only).
// Run: node --experimental-strip-types /tmp/test-video-maker.mjs
// Node 24 strips types; the lib has no enums/namespaces, so it imports cleanly.
import {
  parseDialogue, speakingCharacters, computeEnvelope, mouthOpen, wrapLines,
  upsertCharacterLock, loadCharacterLocks, ensureCharacterLocks,
  saveVideoMakerJob, loadVideoMakerJob, videoMakerStatusText,
  isVideoMakerStatusQuery, shouldInterceptVideoMakerStatus,
  autoVoiceFor, autoSpeciesFor, autoHueFor,
  VIDEO_SCENE_SECONDS,
} from '/home/hatch/workspace/unique-ai-clean/client/src/lib/video-maker.ts';

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('PASS', name); }
  else { fail++; console.log('FAIL', name, extra); }
};
const store = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
};

// 1. Dialogue parsing — exact text preserved, no edits.
const scenes = parseDialogue('شاہ: یاد رکھو! اس جنگل میں میری اجازت کے بغیر کوئی فیصلہ نہیں ہوگا!\nزال: بادشاہ سلامت! آپ کی حکومت کا سورج اب ڈوبنے والا ہے!\nراوی: شیر کو پہلی بار خوف محسوس ہوا۔');
check('dialogue: 3 scenes', scenes.length === 3, JSON.stringify(scenes));
check('dialogue: exact text kept', scenes[0].text === 'یاد رکھو! اس جنگل میں میری اجازت کے بغیر کوئی فیصلہ نہیں ہوگا!');
check('dialogue: speakers', speakingCharacters(scenes).join(',') === 'شاہ,زال');
check('dialogue: narrator scene', scenes[2].isNarrator === true);

// 2. Prose prompt → narrator scenes, capped at 6.
const prose = parseDialogue('ایک جنگل میں شیر رہتا تھا۔ وہ سب کا بادشاہ تھا۔ ایک دن بھیڑیا آیا۔ اس نے للکارا۔ شیر نے جواب دیا۔ سب حیران ہوئے۔ پھر صلح ہو گئی۔ کہانی ختم۔ سب خوش ہوئے۔ جنگل میں امن آیا۔ پرندے گانے لگے۔ دریا بہنے لگا۔ سورج چمکا۔ رات پرسکون ہوئی۔');
check('prose: scenes capped at 6', prose.length === 6, `got ${prose.length}`);
check('prose: all narrator', prose.every((s) => s.isNarrator));

// 3. Empty input → no scenes (build must refuse, not fake a video).
check('empty: no scenes', parseDialogue('   \n  ').length === 0);

// 4. Envelope: speech frames > 0, silence frames = 0, mouth closes in pauses.
const sr = 8000, dur = 1;
const data = new Float32Array(sr * dur);
for (let i = 0; i < data.length; i++) data[i] = i < sr / 2 ? 0.5 * Math.sin(i * 0.1) : 0; // speech first half, silence second
const env = computeEnvelope(data, sr, 60, dur);
check('envelope: length 60', env.length === 60);
check('envelope: speech frames move', env.slice(0, 20).some((v) => v > 0.3));
check('envelope: silence frames zero', env.slice(45).every((v) => v === 0), JSON.stringify(env.slice(45)));
check('mouth: silence closed', mouthOpen(0) === 0 && mouthOpen(0.05) === 0);
check('mouth: loud clearly open', mouthOpen(0.8) > 0.7);

// 5. Locks: upsert never swaps voice/image by accident; auto locks deterministic.
const s = store();
upsertCharacterLock(s, { name: 'شاہ', voice: 'male', imageDataUrl: 'data:image/png;base64,AAA' });
upsertCharacterLock(s, { name: 'شاہ', voice: 'male', imageDataUrl: 'data:image/png;base64,AAA' });
check('locks: one entry per name', loadCharacterLocks(s).length === 1);
const auto = ensureCharacterLocks(s, parseDialogue('لالی: چالاک منصوبہ ہے!\nشاہ: ٹھیک ہے!'));
check('locks: auto female for Laali', auto.find((c) => c.name === 'لالی')?.voice === 'female');
check('locks: auto male for Shah', auto.find((c) => c.name === 'شاہ')?.voice === 'male');
check('locks: narrator lock added', auto.some((c) => c.name === 'راوی'));
check('auto: species', autoSpeciesFor('شاہ') === 'lion' && autoSpeciesFor('لالی') === 'fox' && autoSpeciesFor('زال') === 'wolf');
check('auto: hue deterministic', autoHueFor('شاہ') === autoHueFor('شاہ'));

// 6. Job state + status text: building/done/failed never promise a link they lack.
const s2 = store();
saveVideoMakerJob(s2, { id: '1', title: 'ٹیسٹ', status: 'building', sceneIndex: 1, sceneTotal: 2, stage: 'آڈیو بن رہی ہے', error: '', format: 'video/webm', updatedAt: '' });
const job = loadVideoMakerJob(s2);
check('job: round-trips', job?.status === 'building' && job.sceneIndex === 1);
check('job: building text has scene + no link claim', videoMakerStatusText(job).includes('سین 2 از 2') && !videoMakerStatusText(job).includes('ڈاؤن لوڈ'));
check('job: failed text plain', videoMakerStatusText({ ...job, status: 'failed', error: 'آواز نہیں بنی' }).includes('نہیں بن سکی'));
check('job: no job text plain', videoMakerStatusText(null).includes('کوئی کام شروع نہیں'));

// 7. Status query detection.
check('status query: urdu video', isVideoMakerStatusQuery('میری ویڈیو کہاں تک پہنچی؟'));
check('status query: generic work', isVideoMakerStatusQuery('میرا کام کہاں تک پہنچا؟'));
check('status query: ordinary chat ignored', !isVideoMakerStatusQuery('چائے بن گئی؟'));

// 8. Scene math.
check('scene seconds = 10', VIDEO_SCENE_SECONDS === 10);

// 9. LIVE-TEST FIX 2026-10-29 — collapsed newlines: two speaker lines
// joined by a space must still parse as two scenes, not one narrator scene.
const collapsed = parseDialogue('راوی: یہ ٹیسٹ ویڈیو ہے، پہلا سین شروع ہو رہا ہے۔ شاہ: میں شاہ ہوں، جنگل کا بادشاہ ہوں۔');
check('collapsed: 2 scenes', collapsed.length === 2, JSON.stringify(collapsed));
check('collapsed: speakers راوی+شاہ', collapsed[0].speaker === 'راوی' && collapsed[1].speaker === 'شاہ');
check('collapsed: Shah is speaking, not narrator', collapsed[1].isNarrator === false);
check('collapsed: exact dialogue kept', collapsed[1].text === 'میں شاہ ہوں، جنگل کا بادشاہ ہوں۔');
const newline2 = parseDialogue('راوی: پہلی لائن۔\nشاہ: دوسری لائن۔');
check('newline: 2 scenes', newline2.length === 2 && newline2[1].speaker === 'شاہ');
const narrPlus = parseDialogue('یہ کہانی ہے۔ شاہ: میں بول رہا ہوں۔');
check('narrator+speaker: 2 scenes', narrPlus.length === 2 && narrPlus[0].isNarrator === true && narrPlus[1].speaker === 'شاہ');

// 10. LIVE-TEST FIX 2026-10-29 — status interception for a DONE job.
const doneJob = { id: '1', title: 'ٹیسٹ', status: 'done', sceneIndex: 1, sceneTotal: 2, stage: 'تیار', error: '', format: 'video/webm', updatedAt: '' };
check('status: generic question + done job intercepts', shouldInterceptVideoMakerStatus('میرا کام کہاں تک پہنچا؟', doneJob) === true);
check('status: video question + done job intercepts', shouldInterceptVideoMakerStatus('میری ویڈیو بن گئی؟', doneJob) === true);
check('status: app question + done video job does NOT intercept', shouldInterceptVideoMakerStatus('میری ایپ کہاں تک پہنچی؟', doneJob) === false);
check('status: game question + done video job does NOT intercept', shouldInterceptVideoMakerStatus('میری گیم بن گئی؟', doneJob) === false);
check('status: no job never intercepts', shouldInterceptVideoMakerStatus('میرا کام کہاں تک پہنچا؟', null) === false);
check('status: ordinary chat never intercepts', shouldInterceptVideoMakerStatus('چائے بن گئی؟', doneJob) === false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
