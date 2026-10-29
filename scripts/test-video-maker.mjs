// Headless tests for client/src/lib/video-maker.ts (pure logic only).
// Run: node --experimental-strip-types /tmp/test-video-maker.mjs
// Node 24 strips types; the lib has no enums/namespaces, so it imports cleanly.
import {
  parseDialogue, speakingCharacters, computeEnvelope, mouthOpen, wrapLines,
  upsertCharacterLock, loadCharacterLocks, ensureCharacterLocks,
  saveVideoMakerJob, loadVideoMakerJob, videoMakerStatusText,
  isVideoMakerStatusQuery, shouldInterceptVideoMakerStatus, sceneMotion,
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
check('status: no job + generic question answers plainly (truth rule)', shouldInterceptVideoMakerStatus('میرا کام کہاں تک پہنچا؟', null) === true);
check('status: no job + video question answers plainly', shouldInterceptVideoMakerStatus('میری ویڈیو بن گئی؟', null) === true);
check('status: no job + app question goes to server', shouldInterceptVideoMakerStatus('میری ایپ کہاں تک پہنچی؟', null) === false);
check('status: no-job text says no video job running', videoMakerStatusText(null).includes('کوئی ویڈیو جاب نہیں چل رہی'));
check('status: ordinary chat never intercepts', shouldInterceptVideoMakerStatus('چائے بن گئی؟', doneJob) === false);

// 11. Always-visible indicator (2026-10-29): it reads ONLY this store,
// so these round-trips are what it displays — building with scene
// numbers, then done/failed. No store entry = idle, never "working".
const s3 = store();
saveVideoMakerJob(s3, { id: '2', title: 'ٹیسٹ ویڈیو', status: 'building', sceneIndex: 1, sceneTotal: 2, stage: 'آڈیو بن رہی ہے', error: '', format: 'video/webm', updatedAt: '' });
const indJob = loadVideoMakerJob(s3);
check('indicator: building job has scene numbers', indJob?.status === 'building' && indJob.sceneIndex === 1 && indJob.sceneTotal === 2);
check('indicator: no job in store means idle', loadVideoMakerJob(store()) === null);

// 12. CapCut/Flow-STYLE motion (2026-10-29): zoom grows, pan alternates,
// intro ramps in — still pictures never sit static.
const m0 = sceneMotion(0, 0, 10);
const m0end = sceneMotion(0, 10, 10);
const m1end = sceneMotion(1, 10, 10);
check('motion: zoom grows over scene', m0end.zoom > m0.zoom);
check('motion: intro ramps 0→1', m0.intro < 1 && sceneMotion(0, 0.8, 10).intro === 1);
check('motion: pan alternates per scene', Math.sign(m0end.panX) === 1 && Math.sign(m1end.panX) === -1);
check('motion: pan is small, not a jump', Math.abs(m0end.panX) <= 0.05 && Math.abs(m0end.panY) <= 0.03);

// 13. DENIAL FIX (2026-10-29) + CHAT-ONLY FLOW: a video order in
// chat — any length, either persona (the matcher takes NO persona
// argument, so Uniqa and Unique route identically) — must reach
// the maker, never the chat model that invented "no video maker".
import { isVideoMakerOrder, extractVideoMakerPrompt } from '/home/hatch/workspace/unique-ai-clean/client/src/lib/video-maker.ts';
const SCREENSHOT = 'ابھی جو کچھ کہ میں نے بھیجا ہے نا ٹھیک ہے یہ ویڈیو بنا کے دو مجھے';
check('denial: screenshot order is 17 words (over the old 12-word gate)', SCREENSHOT.trim().split(/\s+/).length === 17);
check('denial: screenshot order routes to maker', isVideoMakerOrder(SCREENSHOT) === true);
check('denial: short order routes', isVideoMakerOrder('یہ ویڈیو بنا کے دو') === true);
check('denial: referential order routes', isVideoMakerOrder('جو بھیجا ہے اس کی ویڈیو بناؤ') === true);
check('denial: roman order routes', isVideoMakerOrder('video bana do') === true);
check('denial: story prompt pasted in chat routes (2 speaker lines)', isVideoMakerOrder('شاہ: یاد رکھو! اس جنگل میں میری اجازت کے بغیر کوئی فیصلہ نہیں ہوگا!\nزال: بادشاہ سلامت! آپ کی حکومت کا سورج اب ڈوبنے والا ہے!') === true);
check('denial: single quoted line stays chat', isVideoMakerOrder('شاہ: یاد رکھو!') === false);
check('denial: package order stays package', isVideoMakerOrder('ویڈیو کا پلان بتاؤ') === false);
check('denial: upload order stays upload', isVideoMakerOrder('ویڈیو اپلوڈ کرو') === false);
check('denial: how-to question stays chat', isVideoMakerOrder('ویڈیو کیسے بنتی ہے؟') === false);
check('denial: status question is NOT a new order', isVideoMakerOrder('میری ویڈیو بن رہی ہے؟') === false);
check('denial: app build is NOT a video order', isVideoMakerOrder('ویڈیو ایپ بناؤ') === false);
const DAY1 = 'راوی: اس جنگل میں شیر شاہ کی حکومت تھی!\nشاہ: یاد رکھو! اس جنگل میں میری اجازت کے بغیر کوئی فیصلہ نہیں ہوگا!';
check('denial: referential order reuses previous message as prompt', extractVideoMakerPrompt(SCREENSHOT, DAY1) === DAY1);
check('denial: bare order reuses contentful previous message', extractVideoMakerPrompt('ویڈیو بناؤ', DAY1) === DAY1);
check('denial: bare order with no previous content gives blank (honest, no fake job)', extractVideoMakerPrompt('یہ ویڈیو بنا کے دو مجھے', null) === '');
check('denial: dialogue inside the order itself is used', extractVideoMakerPrompt('ویڈیو بناؤ:\nشاہ: یاد رکھو!', null).startsWith('شاہ: یاد رکھو!'));

// 14. VOICE RESILIENCE (2026-10-29 live failure: banner "voice could
// not be prepared"). Legs tried in order, transient leg retried once,
// persistent leg NOT retried, every failure named in the error.
import { synthesizeSceneVoice, classifyVoiceError } from '/home/hatch/workspace/unique-ai-clean/client/src/lib/video-maker.ts';
const noWait = async () => {};
let calls = [];
const leg = (name, fn) => ({ name, synth: async (t) => { calls.push(name); return fn(t); } });
{
  calls = [];
  const r = await synthesizeSceneVoice('hello', [
    leg('Gemini', async () => { throw { data: { errorType: 'quota' } }; }),
    leg('سرور Edge', async () => { throw { data: { errorType: 'network' } }; }),
    leg('براؤزر Edge', async () => ({ audioBase64: 'AAA' })),
  ], { wait: noWait });
  check('voice: falls through to third leg', r.leg === 'براؤزر Edge' && r.audioBase64 === 'AAA', JSON.stringify(calls));
  check('voice: quota leg NOT retried, transient leg retried once', calls.filter((c) => c === 'Gemini').length === 1 && calls.filter((c) => c === 'سرور Edge').length === 2, JSON.stringify(calls));
}
{
  calls = [];
  let err = null;
  try {
    await synthesizeSceneVoice('hello', [
      leg('Gemini', async () => { throw { data: { errorType: 'quota' } }; }),
      leg('سرور Edge', async () => { throw { data: { errorType: 'network' } }; }),
    ], { wait: noWait });
  } catch (e) { err = e; }
  check('voice: all legs failed throws detailed error naming each leg', !!err && err.message.includes('Gemini') && err.message.includes('سرور Edge') && err.message.includes('quota') && !err.message.includes('tts-failed'), err?.message);
  check('voice: first leg success wins, later legs never called', await (async () => {
    calls = [];
    const r = await synthesizeSceneVoice('hi', [leg('Gemini', async () => ({ audioBase64: 'X' })), leg('سرور Edge', async () => ({ audioBase64: 'Y' }))], { wait: noWait });
    return r.leg === 'Gemini' && calls.length === 1;
  })());
  check('voice: empty audio counts as failure, not success', await (async () => {
    try { await synthesizeSceneVoice('hi', [leg('Gemini', async () => ({ audioBase64: '' }))], { wait: noWait }); return false; }
    catch (e) { return e.message.includes('خالی'); }
  })());
}
check('voice: classify quota not transient', classifyVoiceError({ data: { errorType: 'quota' } }).transient === false);
check('voice: classify network transient', classifyVoiceError({ data: { errorType: 'network' } }).transient === true);
check('voice: classify timeout transient', classifyVoiceError({ data: { errorType: 'timeout' } }).transient === true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
