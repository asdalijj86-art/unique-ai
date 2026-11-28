/**
 * test-phase2.mjs — ALL 19 STONIC GAPS (user order 2026-11-28).
 *
 * Bundles the REAL Phase 2 libs with esbuild and proves:
 *  1. characters: 9 presets, custom create/validate, summon by name
 *     (pure / prefix / no-summon), directive grammar, active + notes.
 *  2. visual-memories: story required, add/delete round trip.
 *  3. face-lock: 6-digit passcode hash round trip, descriptor match
 *     threshold, ready-gate (passcode AND face).
 *  4. tour: first-run tour flag, what's-new since last seen.
 *  5. remote-tasks: sync payload validation (all 5 kinds + bad) and
 *     pure merge (add/toggle/delete/note/photo + dedupe).
 *  6. skills-toggle: everything ON by default, off sticks.
 *  7. agent-steps: search/general steps, advance, fail, narration.
 *  8. pwa: no prompt → unavailable, honestly.
 *  9. your-world: daily briefing builds from real inputs, caches.
 * 10. plans/changelog/help/guide: real content, usage line.
 * 11. RELAY: the pairing relay's NEW 'sync' kind — a valid sync
 *     payload crosses to the peer; an invalid one is rejected.
 * 12. WIRING (source checks): chat.tsx carries the character field,
 *     summon, remote-sync merge, tour/PWA/floating/panels, push-to-
 *     talk + extension bridge; App.tsx gates on Face Lock; the
 *     server parses `character` and carries the ADD-ONLY entry;
 *     pairing.js validates sync; the manifest + extension exist.
 *
 * Run: node scripts/test-phase2.mjs   (from the repo root)
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(join(tmpdir(), 'phase2-'));
const esbuild = join(repoRoot, 'client/node_modules/.bin/esbuild');

async function bundleLib(rel, platform = 'browser') {
  const entry = join(outDir, `entry-${rel.replaceAll('/', '_')}.ts`);
  writeFileSync(entry, `export * from ${JSON.stringify(join(repoRoot, rel))};\n`);
  const out = join(outDir, `${rel.replaceAll('/', '_')}.mjs`);
  execSync(`${esbuild} ${entry} --bundle --format=esm --platform=${platform} --outfile=${out}`, { stdio: 'pipe' });
  return import(pathToFileURL(out).href);
}

const CHAR = await bundleLib('client/src/lib/characters.ts');
const PERSONA = await bundleLib('client/src/lib/persona.ts');
const VMEM = await bundleLib('client/src/lib/visual-memories.ts');
const FLOCK = await bundleLib('client/src/lib/face-lock.ts');
const TOUR = await bundleLib('client/src/lib/tour.ts');
const REMOTE = await bundleLib('client/src/lib/remote-tasks.ts');
const SKILLS = await bundleLib('client/src/lib/skills-toggle.ts');
const STEPS = await bundleLib('client/src/lib/agent-steps.ts');
const PWA = await bundleLib('client/src/lib/pwa.ts');
const WORLD = await bundleLib('client/src/lib/your-world.ts');
const PLANS = await bundleLib('client/src/lib/plans.ts');
const CHANGELOG = await bundleLib('client/src/lib/changelog.ts');
const HELP = await bundleLib('client/src/lib/help.ts');
const GUIDE = await bundleLib('client/src/lib/build-guide.ts');

const chatSrc = readFileSync(join(repoRoot, 'client/src/pages/chat.tsx'), 'utf8');
const appSrc = readFileSync(join(repoRoot, 'client/src/App.tsx'), 'utf8');
const serverSrc = readFileSync(join(repoRoot, 'server/index.js'), 'utf8');
const pairingSrc = readFileSync(join(repoRoot, 'server/pairing.js'), 'utf8');
const frontSrc = readFileSync(join(repoRoot, 'client/src/components/StonicFront.tsx'), 'utf8');
const settingsSrc = readFileSync(join(repoRoot, 'client/src/components/SettingsPanel.tsx'), 'utf8');
const homeSrc = readFileSync(join(repoRoot, 'client/src/components/HomePanels.tsx'), 'utf8');
const worldSrc = readFileSync(join(repoRoot, 'client/src/components/WorldPanel.tsx'), 'utf8');
const htmlSrc = readFileSync(join(repoRoot, 'client/index.html'), 'utf8');

let passed = 0; let failed = 0;
function check(name, ok) {
  if (ok) { passed += 1; console.log(`  PASS ${name}`); }
  else { failed += 1; console.log(`  FAIL ${name}`); }
}
function eq(name, got, want) { check(`${name} (got ${JSON.stringify(got)})`, got === want); }
function mem() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  };
}

// ---------------------------------------------------------------------------
// 1. Custom characters.
// ---------------------------------------------------------------------------
console.log('1. characters');
eq('9 presets', CHAR.CHARACTER_PRESETS.length, 9);
eq('preset roles unique', new Set(CHAR.CHARACTER_PRESETS.map((p) => p.role)).size, 9);
const sara = CHAR.createCustomCharacter({ name: 'سارہ', role: 'girlfriend', gender: 'female', personality: 'پیار کرنے والی' });
check('custom create', !!sara && sara.name === 'سارہ' && sara.gender === 'female');
eq('empty name rejected', CHAR.createCustomCharacter({ name: '  ', role: 'bro', gender: 'male', personality: '' }), null);
eq('long name rejected', CHAR.createCustomCharacter({ name: 'x'.repeat(41), role: 'bro', gender: 'male', personality: '' }), null);
const preset = CHAR.createCharacterFromPreset('mentor', { name: 'استاد جی' });
eq('preset create', preset.role, 'mentor');
eq('builtin count', CHAR.builtinCharacters().length, 2);
const store1 = mem();
CHAR.saveCharacters(store1, [sara]);
eq('load round trip', CHAR.loadCharacters(store1).length, 1);
CHAR.saveActiveCharacterId(store1, sara.id);
eq('active character', CHAR.getActiveCharacter(store1)?.id, sara.id);
CHAR.saveActiveCharacterId(store1, 'builtin-uniqa');
eq('builtin active = null (default)', CHAR.getActiveCharacter(store1), null);
eq('summon pure name', CHAR.detectCharacterSummon('سارہ', sara), true);
eq('summon pure + verb', CHAR.detectCharacterSummon('سارہ کو بلاؤ', sara), true);
eq('summon prefix + request', CHAR.detectCharacterSummon('سارہ، موسم بتاؤ', sara), true);
eq('name inside sentence does NOT summon', CHAR.detectCharacterSummon('میں نے سارہ کو دیکھا تھا', sara), false);
eq('other name does NOT summon', CHAR.detectCharacterSummon('ماہی کو بلاؤ', sara), false);
check('female directive grammar', CHAR.buildCharacterDirective(sara).includes('FEMININE'));
const bro = CHAR.createCustomCharacter({ name: 'یار', role: 'bro', gender: 'male', personality: 'بھائی جیسا' });
check('male directive grammar', CHAR.buildCharacterDirective(bro).includes('MASCULINE'));
check('directive names the character', CHAR.buildCharacterDirective(sara).includes('سارہ'));
eq('female voice note', CHAR.characterVoiceNote(sara).includes('یونیکا والی'), true);
eq('male voice note', CHAR.characterVoiceNote(bro).includes('یونیک والی'), true);
eq('base persona female', CHAR.basePersonaFor(sara), 'uniqa');
eq('base persona male', CHAR.basePersonaFor(bro), 'unique');
const note = CHAR.makeCharNote('سارہ کو چائے پسند ہے');
check('char note made', !!note && note.text === 'سارہ کو چائے پسند ہے');
CHAR.saveCharNotes(store1, sara.id, [note]);
check('char notes recall', CHAR.charNotesRecallText(store1, sara.id).includes('چائے'));

// Same-persona summon mechanism (DEFECT 2026-11-28, render verify):
// detectPersonaSummon returns null when the summoned built-in IS the
// current persona — so chat.tsx re-checks with the OTHER persona as
// current, and that call must return the summon. Guard both sides.
eq('same-persona summon is null by design', PERSONA.detectPersonaSummon('یونیکا کو بلاؤ', 'uniqa'), null);
const samePersona = PERSONA.detectPersonaSummon('یونیکا کو بلاؤ', 'unique');
check('cross-current check returns the Uniqa summon', !!samePersona && samePersona.target === 'uniqa' && samePersona.pure === true);
const sameUnique = PERSONA.detectPersonaSummon('یونیک کو بلاؤ', 'uniqa');
check('cross-current check returns the Unique summon', !!sameUnique && sameUnique.target === 'unique' && sameUnique.pure === true);
check('plain message summons nothing', PERSONA.detectPersonaSummon('موسم کیسا ہے؟', 'uniqa') === null && PERSONA.detectPersonaSummon('موسم کیسا ہے؟', 'unique') === null);

// ---------------------------------------------------------------------------
// 2. Visual memories.
// ---------------------------------------------------------------------------
console.log('2. visual-memories');
const store2 = mem();
const photo = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
eq('story required', VMEM.makeVisualMemory(photo, '   ', 'uniqa'), null);
const vm = VMEM.makeVisualMemory(photo, 'پہلی تصویر کی کہانی', 'uniqa', 'پہلی');
check('visual memory made', !!vm && vm.story === 'پہلی تصویر کی کہانی' && vm.persona === 'uniqa');
const added = VMEM.addVisualMemory(store2, vm);
eq('add returns 1', added.length, 1);
eq('load returns 1', VMEM.loadVisualMemories(store2).length, 1);
eq('delete returns 0', VMEM.deleteVisualMemory(store2, vm.id).length, 0);
eq('long story capped', VMEM.makeVisualMemory(photo, 'x'.repeat(600), 'uniqa').story.length, 500);

// ---------------------------------------------------------------------------
// 3. Face Lock.
// ---------------------------------------------------------------------------
console.log('3. face-lock');
eq('passcode 6 digits ok', FLOCK.isValidPasscode('123456'), true);
eq('passcode 5 digits rejected', FLOCK.isValidPasscode('12345'), false);
eq('passcode letters rejected', FLOCK.isValidPasscode('abcdef'), false);
const hash = await FLOCK.hashPasscode('123456');
eq('hash is sha256 hex', /^[0-9a-f]{64}$/.test(hash), true);
eq('passcode matches', await FLOCK.passcodeMatches('123456', hash), true);
eq('wrong passcode fails', await FLOCK.passcodeMatches('654321', hash), false);
const descA = Array.from({ length: 128 }, (_, i) => i / 128);
const descB = [...descA];
const descFar = Array.from({ length: 128 }, () => 5);
eq('same face matches', FLOCK.isFaceMatch(descA, descB), true);
eq('far face does NOT match', FLOCK.isFaceMatch(descA, descFar), false);
eq('distance 0 for identical', FLOCK.descriptorDistance(descA, descB), 0);
const ready = { enabled: true, passcodeHash: hash, descriptor: descA, enrolledAt: Date.now() };
eq('ready needs passcode+face', FLOCK.faceLockReady(ready), true);
eq('not ready without face', FLOCK.faceLockReady({ ...ready, descriptor: null }), false);
eq('not ready without passcode', FLOCK.faceLockReady({ ...ready, passcodeHash: null }), false);
const store3 = mem();
FLOCK.saveFaceLock(store3, ready);
eq('face lock round trip', FLOCK.loadFaceLock(store3).enabled, true);
eq('bad stored state is empty', FLOCK.loadFaceLock(mem()).enabled, false);

// ---------------------------------------------------------------------------
// 4. Guided tour + what's-new.
// ---------------------------------------------------------------------------
console.log('4. tour');
const store4 = mem();
eq('tour unseen at first', TOUR.tourSeen(store4), false);
TOUR.markTourSeen(store4);
eq('tour seen after mark', TOUR.tourSeen(store4), true);
eq('tour has 6 steps', TOUR.TOUR_STEPS.length, 6);
const unseen = TOUR.whatsNewSince(store4);
check('whats-new returns entries when unseen', unseen.length > 0);
TOUR.markChangelogSeen(store4);
eq('whats-new empty after seen', TOUR.whatsNewSince(store4).length, 0);

// ---------------------------------------------------------------------------
// 5. Phone remote sync.
// ---------------------------------------------------------------------------
console.log('5. remote-tasks');
const todo = REMOTE.makeRemoteTodo('دودھ لانا', 'فون');
check('todo made', !!todo && todo.text === 'دودھ لانا' && todo.done === false);
eq('empty todo rejected', REMOTE.makeRemoteTodo('   ', 'فون'), null);
const noteR = REMOTE.makeRemoteNote('یاد رکھنا', 'فون');
check('note made', !!noteR);
const pTodo = { type: 'todo-add', todo };
const pToggle = { type: 'todo-toggle', id: todo.id, done: true };
const pDel = { type: 'todo-delete', id: todo.id };
const pNote = { type: 'note-add', note: noteR };
const pPhoto = { type: 'photo', dataUrl: photo, note: 'فون والی تصویر', from: 'فون' };
for (const [n, p] of [['todo-add', pTodo], ['todo-toggle', pToggle], ['todo-delete', pDel], ['note-add', pNote], ['photo', pPhoto]]) {
  eq(`valid ${n}`, REMOTE.isValidSyncPayload(p), true);
}
eq('bad type rejected', REMOTE.isValidSyncPayload({ type: 'hack' }), false);
eq('oversized photo rejected', REMOTE.isValidSyncPayload({ type: 'photo', dataUrl: `data:image/jpeg;base64,${'x'.repeat(200000)}`, note: '', from: 'فون' }), false);
eq('empty todo text rejected', REMOTE.isValidSyncPayload({ type: 'todo-add', todo: { id: 'x', text: '' } }), false);
let r = REMOTE.applySyncPayload([], [], pTodo);
eq('merge adds todo', r.todos.length, 1);
r = REMOTE.applySyncPayload(r.todos, r.notes, pTodo);
eq('merge dedupes todo', r.todos.length, 1);
r = REMOTE.applySyncPayload(r.todos, r.notes, pToggle);
eq('merge toggles done', r.todos[0].done, true);
r = REMOTE.applySyncPayload(r.todos, r.notes, pNote);
eq('merge adds note', r.notes.length, 1);
r = REMOTE.applySyncPayload(r.todos, r.notes, pPhoto);
check('merge returns photo', !!r.photo && r.photo.note === 'فون والی تصویر');
r = REMOTE.applySyncPayload(r.todos, r.notes, pDel);
eq('merge deletes todo', r.todos.length, 0);

// ---------------------------------------------------------------------------
// 6. Skills toggles.
// ---------------------------------------------------------------------------
console.log('6. skills-toggle');
eq('default ON (missing)', SKILLS.isSkillEnabled({}, 'library'), true);
eq('default ON (custom)', SKILLS.isSkillEnabled({}, 'custom'), true);
const off = SKILLS.setSkillEnabled({}, 'game', false);
eq('off sticks', SKILLS.isSkillEnabled(off, 'game'), false);
eq('other stays ON', SKILLS.isSkillEnabled(off, 'media'), true);
const on = SKILLS.setSkillEnabled(off, 'game', true);
eq('back ON', SKILLS.isSkillEnabled(on, 'game'), true);
const store6 = mem();
SKILLS.saveSkillsEnabled(store6, off);
eq('persisted off', SKILLS.loadSkillsEnabled(store6).game, false);
eq('labels cover all keys', Object.keys(SKILLS.SKILL_LABELS).length, SKILLS.ALL_SKILL_KEYS.length);

// ---------------------------------------------------------------------------
// 7. Agent steps.
// ---------------------------------------------------------------------------
console.log('7. agent-steps');
const sSteps = STEPS.buildSearchSteps('کراچی کا موسم');
eq('search steps count', sSteps.length, 4);
eq('first step active', sSteps[0].status, 'active');
eq('rest pending', sSteps.slice(1).every((s) => s.status === 'pending'), true);
const gSteps = STEPS.buildGeneralSteps('حساب کرو');
eq('general steps count', gSteps.length, 3);
const adv = STEPS.advanceSteps(sSteps, 2);
eq('advance marks 2 done', adv.filter((s) => s.status === 'done').length, 2);
eq('advance next active', adv[2].status, 'active');
const failedSteps = STEPS.failStep(sSteps, 'start');
eq('fail marks step', failedSteps[0].status, 'failed');
eq('all done false mid-way', STEPS.allStepsDone(sSteps), false);
eq('all done true when all', STEPS.allStepsDone(STEPS.advanceSteps(sSteps, 4)), true);
check('narration for search step', STEPS.narrateLineFor({ id: 'search', label: '', status: 'pending' }).length > 0);
eq('risky label detected', STEPS.isRiskyStepLabel('فائل ڈیلیٹ کر دو'), true);
eq('safe label not risky', STEPS.isRiskyStepLabel('تلاش کرو'), false);

// ---------------------------------------------------------------------------
// 8. PWA.
// ---------------------------------------------------------------------------
console.log('8. pwa');
eq('no prompt → unavailable', await PWA.promptInstall(), 'unavailable');
eq('cannot install now (no prompt)', PWA.canInstallNow(), false);

// ---------------------------------------------------------------------------
// 9. Your World briefing.
// ---------------------------------------------------------------------------
console.log('9. your-world');
const picks = WORLD.buildDailyBriefing({ latestLearning: 'L', latestNote: 'N', todayWork: { title: 'T', detail: 'D' }, topNews: null });
check('briefing builds', Array.isArray(picks));
eq('briefing has 3 picks max', picks.length <= 3, true);
eq('briefing picks memory+work', picks.length, 2);
const brief = { date: WORLD.briefingDateKey(), picks };
const store9 = mem();
WORLD.saveBriefing(store9, brief);
eq('briefing round trip', WORLD.loadBriefing(store9)?.picks.length, picks.length);
check('briefing summary text', WORLD.briefingSummary(brief).length > 0);
eq('today key format', /^\d{4}-\d{2}-\d{2}$/.test(WORLD.briefingDateKey()), true);

// ---------------------------------------------------------------------------
// 10. Plans / changelog / help / guide content.
// ---------------------------------------------------------------------------
console.log('10. plans/changelog/help/guide');
check('plan tiers exist', PLANS.PLAN_TIERS.length >= 2);
check('plans note says no payment', PLANS.PLANS_NOTE.length > 0);
const usage = PLANS.usageSummaryLine({ messagesToday: 5, alarmsActive: 2, memoriesCount: 12, charactersCount: 3 });
check('usage line carries numbers', usage.includes('5') && usage.includes('12'));
check('changelog non-empty', CHANGELOG.CHANGELOG.length > 0);
eq('current id = first entry', CHANGELOG.CURRENT_CHANGELOG_ID, CHANGELOG.CHANGELOG[0].id);
check('help FAQ non-empty', HELP.HELP_FAQ.length > 0);
check('build guide non-empty', GUIDE.BUILD_GUIDE_SECTIONS.length > 0);

// ---------------------------------------------------------------------------
// 11. Relay 'sync' kind (real server/pairing.js, bundled).
// ---------------------------------------------------------------------------
console.log('11. relay sync');
{
  // Imported directly (not bundled): qrcode uses dynamic require,
  // which esbuild cannot bundle into ESM.
  const relayMod = await import(pathToFileURL(join(repoRoot, 'server/pairing.js')).href);
  let now = 1000;
  const relay = relayMod.createPairingRelay(() => now);
  const a = relay.createCode({ deviceId: 'a', name: 'لیپ ٹاپ', type: 'laptop' });
  check('relay code created', !!a.code);
  const joined = relay.join(a.code, { deviceId: 'b', name: 'فون', type: 'phone' });
  check('relay join ok', joined.ok === true && !!joined.sessionId);
  const sid = joined.sessionId;
  const sent = relay.send(sid, 'b', 'sync', pTodo);
  check('relay accepts valid sync', sent.ok === true);
  const bad = relay.send(sid, 'b', 'sync', { type: 'hack' });
  check('relay rejects bad sync', bad.ok === false);
  const polled = relay.poll(sid, 'a');
  const got = (polled.messages || []).find((m) => m.kind === 'sync');
  check('peer receives sync payload', !!got && got.payload.todo.text === 'دودھ لانا');
  const badKind = relay.send(sid, 'b', 'bogus', {});
  check('relay rejects bad kind', badKind.ok === false);
}

// ---------------------------------------------------------------------------
// 12. Wiring — source checks.
// ---------------------------------------------------------------------------
console.log('12. wiring');
const has = (src, s, name) => check(name, src.includes(s));
has(chatSrc, "character: activeChar", 'chat sends character field');
has(chatSrc, 'summonCustomCharacter', 'chat summons custom characters');
has(chatSrc, 'effectiveSummon', 'chat re-checks same-persona summon (clears custom character)');
has(chatSrc, 'onRemoteSync={handleRemoteSync}', 'chat wires remote sync');
has(chatSrc, 'handleRemoteSync', 'chat has remote sync handler');
has(chatSrc, 'makeVisualMemory', 'chat saves synced photos as visual memories');
has(chatSrc, 'TourOverlay', 'chat renders guided tour');
has(chatSrc, 'WhatsNewDialog', 'chat renders whats-new');
has(chatSrc, 'CharactersPanel', 'chat renders characters panel');
has(chatSrc, 'FaceLockPanel', 'chat renders face lock panel');
has(chatSrc, 'PhoneRemotePanel', 'chat renders phone remote panel');
has(chatSrc, 'PlansPanel', 'chat renders plans panel');
has(chatSrc, 'HelpPanel', 'chat renders help panel');
has(chatSrc, 'ChangelogPanel', 'chat renders changelog panel');
has(chatSrc, 'BuildGuidePanel', 'chat renders build guide panel');
has(chatSrc, 'FloatingCharacter', 'chat renders floating character');
has(chatSrc, "e.code === 'Space' && (e.ctrlKey || e.metaKey)", 'chat has Ctrl+Space push-to-talk');
has(chatSrc, "unique-ai:ptt-toggle", 'chat bridges extension hotkey');
has(chatSrc, 'syncControlRef', 'chat holds sync control');
has(chatSrc, 'attachInstallPromptListener', 'chat captures PWA install prompt');
has(chatSrc, 'onToggleSkill', 'chat wires skills toggles');
has(chatSrc, 'characterName={activeCharacter?.name}', 'front shows active character name');
has(chatSrc, 'steps={workSteps}', 'chat passes steps to work view');
has(chatSrc, 'onStop={workView.status', 'chat passes Stop to work view');
has(chatSrc, 'faceLockArmed', 'chat tracks face lock armed state');
has(appSrc, 'FaceLockScreen', 'App renders face lock screen');
has(appSrc, '"facelock"', 'App has facelock gate');
has(appSrc, 'faceLockReady', 'App checks face lock readiness');
has(serverSrc, 'character', 'server parses character field');
has(serverSrc, 'characterDirective', 'server builds character directive');
has(serverSrc, 'CUSTOM CHARACTERS (ADD-ONLY 2026-11-28', 'server has ADD-ONLY characters entry');
has(pairingSrc, "kind !== \"conversation\" && kind !== \"command\" && kind !== \"call\" && kind !== \"sync\"", 'relay allows sync kind');
has(pairingSrc, 'isValidSyncPayload', 'relay validates sync payloads');
has(pairingSrc, 'SYNC_TYPES', 'relay has sync type whitelist');
has(frontSrc, 'narrateLineFor', 'work view narrates steps');
has(frontSrc, 'button-stop-agent-work', 'work view has Stop button');
has(frontSrc, "e.key !== 'Escape'", 'work view handles Esc');
has(frontSrc, 'characterName', 'front takes character name');
has(settingsSrc, 'setting-row-face-lock', 'settings has face lock row');
has(settingsSrc, 'setting-row-phone-remote', 'settings has phone remote row');
has(settingsSrc, 'setting-row-tour', 'settings has tour row');
has(settingsSrc, 'setting-row-push-to-talk', 'settings has push-to-talk row');
has(settingsSrc, 'setting-row-floating', 'settings has floating row');
has(settingsSrc, 'setting-row-wallpaper', 'settings has wallpaper row');
has(settingsSrc, 'setting-row-install-pwa', 'settings has install row');
has(settingsSrc, 'setting-row-plans', 'settings has plans row');
has(settingsSrc, 'setting-row-help', 'settings has help row');
has(settingsSrc, 'setting-row-changelog', 'settings has changelog row');
has(settingsSrc, 'setting-row-build-guide', 'settings has build guide row');
has(homeSrc, 'VisualMemory', 'memory panel has visual memories');
has(homeSrc, 'uskills-toggle', 'skills panel has toggles');
has(homeSrc, 'button-visual-memory-save', 'visual memory save button');
has(worldSrc, 'YourWorldBriefing', 'world panel renders briefing');
has(htmlSrc, 'manifest.webmanifest', 'index.html links manifest');
check('manifest file exists', existsSync(join(repoRoot, 'client/public/manifest.webmanifest')));
{
  const extManifest = JSON.parse(readFileSync(join(repoRoot, 'extension/manifest.json'), 'utf8'));
  eq('extension is MV3', extManifest.manifest_version, 3);
  check('extension has global hotkey', !!extManifest.commands?.['push-to-talk']);
  check('extension has content script', Array.isArray(extManifest.content_scripts) && extManifest.content_scripts.length > 0);
  check('extension icon exists', existsSync(join(repoRoot, 'extension/icon.png')));
}
check('face-api models present', existsSync(join(repoRoot, 'client/public/models/face-api/tiny_face_detector_model-weights_manifest.json')));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
