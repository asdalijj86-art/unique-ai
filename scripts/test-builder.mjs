/**
 * test-builder.mjs — Phase 3 «بلڈر صلاحیت» (the brain's builder).
 *
 * What this proves:
 *  A. ROUTING (real server/brain.js): build orders («کار والی گیم بنا
 *     دو», «سافٹ ویئر بنا دو», «ایپ بنا دو», «ایک چھوٹا AI بنا دو»,
 *     «ویب سائٹ بنا دو», «ایک سادہ گھڑی بنا دو», VPN) classify as
 *     build_app with the right kind; status questions («میرا کام کہاں
 *     تک پہنچا؟») classify as build_status; «موبائل ایپ بناؤ» still
 *     goes to the untouched PWA builder (android_app); non-buildable
 *     «بنا دو» talk and ALL long conversational messages stay chat.
 *  B. VALIDATION (server/builder.js validateHtml): a complete file
 *     passes; truncated / unbalanced / JS-syntax-broken / tiny files
 *     all fail — a broken build can never be declared done.
 *  C. JOB LIFECYCLE with a stub generator injected at the same seam
 *     production uses: broken-first-attempt → repaired → done;
 *     always-broken → failed after exactly 2 attempts; a generator
 *     that throws → also retried once, then honestly failed.
 *  D. HTTP end-to-end over the REAL routes (registerBuilderRoutes on
 *     a real express app): the finished page is served at /apps/:id
 *     (200, closing </html>, inline JS compiles), the download is an
 *     attachment, the status endpoint reports truth without leaking
 *     the HTML, unknown ids 404, a still-building job serves the
 *     honest waiting page.
 *  E. REAL SERVER end-to-end (node server/index.js, no key): a
 *     status question with no jobs falls through to chat (no canned
 *     build answer); a build order without a key gets the honest
 *     key guidance and NO fake link; a build order with an invalid
 *     key starts a real job that fails honestly (Gemini rejects the
 *     key) and serves NO artifact; a later status question then
 *     reports that true failure.
 *
 * The one thing NOT proven here: a live Gemini generation (no API key
 * exists in this sandbox — the user's keys live in his app). The
 * generator's request/response shape is copied from the proven
 * /api/build-app endpoint, and everything around it is proven above.
 *
 * Run: node scripts/test-builder.mjs   (from the repo root)
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const { classifyIntent } = await import(pathToFileURL(join(repoRoot, 'server/brain.js')).href);
const builder = await import(pathToFileURL(join(repoRoot, 'server/builder.js')).href);
const { validateHtml, createBuilderService, registerBuilderRoutes } = builder;

let passed = 0;
let failed = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (ok) passed++; else failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} (got ${JSON.stringify(actual)}${ok ? '' : `, want ${JSON.stringify(expected)}`})`);
}
function checkTrue(label, value) { check(label, Boolean(value), true); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, timeoutMs = 15000, stepMs = 50) {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - start > timeoutMs) return null;
    await sleep(stepMs);
  }
}

// ===========================================================================
// A. ROUTING
// ===========================================================================
const BUILD_ORDERS = [
  ['کار والی گیم بنا دو', 'game'],
  ['گیم بنا دو', 'game'],
  ['بائیک والی گیم بنا دو', 'game'],
  ['جہاز والی گیم تیار کرو', 'game'],
  ['سافٹ ویئر بنا دو', 'app'],
  ['ایپ بنا دو', 'app'],
  ['ایک سادہ گھڑی بنا دو', 'app'],
  ['کیلکولیٹر بنا دو', 'app'],
  ['ایک چھوٹا AI بنا دو', 'ai'],
  ['اے آئی ساتھی بنا دو', 'ai'],
  ['ویب سائٹ بنا دو', 'website'],
  ['میرے لیے ویب سائٹ بناؤ', 'website'],
  ['VPN بنا دو', 'vpn_interface'],
  ['وی پی این بنا دو', 'vpn_interface'],
  ['build a car game', 'game'],
  ['make an app for me', 'app'],
];
for (const [msg, kind] of BUILD_ORDERS) {
  const c = classifyIntent(msg);
  check(`build order: ${msg}`, `${c.intent}:${c.build?.kind}`, `build_app:${kind}`);
}
check('build description cleaned: کار والی گیم بنا دو', classifyIntent('کار والی گیم بنا دو').build?.description, 'کار والی گیم');
check('build description cleaned: ایک سادہ گھڑی بنا دو', classifyIntent('ایک سادہ گھڑی بنا دو').build?.description, 'سادہ گھڑی');
check('build description cleaned: build a car game', classifyIntent('build a car game').build?.description, 'car game');

for (const msg of ['میرا کام کہاں تک پہنچا؟', 'میری گیم بن گئی؟', 'میرا سافٹ ویئر کہاں تک پہنچا؟', 'is my game ready']) {
  check(`status question: ${msg}`, classifyIntent(msg).intent, 'build_status');
}
// The standing PWA builder is untouched.
check('preserved: موبائل ایپ بناؤ → android_app', classifyIntent('موبائل ایپ بناؤ').intent, 'android_app');
check('preserved: android app banao → android_app', classifyIntent('android app banao').intent, 'android_app');
// Non-buildable objects and ordinary chat stay chat.
for (const msg of ['کھانا بنا دو', 'ایک کہانی بنا دو', 'چائے بن گئی؟', 'میرا ہوم ورک ہو گیا', 'مجھے ایک نظم لکھ دو', 'آج موسم کیسا ہے؟']) {
  check(`not a build: ${msg}`, classifyIntent(msg).intent === 'build_app' || classifyIntent(msg).intent === 'build_status' ? 'HIJACKED' : classifyIntent(msg).intent === 'weather' ? 'weather' : 'chat', msg === 'آج موسم کیسا ہے؟' ? 'weather' : 'chat');
}
// Long conversational messages that merely MENTION building stay chat.
const LONG_BUILD_TALK = [
  'میں چاہتا ہوں کہ تم میرے لیے ایک بہت اچھا سا سافٹ ویئر بنانے کا پورا پلان لکھ کر دو جس میں ساری تفصیل ہو کہ کون سی ٹیکنالوجی استعمال ہوگی، کتنا وقت لگے گا اور بچے اس گیم کو کھیل کر کیا سیکھیں گے',
  'میرے بھائی نے کل ایک کار والی گیم بنائی تھی، بہت مزے کی تھی، تم مجھے بتاؤ کہ ایسی گیمز بنانے کے لیے کون سی چیزیں سیکھنی پڑتی ہیں اور شروعات کہاں سے کرنی چاہیے',
];
LONG_BUILD_TALK.forEach((msg, i) => {
  check(`long build-talk #${i + 1} → chat`, classifyIntent(msg).intent, 'chat');
});

// ===========================================================================
// B. VALIDATION
// ===========================================================================
const GOOD_HTML = `<!DOCTYPE html>
<html lang="ur" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>گھڑی</title><style>body{font-family:sans-serif;text-align:center;background:#111;color:#fff} .big{font-size:64px}</style></head>
<body><h1>میری گھڑی</h1><div class="big" id="t">00:00:00</div><button id="b">روکیں</button>
<script>
const el = document.getElementById('t'); let run = true;
setInterval(() => { if (run) el.textContent = new Date().toLocaleTimeString(); }, 1000);
document.getElementById('b').addEventListener('click', () => { run = !run; });
const filler = 'یہ ایک مکمل چھوٹی ایپ ہے جو وقت دکھاتی ہے اور بٹن سے رکتی اور چلتی ہے — جانچ کے لیے کافی مواد۔'.repeat(3);
console.log(filler.length);
</script></body></html>`;
check('validation: complete file passes', validateHtml(GOOD_HTML).ok, true);
check('validation: truncated (no </html>) fails', validateHtml(GOOD_HTML.replace('</html>', '')).ok, false);
check('validation: unbalanced <script> fails', validateHtml(GOOD_HTML.replace('</script>', '')).ok, false);
check('validation: broken JS fails', validateHtml(GOOD_HTML.replace('let run = true;', 'let run = ;;;')).ok, false);
check('validation: tiny file fails', validateHtml('<!DOCTYPE html><html><head></head><body>hi</body></html>').ok, false);
check('validation: empty fails', validateHtml('').ok, false);
check('validation: markdown-fenced junk fails', validateHtml('```html\n<p>صرف ٹکڑا</p>').ok, false);

// ===========================================================================
// C. JOB LIFECYCLE (stub generator at the production seam)
// ===========================================================================
const TRUNCATED = GOOD_HTML.slice(0, GOOD_HTML.length - 40); // loses </html>

// C1: broken first attempt → one repair → done with the GOOD file.
{
  let calls = 0;
  const svc = createBuilderService({
    generate: async () => { calls += 1; return calls === 1 ? TRUNCATED : GOOD_HTML; },
  });
  const job = svc.startBuild({ description: 'سادہ گھڑی', title: 'سادہ گھڑی', kind: 'app', lang: 'ur', apiKey: 'stub' });
  const done = await waitFor(() => job.status === 'done' || job.status === 'failed');
  check('lifecycle: repaired build ends done', done && job.status, 'done');
  check('lifecycle: repair took exactly 2 attempts', calls, 2);
  check('lifecycle: stored html is the good file', job.html === GOOD_HTML, true);
  check('lifecycle: first errors were recorded', Array.isArray(job.firstErrors) && job.firstErrors.length > 0, true);
}

// C2: always broken → failed after exactly 2 attempts, no html stored.
{
  let calls = 0;
  const svc = createBuilderService({
    generate: async () => { calls += 1; return TRUNCATED; },
  });
  const job = svc.startBuild({ description: 'گیم', title: 'گیم', kind: 'game', lang: 'ur', apiKey: 'stub' });
  const done = await waitFor(() => job.status === 'failed' || job.status === 'done');
  check('lifecycle: always-broken build ends failed', done && job.status, 'failed');
  check('lifecycle: always-broken took exactly 2 attempts', calls, 2);
  check('lifecycle: failed job stores NO html (no broken link)', job.html, null);
  checkTrue('lifecycle: failed job carries an honest error', typeof job.error === 'string' && job.error.length > 0);
}

// C3: generator throws (network/quota) → one retry → honestly failed.
{
  let calls = 0;
  const svc = createBuilderService({
    generate: async () => { calls += 1; throw new Error('network down'); },
  });
  const job = svc.startBuild({ description: 'ایپ', title: 'ایپ', kind: 'app', lang: 'ur', apiKey: 'stub' });
  const done = await waitFor(() => job.status === 'failed' || job.status === 'done');
  check('lifecycle: throwing generator ends failed', done && job.status, 'failed');
  check('lifecycle: throwing generator retried once', calls, 2);
}

// C4: first-attempt success → exactly 1 attempt; latestJob is the newest.
{
  let calls = 0;
  const svc = createBuilderService({
    generate: async () => { calls += 1; return GOOD_HTML; },
  });
  const j1 = svc.startBuild({ description: 'پہلی', title: 'پہلی', kind: 'app', lang: 'ur', apiKey: 'stub' });
  await waitFor(() => j1.status === 'done');
  const j2 = svc.startBuild({ description: 'دوسری', title: 'دوسری', kind: 'app', lang: 'ur', apiKey: 'stub' });
  await waitFor(() => j2.status === 'done');
  check('lifecycle: clean builds take 1 attempt each (2 jobs = 2 calls)', calls, 2);
  check('lifecycle: latestJob is the newest job', svc.latestJob()?.id, j2.id);
  check('lifecycle: publicJob hides the html body', JSON.stringify(svc.publicJob(j2)).includes('میری گھڑی'), false);
  check('lifecycle: publicJob exposes the urls when done', svc.publicJob(j2).url, `/apps/${j2.id}`);
}

// ===========================================================================
// D. HTTP END-TO-END (real routes, stub-backed service)
// ===========================================================================
{
  const requireFromServer = createRequire(join(repoRoot, 'server/index.js'));
  const express = requireFromServer('express');
  let release;
  const gate = new Promise((r) => { release = r; });
  const svc = createBuilderService({
    generate: async () => { await gate; return GOOD_HTML; },
  });
  const app = express();
  app.use(express.json());
  registerBuilderRoutes(app, svc);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const job = svc.startBuild({ description: 'سادہ گھڑی', title: 'سادہ گھڑی', kind: 'app', lang: 'ur', apiKey: 'stub' });

    // While building: status endpoint tells the truth; /apps/:id waits.
    const st1 = await (await fetch(`${base}/api/build/status/${job.id}`)).json();
    check('http: status while building', st1.status, 'building');
    const waiting = await fetch(`${base}/apps/${job.id}`);
    const waitingBody = await waiting.text();
    check('http: /apps/:id while building → 200 waiting page', waiting.status, 200);
    checkTrue('http: waiting page says احمد بنا رہا ہے', waitingBody.includes('بنا رہا ہے'));

    release();
    await waitFor(() => job.status === 'done');

    const st2 = await (await fetch(`${base}/api/build/status/${job.id}`)).json();
    check('http: status after finish', st2.status, 'done');
    check('http: status carries open url', st2.url, `/apps/${job.id}`);
    check('http: status carries download url', st2.downloadUrl, `/apps/${job.id}/download`);

    const page = await fetch(`${base}/apps/${job.id}`);
    const pageBody = await page.text();
    check('http: built page → 200', page.status, 200);
    check('http: built page is the generated file', pageBody === GOOD_HTML, true);
    checkTrue('http: built page closes </html>', /<\/html>\s*$/.test(pageBody));
    // The served page's inline JS must compile — the artifact works.
    const scripts = [...pageBody.matchAll(/<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).filter((s) => s.trim());
    let compiles = scripts.length > 0;
    for (const code of scripts) { try { new vm.Script(code); } catch { compiles = false; } }
    check('http: served page inline JS compiles', compiles, true);
    checkTrue('http: page is a real artefact (size)', pageBody.length > 600);

    const dl = await fetch(`${base}/apps/${job.id}/download`);
    check('http: download → 200', dl.status, 200);
    checkTrue('http: download is an attachment', (dl.headers.get('content-disposition') || '').includes('attachment'));
    check('http: download body equals the file', (await dl.text()) === GOOD_HTML, true);

    check('http: unknown app id → 404', (await fetch(`${base}/apps/nope-nope`)).status, 404);
    check('http: unknown status id → 404', (await fetch(`${base}/api/build/status/nope-nope`)).status, 404);
  } finally {
    server.close();
  }
}

// ===========================================================================
// E. REAL SERVER END-TO-END (no API key in this sandbox)
// ===========================================================================
{
  const PORT = 5199;
  const base = `http://127.0.0.1:${PORT}`;
  const child = spawn('node', ['index.js'], {
    cwd: join(repoRoot, 'server'),
    // BUILDER_GEN_TIMEOUT_MS=8000 bounds each generation attempt: from
    // this sandbox, Node's fetch bypasses the egress proxy and stalls
    // (curl with the same invalid key gets Gemini's HTTP 400 in ~15s;
    // in production on Render the rejection is fast). The job must
    // still end honestly FAILED — just without waiting out two full
    // 150s upstream timeouts.
    env: { ...process.env, PORT: String(PORT), BUILDER_GEN_TIMEOUT_MS: '8000' },
    stdio: 'pipe',
  });
  const chat = async (content, extra = {}) => {
    const res = await fetch(`${base}/api/openai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content }], ...extra }),
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  };
  try {
    const up = await waitFor(async () => {
      try { const r = await fetch(`${base}/api/healthz`); return r.ok; } catch { return false; }
    }, 20000, 250);
    checkTrue('server: real server booted', Boolean(up));

    // E1: status question with NO jobs → falls through to normal chat
    // (which, keyless, answers its standard 503) — crucially it does
    // NOT invent a canned build status and carries NO build action.
    const e1 = await chat('میرا کام کہاں تک پہنچا؟');
    check('server: status w/o job → no build action', e1.json.action?.type ?? null, null);
    check('server: status w/o job → fell through to chat (503 no-key)', e1.status, 503);

    // E2: build order without any key → honest guidance, no fake link.
    const e2 = await chat('کار والی گیم بنا دو');
    check('server: build order w/o key → 200', e2.status, 200);
    check('server: build order w/o key → no action (no fake link)', e2.json.action ?? null, null);
    checkTrue('server: build order w/o key → honest key guidance', /API key/.test(e2.json.text || ''));

    // E3: build order with an INVALID key → a real job starts, Gemini
    // rejects the key, the job fails honestly and serves no artifact.
    const e3 = await chat('کار والی گیم بنا دو', { userApiKey: 'INVALID-TEST-KEY' });
    check('server: build order with key → build_app action', e3.json.action?.type ?? null, 'build_app');
    const jobId = e3.json.action?.jobId;
    checkTrue('server: build order returned a jobId', typeof jobId === 'string' && jobId.length > 0);
    if (jobId) {
      const finalStatus = await waitFor(async () => {
        try {
          const r = await fetch(`${base}/api/build/status/${jobId}`);
          if (!r.ok) return false;
          const j = await r.json();
          return (j.status === 'failed' || j.status === 'done') ? j : false;
        } catch { return false; }
      }, 90000, 1000);
      check('server: invalid-key job ends FAILED (honest, no fake success)', finalStatus && finalStatus.status, 'failed');
      const art = await fetch(`${base}/apps/${jobId}`);
      check('server: failed job serves NO artifact (404)', art.status, 404);

      // E4: the status question now reports that true failure.
      const e4 = await chat('میرا کام کہاں تک پہنچا؟');
      check('server: status after failed job → build_app action', e4.json.action?.type ?? null, 'build_app');
      checkTrue('server: status text honestly says نہیں بن سکی', /نہیں بن سکی/.test(e4.json.text || ''));
    }
  } finally {
    child.kill('SIGTERM');
  }
}

console.log(`\n${failed === 0 ? `ALL ${passed} BUILDER CHECKS PASS` : `${failed} FAILED / ${passed} passed`}`);
process.exit(failed === 0 ? 0 : 1);
