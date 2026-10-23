/**
 * test-backup.mjs — Master Plan Phase 4 «دماغ کا بیک اپ»: proves the
 * brain backup format end to end with the REAL lib/backup code,
 * bundled the same way as the other client-lib suites:
 *  1. collect → serialize → parse round-trips losslessly;
 *  2. the Gemini API keys (and the key-rotation index + this device's
 *     pairing identity) are EXCLUDED — their values never appear in
 *     the file, by name or by content;
 *  3. apply restores the brain onto a different device WITHOUT
 *     touching that device's own keys, removes state the backup does
 *     not contain, and refuses to write keys even from a hostile file;
 *  4. malformed files (bad JSON, wrong marker, wrong version, broken
 *     entries) are all rejected — a bad file changes nothing;
 *  5. the voice commands are command-shaped only: genuine orders
 *     parse, backup-TALK in long messages never does.
 *
 * Run: node scripts/test-backup.mjs   (from the repo root)
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(join(tmpdir(), 'backup-'));
const entry = join(outDir, 'entry.ts');
writeFileSync(entry, `export * from ${JSON.stringify(join(repoRoot, 'client/src/lib/backup.ts'))};`);
const bundled = join(outDir, 'backup.mjs');
execSync(
  `${join(repoRoot, 'client/node_modules/.bin/esbuild')} ${entry} --bundle --format=esm --outfile=${bundled}`,
  { stdio: 'pipe' },
);
const {
  BACKUP_EXCLUDED_KEYS,
  collectBackup,
  serializeBackup,
  backupFileName,
  parseBackup,
  summarizeBackup,
  applyBackup,
  parseBackupCommand,
} = await import(pathToFileURL(bundled).href);

class MemoryStorage {
  constructor() { this.map = new Map(); }
  get length() { return this.map.size; }
  key(i) { return [...this.map.keys()][i] ?? null; }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

let passed = 0;
let failed = 0;
function check(label, condition, detail = '') {
  if (condition) passed++; else failed++;
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

// --- Seed a realistic «brain» ---------------------------------------------
const source = new MemoryStorage();
const CONVERSATIONS = JSON.stringify([
  { id: 'c1', title: 'پہلی گفتگو', updatedAt: '2026-10-23T00:00:00.000Z', messages: [{ id: 'm1', role: 'user', content: 'السلام علیکم', createdAt: '2026-10-23T00:00:00.000Z' }] },
  { id: 'c2', title: 'دوسری گفتگو', updatedAt: '2026-10-23T01:00:00.000Z', messages: [] },
]);
const NOTES = JSON.stringify([
  { id: 'n1', text: 'میرا نام اپنی ہے', createdAt: '2026-10-22T00:00:00.000Z' },
  { id: 'n2', text: 'چائے پسند ہے', createdAt: '2026-10-22T01:00:00.000Z' },
  { id: 'n3', text: 'جمعہ کو کراچی جانا ہے', createdAt: '2026-10-22T02:00:00.000Z' },
]);
source.setItem('maira-ai-conversations-v1', CONVERSATIONS);
source.setItem('unique-ai-notes', NOTES);
source.setItem('unique-ai-settings', JSON.stringify({ locationEnabled: true, voiceEnabled: true, continuousVoice: false, gesturesEnabled: true }));
source.setItem('unique-ai-persona', 'uniqa');
source.setItem('unique-ai-tone', 'romantic');
source.setItem('unique-ai-voice', 'Salman');
source.setItem('unique-ai-task-board', JSON.stringify({ day: '2026-10-23', entries: [] }));
source.setItem('unique-ai-gemini-key', 'SECRET-KEY-VALUE-123');
source.setItem('unique-ai-gemini-key-index', '1');
source.setItem('unique-ai-device-id', 'device-of-source');
source.setItem('unique-ai-device-name', 'میرا لیپ ٹاپ');

// --- 1+2: collect + exclusions ---------------------------------------------
const data = collectBackup(source, new Date('2026-10-23T05:00:00.000Z'));
check('collect: marker + kind + version', data.app === 'unique-ai' && data.kind === 'brain-backup' && data.version === 1);
check('collect: conversations carried', data.entries['maira-ai-conversations-v1'] === CONVERSATIONS);
check('collect: notes carried', data.entries['unique-ai-notes'] === NOTES);
check('collect: persona + tone carried', data.entries['unique-ai-persona'] === 'uniqa' && data.entries['unique-ai-tone'] === 'romantic');
check('collect: settings carried', typeof data.entries['unique-ai-settings'] === 'string');
check('collect: device NAME carried (it is brain, not identity)', data.entries['unique-ai-device-name'] === 'میرا لیپ ٹاپ');
for (const excluded of BACKUP_EXCLUDED_KEYS) {
  check(`collect: excluded key absent — ${excluded}`, !(excluded in data.entries));
}
const serialized = serializeBackup(data);
check('serialize: the secret key VALUE appears nowhere in the file', !serialized.includes('SECRET-KEY-VALUE-123'));
check('serialize: the source device id appears nowhere', !serialized.includes('device-of-source'));
check('file name carries the date', /^unique-ai-brain-backup-\d{4}-\d{2}-\d{2}\.json$/.test(backupFileName(new Date('2026-10-23T05:00:00.000Z'))), backupFileName(new Date('2026-10-23T05:00:00.000Z')));

// --- round-trip --------------------------------------------------------------
const parsed = parseBackup(serialized);
check('parse: own file accepted', parsed.ok === true);
check('round-trip: entries identical', parsed.ok && JSON.stringify(parsed.data.entries) === JSON.stringify(data.entries));
const summary = summarizeBackup(data);
check('summary: counts conversations', summary.conversations === 2, `got ${summary.conversations}`);
check('summary: counts notes', summary.notes === 3, `got ${summary.notes}`);
check('summary: counts total entries', summary.totalEntries === Object.keys(data.entries).length);

// --- 3: apply onto ANOTHER device -------------------------------------------
const target = new MemoryStorage();
target.setItem('unique-ai-gemini-key', 'OTHER-DEVICE-KEY');
target.setItem('unique-ai-gemini-key-index', '0');
target.setItem('unique-ai-device-id', 'device-of-target');
target.setItem('unique-ai-voice', 'Charon');
target.setItem('unique-ai-map-home', '{"lat":1}'); // target-only state, absent from the backup
const applied = applyBackup(target, parsed.data);
check('apply: brain conversations restored', target.getItem('maira-ai-conversations-v1') === CONVERSATIONS);
check('apply: persona restored', target.getItem('unique-ai-persona') === 'uniqa');
check('apply: stale value overwritten by the backup', target.getItem('unique-ai-voice') === 'Salman');
check('apply: state absent from the backup is removed (true restore)', target.getItem('unique-ai-map-home') === null);
check('apply: target device KEEPS its own API key', target.getItem('unique-ai-gemini-key') === 'OTHER-DEVICE-KEY');
check('apply: target key index untouched', target.getItem('unique-ai-gemini-key-index') === '0');
check('apply: target device identity untouched', target.getItem('unique-ai-device-id') === 'device-of-target');
check('apply: wrote a positive number of entries', applied.written > 0, `written=${applied.written}`);

// --- hostile file: keys smuggled inside entries -------------------------------
const hostile = JSON.stringify({
  app: 'unique-ai', kind: 'brain-backup', version: 1, createdAt: '2026-10-23T00:00:00.000Z',
  entries: { 'unique-ai-gemini-key': 'EVIL-KEY', 'unique-ai-persona': 'unique' },
});
const hostileParsed = parseBackup(hostile);
check('hostile: file parses but smuggled key is stripped at parse', hostileParsed.ok && !('unique-ai-gemini-key' in hostileParsed.data.entries));
if (hostileParsed.ok) applyBackup(target, hostileParsed.data);
check('hostile: apply never writes a smuggled key', target.getItem('unique-ai-gemini-key') === 'OTHER-DEVICE-KEY');

// --- 4: malformed files --------------------------------------------------------
const MALFORMED = {
  'empty text': '',
  'not JSON': 'yeh koi file nahi',
  'JSON array': '[]',
  'empty object': '{}',
  'wrong app marker': JSON.stringify({ app: 'kuch-aur', kind: 'brain-backup', version: 1, entries: {} }),
  'wrong kind': JSON.stringify({ app: 'unique-ai', kind: 'settings', version: 1, entries: {} }),
  'wrong version': JSON.stringify({ app: 'unique-ai', kind: 'brain-backup', version: 99, entries: {} }),
  'entries is an array': JSON.stringify({ app: 'unique-ai', kind: 'brain-backup', version: 1, entries: [] }),
  'entry value not a string': JSON.stringify({ app: 'unique-ai', kind: 'brain-backup', version: 1, entries: { 'unique-ai-persona': 42 } }),
  'entries missing': JSON.stringify({ app: 'unique-ai', kind: 'brain-backup', version: 1 }),
};
for (const [label, text] of Object.entries(MALFORMED)) {
  const result = parseBackup(text);
  check(`malformed rejected: ${label}`, result.ok === false && typeof result.error === 'string' && result.error.length > 0);
}
check('malformed: empty-entries backup is VALID (an empty brain is a real state)',
  parseBackup(JSON.stringify({ app: 'unique-ai', kind: 'brain-backup', version: 1, entries: {} })).ok === true);

// --- 5: voice commands ----------------------------------------------------------
const cmdIs = (text, want) => parseBackupCommand(text) === want;
check('cmd: «بیک اپ بنا دو» → create', cmdIs('بیک اپ بنا دو', 'create'));
check('cmd: «بیک اپ ڈاؤن لوڈ کرو» → create', cmdIs('بیک اپ ڈاؤن لوڈ کرو', 'create'));
check('cmd: «دماغ کا بیک اپ بنا دو» → create', cmdIs('دماغ کا بیک اپ بنا دو', 'create'));
check('cmd: «اپنی میموری USB میں سیو کر دو» → create', cmdIs('اپنی میموری USB میں سیو کر دو', 'create'));
check('cmd: «بیک اپ واپس لاؤ» → restore', cmdIs('بیک اپ واپس لاؤ', 'restore'));
check('cmd: «بیک اپ بحال کرو» → restore', cmdIs('بیک اپ بحال کرو', 'restore'));
check('cmd: «backup restore کرو» → restore', cmdIs('backup restore کرو', 'restore'));
check('cmd: «بیک اپ ڈیلیٹ کر دو» → null (not a backup action)', cmdIs('بیک اپ ڈیلیٹ کر دو', null));
check('cmd: bare «بیک اپ» → null (ambiguous)', cmdIs('بیک اپ', null));
check('cmd: «کھانا بنا دو» → null', cmdIs('کھانا بنا دو', null));
check('cmd: empty → null', cmdIs('', null));
const LONG_BACKUP_TALK = 'میں سوچ رہا تھا کہ اگر میرا لیپ ٹاپ خراب ہو جائے تو میری ساری باتیں اور یادیں ضائع ہو جائیں گی اس لیے تم مجھے کوئی ایسا طریقہ بتاؤ کہ میں ان کا بیک اپ بنا کر محفوظ رکھ سکوں اور جب چاہوں واپس بھی لا سکوں آسانی کے ساتھ';
check('cmd: long backup-TALK → null (reaches the brain)', cmdIs(LONG_BACKUP_TALK, null));

console.log(`\n${failed === 0 ? `ALL ${passed} BACKUP CHECKS PASS` : `${failed} FAILED / ${passed} passed`}`);
process.exit(failed === 0 ? 0 : 1);
