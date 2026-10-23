/**
 * cdp-verify-office.mjs — visual verification of the OFFICE ON THE
 * MAIN SCREEN (user decision + refinement, 2026-10-23), driven in
 * headless Chromium over CDP against the REAL built app + server.
 *
 * Proves:
 *  A) On load at desktop width the office panel is already visible
 *     beside the chat (no click, no scroll) with all 7 cabins +
 *     Uniqa's corner + آج کا بورڈ legible, each cabin led by its
 *     agent avatar disc — and NO file chip exists while idle
 *     (no fake motion).
 *  B) A two-agent request (weather + currency) held at the network
 *     seam keeps حسن's and عمر's cabins LIT «کام کر رہا ہے» in the
 *     panel, and a 📄 chip REALLY flies: hub → حسن (dispatch) then
 *     حسن → عمر (handoff) — sampled positions prove the motion, a
 *     screenshot catches it mid-flight.
 *  C) Releasing the held request with real-shaped actions finalizes
 *     the work: both completions are pinned on the panel's board and
 *     📄 chips fly cabin → board (deliver).
 *  D) The panel's ⤢ still opens the big office overlay (close-up).
 *  E) At phone width the app stays usable (composer + chat intact)
 *     and the office is a visible section one scroll down.
 *
 * TRANSPORT NOTE (environment, 2026-10-23): this sandbox's Chromium
 * 152 blocks ALL loopback page loads with
 * ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS (feature flags, managed
 * policy allowlists and browser-initiated targets all still block).
 * So every request the page makes is relayed through the CDP Fetch
 * domain: node fetches it from the REAL running server (or the real
 * CDN) and fulfills it in-page. The app code, the server and every
 * response byte are the production ones — only Chrome's own network
 * transport is bypassed. The ONE substituted response is the chat
 * completion itself (held, then answered with exact ChatAction
 * shapes from lib/api.ts) — the same model seam cdp-verify.mjs has
 * always stubbed, since no Gemini key exists in the sandbox.
 *
 * Screenshots land in the goal's verify folder.
 * Prereqs: client built (server/dist), chrome at /opt/meta-chromium/chrome.
 * Run: node server/cdp-verify-office.mjs   (from repo root)
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP_PORT = 5219;
const CDP_PORT = 9339;
const APP = `http://127.0.0.1:${APP_PORT}`;
const OUT = '/home/hatch/workspace/goals/unique-ai-project-completion/hidden_files/office-main-screen-verify';
mkdirSync(OUT, { recursive: true });

let failed = 0;
function check(label, condition, detail = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failed++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const serverProc = spawn('node', ['server/index.js'], {
  cwd: repoRoot,
  env: { ...process.env, PORT: String(APP_PORT) },
  stdio: 'pipe',
});
let serverLog = '';
serverProc.stdout.on('data', (d) => { serverLog += d; });
serverProc.stderr.on('data', (d) => { serverLog += d; });

rmSync('/tmp/cdp-office-profile', { recursive: true, force: true });
const chromeProc = spawn('/opt/meta-chromium/chrome', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
  `--remote-debugging-port=${CDP_PORT}`, '--user-data-dir=/tmp/cdp-office-profile',
  '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required',
  'about:blank',
], { stdio: 'pipe' });

async function waitFor(url, timeoutMs = 25000) {
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
  .then((r) => {
    if (r.exceptionDetails) throw new Error(`evaluate failed: ${JSON.stringify(r.exceptionDetails).slice(0, 300)}`);
    return r.result?.value;
  });
async function shot(name) {
  const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, name), Buffer.from(data, 'base64'));
  console.log(`  📸 ${name}`);
}

// ---- Fetch relay (see transport note above) ----
let heldChatRequestId = null;
let relayedCount = 0;
const relayFailures = [];
async function relayRequest(params) {
  const { requestId, request } = params;
  try {
    const headers = {};
    for (const [k, v] of Object.entries(request.headers || {})) {
      const lk = k.toLowerCase();
      if (lk === 'host' || lk === 'content-length' || lk === 'connection') continue;
      headers[k] = v;
    }
    const init = { method: request.method, headers, signal: AbortSignal.timeout(25000) };
    if (!['GET', 'HEAD'].includes(request.method) && request.postData) init.body = request.postData;
    const res = await fetch(request.url, init);
    const buf = Buffer.from(await res.arrayBuffer());
    const responseHeaders = [];
    res.headers.forEach((value, name) => {
      const ln = name.toLowerCase();
      if (['content-length', 'content-encoding', 'transfer-encoding', 'connection'].includes(ln)) return;
      responseHeaders.push({ name, value });
    });
    relayedCount++;
    await page.send('Fetch.fulfillRequest', {
      requestId,
      responseCode: res.status,
      responseHeaders,
      body: buf.toString('base64'),
    });
  } catch (err) {
    relayFailures.push(`${request.url.slice(0, 90)} :: ${err.message}`);
    await page.send('Fetch.failRequest', { requestId, errorReason: 'Failed' }).catch(() => {});
  }
}

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

  // Desktop viewport: a typical laptop.
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  page.on('Fetch.requestPaused', (params) => {
    if (params.request.url.includes('/api/openai/chat')) {
      heldChatRequestId = params.requestId; // held — fulfilled later, on purpose
    } else if (/^https?:\/\//.test(params.request.url)) {
      void relayRequest(params);
    } else {
      void page.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {});
    }
  });
  await page.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });

  await page.send('Page.navigate', { url: `${APP}/` });
  let loaded = false;
  for (let i = 0; i < 30 && !loaded; i++) {
    await sleep(700);
    loaded = await ev(`!!document.querySelector('[data-testid="input-message"]')`).catch(() => false);
  }
  check('app loads in headless chrome (via Fetch relay)', loaded === true, `relayed=${relayedCount}${relayFailures.length ? ` relayFailures=${relayFailures.slice(0, 3).join(' ; ')}` : ''}`);
  await sleep(2500);

  // ================= A) office on the main screen, on load =================
  const panelInfo = await ev(`(() => {
    const p = document.querySelector('[data-testid="panel-office-main"]');
    if (!p) return null;
    const r = p.getBoundingClientRect();
    return { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom };
  })()`);
  check('office panel exists WITHOUT opening anything', !!panelInfo);
  check('panel is in the upper/main area on load (top within first 200px, tall column)',
    !!panelInfo && panelInfo.top < 200 && panelInfo.height > 500, JSON.stringify(panelInfo));
  check('panel + chat flank the hero (same band; cabins one side, chat the other — the RTL grid reads DOM-last as far side)',
    await ev(`(() => {
      const cx = (r) => r.left + r.width / 2;
      const p = document.querySelector('[data-testid="panel-office-main"]').getBoundingClientRect();
      const c = document.querySelector('.jarvis-chat').getBoundingClientRect();
      const h = document.querySelector('.jarvis-center').getBoundingClientRect();
      return Math.abs(p.top - c.top) < 40 && (cx(p) - cx(h)) * (cx(c) - cx(h)) < 0;
    })()`));
  check('ALL 8 desks (7 cabins + Uniqa) fully inside the panel viewport area — no internal scroll needed',
    await ev(`(() => {
      const body = document.querySelector('.office-panel-body');
      return !!body && body.scrollHeight <= body.clientHeight + 2;
    })()`));

  const cabinKeys = ['talash', 'khabar-mausam', 'hisab-kitab', 'likhai', 'media', 'quran-namaz', 'builder'];
  const cabinsInfo = await ev(`(() => {
    const out = {};
    for (const k of ${JSON.stringify(cabinKeys)}) {
      const el = document.querySelector('.office-panel-main [data-testid="office-cabin-' + k + '"]');
      if (!el) { out[k] = null; continue; }
      const r = el.getBoundingClientRect();
      const avatar = el.querySelector('.cabin-avatar');
      const plate = el.querySelector('.cabin-plate');
      out[k] = { w: r.width, h: r.height, avatar: !!avatar, plate: plate ? plate.textContent : null };
    }
    const u = document.querySelector('.office-panel-main [data-testid="office-uniqa-corner"]');
    const b = document.querySelector('.office-panel-main [data-testid="office-board"]');
    const hub = document.querySelector('.office-panel-main [data-handoff-anchor="hub"]');
    return { cabins: out, uniqa: !!u, board: !!b, hub: !!hub };
  })()`);
  check('all 7 cabins render in the panel, each with avatar disc + name plate',
    cabinKeys.every((k) => cabinsInfo.cabins[k] && cabinsInfo.cabins[k].w > 60 && cabinsInfo.cabins[k].avatar && cabinsInfo.cabins[k].plate),
    JSON.stringify(Object.fromEntries(Object.entries(cabinsInfo.cabins).map(([k, v]) => [k, v && v.plate]))));
  check('Uniqa corner + آج کا بورڈ + hub present in the panel',
    cabinsInfo.uniqa && cabinsInfo.board && cabinsInfo.hub);
  check('cabins are NOT lit while idle (honest rest state)',
    await ev(`![...document.querySelectorAll('.office-panel-main .office-cabin')].some((c) => c.className.includes('working'))`));

  // Idle must have NO file motion: sample for 1.5s.
  let idleChipSeen = false;
  for (let i = 0; i < 15 && !idleChipSeen; i++) {
    idleChipSeen = await ev(`!!document.querySelector('.office-panel-main [data-testid="office-fly-file"]')`);
    if (!idleChipSeen) await sleep(100);
  }
  check('NO file chip while idle (no fake motion)', !idleChipSeen);

  await shot('01-desktop-idle.png');

  // ================= B) two-agent work: cabins light + file flies =================
  await ev(`(() => {
    const ta = document.querySelector('[data-testid="input-message"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, 'کراچی کا موسم بتاؤ اور 100 ڈالر کتنے روپے کے ہیں؟');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await sleep(250);
  await ev(`document.querySelector('[data-testid="button-send-message"]').click()`);

  // Poll for the flying chip from the moment of sending; record its
  // identity + two position samples to prove real motion.
  const chipSightings = [];
  let chipFirstRect = null;
  let chipLaterRect = null;
  let workingSeen = false;
  const pollStart = Date.now();
  while (Date.now() - pollStart < 7000) {
    const probe = await ev(`(() => {
      const chip = document.querySelector('.office-panel-main [data-testid="office-fly-file"]');
      const hasan = document.querySelector('.office-panel-main [data-testid="office-cabin-khabar-mausam"]');
      const umar = document.querySelector('.office-panel-main [data-testid="office-cabin-hisab-kitab"]');
      const out = {
        working: !!(hasan && hasan.className.includes('office-cabin-working') && umar && umar.className.includes('office-cabin-working')),
        chip: null,
      };
      if (chip) {
        const r = chip.getBoundingClientRect();
        out.chip = { from: chip.dataset.from, to: chip.dataset.to, kind: chip.dataset.kind, x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
      return out;
    })()`);
    if (probe.working) workingSeen = true;
    if (probe.chip) {
      const key = `${probe.chip.from}->${probe.chip.to}:${probe.chip.kind}`;
      if (!chipSightings.includes(key)) {
        chipSightings.push(key);
        if (!chipFirstRect) {
          chipFirstRect = probe.chip;
          await shot('03-desktop-handoff-midflight.png');
          await sleep(260);
          const again = await ev(`(() => {
            const chip = document.querySelector('.office-panel-main [data-testid="office-fly-file"]');
            if (!chip) return null;
            const r = chip.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
          })()`);
          chipLaterRect = again;
        }
      }
    }
    if (heldChatRequestId && workingSeen && chipSightings.length >= 2) break;
    await sleep(60);
  }
  check('chat request reached the network seam and is held', !!heldChatRequestId);
  check('حسن + عمر cabins LIT «working» in the panel while the request runs', workingSeen);
  check('file chip flew hub → حسن (dispatch)', chipSightings.includes('hub->khabar-mausam:dispatch'), chipSightings.join(' | '));
  check('file chip then flew حسن → عمر (handoff)', chipSightings.includes('khabar-mausam->hisab-kitab:handoff'), chipSightings.join(' | '));
  check('chip REALLY moved between samples (>25px)',
    !!chipFirstRect && !!chipLaterRect && Math.hypot(chipLaterRect.x - chipFirstRect.x, chipLaterRect.y - chipFirstRect.y) > 25,
    chipFirstRect && chipLaterRect ? `(${chipFirstRect.x.toFixed(0)},${chipFirstRect.y.toFixed(0)}) → (${chipLaterRect.x.toFixed(0)},${chipLaterRect.y.toFixed(0)})` : 'missing samples');
  await shot('02-desktop-working.png');

  // ================= C) release: finalize + deliver flights + board pins =================
  const canned = {
    text: 'کراچی میں اس وقت دھوپ ہے، درجہ حرارت 32 ڈگری ہے۔ اور 100 ڈالر کے 28,050 روپے بنتے ہیں۔',
    actions: [
      { type: 'weather', city: 'کراچی', tempC: '32', feelsLikeC: '35', conditionUr: 'دھوپ', conditionEn: 'Sunny', humidity: '60%', windKmph: '14' },
      { type: 'currency_result', amount: 100, from: 'USD', to: 'PKR', result: 28050, rate: 280.5 },
    ],
  };
  await page.send('Fetch.fulfillRequest', {
    requestId: heldChatRequestId,
    responseCode: 200,
    responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
    body: Buffer.from(JSON.stringify(canned), 'utf8').toString('base64'),
  });

  const deliverSightings = [];
  let boardRows = 0;
  const settleStart = Date.now();
  while (Date.now() - settleStart < 8000) {
    const probe = await ev(`(() => {
      const chip = document.querySelector('.office-panel-main [data-testid="office-fly-file"]');
      const rows = document.querySelectorAll('.office-panel-main .office-board-row').length;
      return { rows, chip: chip ? { from: chip.dataset.from, to: chip.dataset.to, kind: chip.dataset.kind } : null };
    })()`);
    boardRows = probe.rows;
    if (probe.chip && probe.chip.to === 'board') {
      const key = `${probe.chip.from}->board:${probe.chip.kind}`;
      if (!deliverSightings.includes(key)) {
        deliverSightings.push(key);
        if (deliverSightings.length === 1) await shot('04b-desktop-deliver-midflight.png');
      }
    }
    if (boardRows >= 2 && deliverSightings.length >= 2) break;
    await sleep(60);
  }
  check('both completions pinned on the panel board', boardRows >= 2, `rows=${boardRows}`);
  check('file chips flew cabin → board on completion (deliver)',
    deliverSightings.includes('khabar-mausam->board:deliver') && deliverSightings.includes('hisab-kitab->board:deliver'),
    deliverSightings.join(' | ') || 'none seen');
  await sleep(1800); // let flights + cards settle
  // Close the stacked result cards so the settled office is unobstructed.
  await ev(`(() => { document.querySelectorAll('.tool-results .tool-results-close').forEach((b) => b.click()); return true; })()`).catch(() => {});
  await sleep(500);
  await shot('04-desktop-delivered.png');

  // ================= D) ⤢ still opens the big office overlay =================
  await ev(`document.querySelector('[data-testid="button-office-expand"]').click()`);
  await sleep(900);
  check('panel ⤢ opens the office overlay scene (close-up view intact)',
    await ev(`(() => {
      const s = document.querySelector('[data-testid="panel-agent-team-scene"]');
      return !!s && !!s.querySelector('[data-testid="office-cabin-builder"]') && !!s.querySelector('[data-testid="office-board"]');
    })()`));
  await shot('06-desktop-modal-closeup.png');
  await ev(`(() => { document.querySelector('[data-testid="panel-agent-team-scene"] .tool-results-close').click(); return true; })()`);
  await sleep(400);

  // ================= E) phone width =================
  await page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await page.send('Page.navigate', { url: `${APP}/` });
  let mobileLoaded = false;
  for (let i = 0; i < 30 && !mobileLoaded; i++) {
    await sleep(700);
    mobileLoaded = await ev(`!!document.querySelector('[data-testid="panel-office-main"]')`).catch(() => false);
  }
  const mobileInfo = await ev(`(() => {
    const panel = document.querySelector('[data-testid="panel-office-main"]');
    const chat = document.querySelector('.jarvis-chat');
    const composer = document.querySelector('[data-testid="input-message"]');
    if (!panel || !chat || !composer) return null;
    const pr = panel.getBoundingClientRect();
    const cr = chat.getBoundingClientRect();
    return {
      panelW: pr.width,
      panelBelowChat: pr.top >= cr.bottom - 4,
      chatH: cr.height,
      cabins: panel.querySelectorAll('.office-cabin').length,
    };
  })()`);
  check('phone: composer + chat usable, office present as a section below',
    !!mobileInfo && mobileInfo.chatH > 200 && mobileInfo.panelW > 300 && mobileInfo.cabins >= 8 && mobileInfo.panelBelowChat,
    JSON.stringify(mobileInfo));
  await ev(`document.querySelector('[data-testid="panel-office-main"]').scrollIntoView({ block: 'start' })`);
  await sleep(700);
  await shot('05-mobile-office.png');

  console.log(failed === 0 ? '\n✅ OFFICE VERIFY: ALL PASS' : `\n❌ OFFICE VERIFY: ${failed} FAILURES`);
} catch (err) {
  console.error('VERIFY ERROR:', err.message);
  console.error(serverLog.slice(-1500));
  failed++;
} finally {
  try { chromeProc.kill('SIGKILL'); } catch { /* already gone */ }
  try { serverProc.kill('SIGKILL'); } catch { /* already gone */ }
}
process.exit(failed ? 1 : 0);
