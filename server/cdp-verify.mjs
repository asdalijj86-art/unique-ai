/**
 * cdp-verify.mjs — DOM-level verification of the REAL built app served
 * by the REAL server, driven in headless Chromium over CDP.
 *
 * Covers:
 *  A) Task 4 — an attached image is included in the outgoing
 *     /api/openai/chat request payload (request intercepted + aborted
 *     before any real model call).
 *  B) Task 3 — Resume Builder's «PDF ڈاؤن لوڈ کریں» produces a real
 *     %PDF file on disk (browser download captured).
 *  C) Task 6a — the tools grid has «نقشہ», and the map loads real OSM
 *     tiles (leaflet tile images complete with pixels).
 *  D) Task 7 — Permissions API states for mic/camera/geolocation are
 *     readable in-browser; the Settings warm-up row renders with
 *     per-item statuses.
 *  E) Task 6b — the pairing panel opens from the grid and a real
 *     6-digit code comes back from the running server.
 *
 * Prereqs: client built (server/dist), chrome at /opt/meta-chromium/chrome.
 * Run: node server/cdp-verify.mjs   (from repo root)
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP_PORT = 5199;
const CDP_PORT = 9333;
const APP = `http://127.0.0.1:${APP_PORT}`;
const DOWNLOADS = '/tmp/cdp-downloads';
const AVATAR = join(repoRoot, 'client/public/avatar.webp');

let failed = 0;
function check(label, condition, detail = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failed++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- boot the real server ----
const serverProc = spawn('node', ['server/index.js'], {
  cwd: repoRoot,
  env: { ...process.env, PORT: String(APP_PORT) },
  stdio: 'pipe',
});
let serverLog = '';
serverProc.stdout.on('data', (d) => { serverLog += d; });
serverProc.stderr.on('data', (d) => { serverLog += d; });

// ---- boot headless chrome ----
rmSync('/tmp/cdp-profile', { recursive: true, force: true });
mkdirSync(DOWNLOADS, { recursive: true });
for (const f of readdirSync(DOWNLOADS)) rmSync(join(DOWNLOADS, f));
const chromeProc = spawn('/opt/meta-chromium/chrome', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
  `--remote-debugging-port=${CDP_PORT}`, '--user-data-dir=/tmp/cdp-profile',
  '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required',
  'about:blank',
], { stdio: 'pipe' });

async function waitFor(url, timeoutMs = 20000) {
  const start = Date.now();
  for (;;) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
    } catch { /* not yet */ }
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for ${url}`);
    await sleep(300);
  }
}

// ---- minimal CDP client ----
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Map();
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`));
        else resolve(msg.result);
      } else if (msg.method) {
        for (const fn of this.handlers.get(msg.method) || []) fn(msg.params);
      }
    });
  }
  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(fn);
  }
}

let page;
const ev = (expression) => page.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  .then((r) => r.result?.value);

try {
  await waitFor(`${APP}/`);
  await waitFor(`http://127.0.0.1:${CDP_PORT}/json/version`);
  const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
  const pageTarget = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.on('open', resolve); ws.on('error', reject); });
  page = new Cdp(ws);
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  await page.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOADS }).catch(() => {});

  const clickByText = (selector, text) => ev(`(() => {
    const els = [...document.querySelectorAll(${JSON.stringify(selector)})];
    const el = els.find((e) => e.textContent && e.textContent.includes(${JSON.stringify(text)}));
    if (!el) return false;
    el.scrollIntoView(); el.click(); return true;
  })()`);

  // ================= A) image in outgoing chat payload =================
  let chatRequestBody = null;
  page.on('Fetch.requestPaused', async (params) => {
    if (params.request.url.includes('/api/openai/chat')) {
      chatRequestBody = params.request.postData || '';
      await page.send('Fetch.failRequest', { requestId: params.requestId, errorReason: 'Aborted' }).catch(() => {});
    } else {
      await page.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {});
    }
  });
  await page.send('Fetch.enable', { patterns: [{ urlPattern: '*api/openai/chat*', requestStage: 'Request' }] });
  await page.send('Page.navigate', { url: `${APP}/` });
  await sleep(5000);
  check('app loads in headless chrome', await ev(`!!document.querySelector('[data-testid="input-message"]')`));

  const doc = await page.send('DOM.getDocument');
  const inputNode = await page.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '[data-testid="input-message"]' });
  check('composer textarea present', !!inputNode.nodeId);
  const fileNode = await page.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '[data-testid="input-image-attach"]' });
  await page.send('DOM.setFileInputFiles', { nodeId: fileNode.nodeId, files: [AVATAR] });
  await sleep(800);
  const sendEnabled = await ev(`(() => { const b = document.querySelector('[data-testid="button-send-message"]'); return b && !b.disabled; })()`);
  check('attaching an image enables send with empty draft (attach state set)', sendEnabled === true);
  await ev(`(() => {
    const ta = document.querySelector('[data-testid="input-message"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, 'اس تصویر میں کیا ہے؟');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await sleep(300);
  await ev(`document.querySelector('[data-testid="button-send-message"]').click()`);
  await sleep(2500);
  check('outgoing /api/openai/chat request was made', typeof chatRequestBody === 'string' && chatRequestBody.length > 0);
  const parsed = (() => { try { return JSON.parse(chatRequestBody); } catch { return null; } })();
  const flat = JSON.stringify(parsed || {});
  check('payload contains the attached image as data URL', flat.includes('data:image'), `payload bytes=${(chatRequestBody || '').length}`);
  check('payload still carries the typed text', flat.includes('اس تصویر میں کیا ہے') || (chatRequestBody || '').includes('تصویر'));
  await page.send('Fetch.disable').catch(() => {});

  // ================= B) PDF download via Resume Builder =================
  await page.send('Page.navigate', { url: `${APP}/` });
  await sleep(4500);
  await ev(`document.querySelector('[data-testid="button-open-tools"]').click()`);
  await sleep(1200);
  const openedResume = await clickByText('[data-testid="panel-tools"] button', 'ریزیومے');
  check('tools grid opens the CV tool', openedResume === true);
  await sleep(1500);
  // Give the form a name (first text input) so the CV has content.
  await ev(`(() => {
    const input = document.querySelector('.media-tools input[type="text"], .tool-results input[type="text"], input[type="text"]');
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'ٹیسٹ نام');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await sleep(600);
  const clickedPdf = await clickByText('button', 'PDF ڈاؤن لوڈ کریں');
  check('«PDF ڈاؤن لوڈ کریں» button exists in the CV tool and was clicked', clickedPdf === true);
  let pdfFile = null;
  for (let i = 0; i < 30 && !pdfFile; i++) {
    await sleep(700);
    const files = readdirSync(DOWNLOADS).filter((f) => f.endsWith('.pdf'));
    if (files.length) pdfFile = join(DOWNLOADS, files[0]);
  }
  check('a PDF file was downloaded', !!pdfFile, pdfFile || 'none');
  if (pdfFile) {
    const bytes = readFileSync(pdfFile);
    check('download is a real PDF (%PDF header, non-trivial size)', bytes.subarray(0, 4).toString() === '%PDF' && bytes.length > 3000, `${bytes.length} bytes`);
  }

  // ================= C) map grid entry + tiles =================
  await page.send('Page.navigate', { url: `${APP}/` });
  await sleep(4500);
  await ev(`document.querySelector('[data-testid="button-open-tools"]').click()`);
  await sleep(1200);
  const mapEntry = await clickByText('[data-testid="panel-tools"] button', 'نقشہ');
  check('tools grid has the «نقشہ» entry', mapEntry === true);
  await sleep(5000);
  const tileStats = await ev(`(() => {
    const tiles = [...document.querySelectorAll('img.leaflet-tile')];
    const loaded = tiles.filter((t) => t.complete && t.naturalWidth > 0);
    return { total: tiles.length, loaded: loaded.length };
  })()`);
  check('map renders real OSM tiles', tileStats && tileStats.loaded >= 4, JSON.stringify(tileStats));

  // ================= D) permissions read + settings warm-up =================
  const permStates = await ev(`(async () => {
    const out = {};
    for (const name of ['microphone', 'camera', 'geolocation']) {
      try { out[name] = (await navigator.permissions.query({ name })).state; }
      catch (e) { out[name] = 'error:' + e.message; }
    }
    return out;
  })()`);
  check('Permissions API states readable in-browser', !!permStates && Object.values(permStates).every((v) => ['granted', 'denied', 'prompt'].includes(v)), JSON.stringify(permStates));
  await ev(`(() => { const b = [...document.querySelectorAll('button')].find((e) => e.getAttribute('aria-label') === 'سیٹنگز کھولیں'); if (b) { b.click(); return true; } return false; })()`);
  await sleep(1500);
  const settingsText = await ev(`(() => { const d = document.querySelector('.settings-dropdown'); return d ? d.textContent : ''; })()`);
  check('Settings shows «ساری اجازتیں آن کریں» with per-item statuses',
    !!settingsText && settingsText.includes('ساری اجازتیں آن کریں') && settingsText.includes('مائیکروفون') && (settingsText.includes('آن ہے') || settingsText.includes('اجازت درکار')));

  // ================= E) pairing panel against the real server =================
  await page.send('Page.navigate', { url: `${APP}/` });
  await sleep(4500);
  await ev(`document.querySelector('[data-testid="button-open-tools"]').click()`);
  await sleep(1200);
  const pairEntry = await clickByText('[data-testid="panel-tools"] button', 'ڈیوائس جوڑیں');
  check('tools grid has the «ڈیوائس جوڑیں» entry', pairEntry === true);
  await sleep(1200);
  const codeClicked = await clickByText('[data-testid="panel-pairing"] button', 'کوڈ بنائیں');
  check('pairing panel opens and «کوڈ بنائیں» is clickable', codeClicked === true);
  await sleep(2500);
  const pairingText = await ev(`(() => { const d = document.querySelector('[data-testid="panel-pairing"]'); return d ? d.textContent : ''; })()`);
  check('server issued a real 6-digit pairing code in the built app', !!pairingText && /\d{6}/.test(pairingText));
} catch (error) {
  console.log('FAIL  harness error:', error.message);
  failed++;
} finally {
  try { chromeProc.kill('SIGKILL'); } catch { /* ignore */ }
  try { serverProc.kill('SIGKILL'); } catch { /* ignore */ }
  if (failed) console.log('\n--- server log tail ---\n', serverLog.slice(-800));
  console.log(failed === 0 ? '\nALL CDP CHECKS PASS' : `\n${failed} CDP CHECK(S) FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}
