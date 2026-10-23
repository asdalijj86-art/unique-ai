/**
 * cdp-verify-robots.mjs — visual verification of the ROBOT-BOY
 * office (user specs, 2026-10-23: robots in the cabins 21:43, the
 * neon-glass design reference 21:53, the joint hosts' cabin 21:55,
 * the org hierarchy 21:56), driven in headless Chromium over CDP
 * against the REAL built app + server.
 *
 * Proves:
 *  A) On load at desktop width the office panel is visible beside
 *     the chat with: the «Unique AI» entrance sign, the org line
 *     (باس یونیک • مینیجر یونیکا • ٹیم 7 ایجنٹ), the joint hosts'
 *     cabin (Unique seated, his باس tag; Uniqa's مینیجر seat EMPTY
 *     while she is not summoned — presence honesty), all 7 agent
 *     cabins each with a robot-boy + a plaque showing NAME and
 *     DUTY, آج کا بورڈ — and NO traveler while idle.
 *  B) A two-agent request (weather + currency) held at the network
 *     seam lights حسن + عمر; their robots are REALLY in working
 *     motion (computed leg animation = robot-step); a robot
 *     traveler carrying the 📄 flies hub → حسن (dispatch from the
 *     hosts' cabin), then حسن → عمر (handoff).
 *  C) Releasing the request pins both completions on the board,
 *     traveler robots carry the files cabin → board (deliver), and
 *     cabins settle into their done state.
 *  D) The ⤢ overlay (close-up) shows the same robots + plaques +
 *     hosts' cabin; a clipped close-up captures the باس/مینیجر
 *     seat tags.
 *  E) With persona=uniqa stored, Uniqa is SEATED in the hosts'
 *     cabin and the cabin glows golden (duo screenshot); back to
 *     the default persona, her seat is empty again (solo shot).
 *  F) At phone width the app stays usable and the office section
 *     (robots included) is one scroll down.
 *
 * TRANSPORT NOTE (environment, 2026-10-23): this sandbox's Chromium
 * 152 blocks ALL loopback page loads with
 * ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS, so every request the
 * page makes is relayed through the CDP Fetch domain: node fetches
 * it from the REAL running server (or the real CDN) and fulfills it
 * in-page. The app code, the server and every response byte are
 * the production ones — only Chrome's own network transport is
 * bypassed. The ONE substituted response is the chat completion
 * itself (held, then answered with exact ChatAction shapes) — the
 * same model seam the other verifiers stub, since no Gemini key
 * exists in the sandbox.
 *
 * Screenshots land in the goal's office-robots-verify folder.
 * Prereqs: client built (server/dist), chrome at /opt/meta-chromium/chrome.
 * Run: node server/cdp-verify-robots.mjs   (from repo root)
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP_PORT = 5221;
const CDP_PORT = 9341;
const APP = `http://127.0.0.1:${APP_PORT}`;
const OUT = '/home/hatch/workspace/goals/unique-ai-project-completion/hidden_files/office-robots-verify';
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

rmSync('/tmp/cdp-robots-profile', { recursive: true, force: true });
const chromeProc = spawn('/opt/meta-chromium/chrome', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
  `--remote-debugging-port=${CDP_PORT}`, '--user-data-dir=/tmp/cdp-robots-profile',
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
async function shot(name, clip = null) {
  const params = { format: 'png' };
  if (clip) params.clip = { ...clip, scale: 2 };
  const { data } = await page.send('Page.captureScreenshot', params);
  writeFileSync(join(OUT, name), Buffer.from(data, 'base64'));
  console.log(`  📸 ${name}`);
}
/** Clip-screenshot the element matching `selector` (viewport coords). */
async function shotEl(name, selector) {
  const rect = await ev(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.max(0, r.left - 6), y: Math.max(0, r.top - 6), width: r.width + 12, height: r.height + 12 };
  })()`);
  if (rect) await shot(name, rect);
  return rect;
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

const CABINS = [
  ['talash', 'دانیال', 'تلاش ایجنٹ'],
  ['khabar-mausam', 'حسن', 'خبر و موسم ایجنٹ'],
  ['hisab-kitab', 'عمر', 'حساب کتاب ایجنٹ'],
  ['likhai', 'علی', 'لکھائی ایجنٹ'],
  ['media', 'حمزہ', 'میڈیا ایجنٹ'],
  ['quran-namaz', 'یوسف', 'قرآن و نماز ایجنٹ'],
  ['builder', 'احمد', 'بلڈر ایجنٹ'],
];

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
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  page.on('Fetch.requestPaused', (params) => {
    if (params.request.url.includes('/api/openai/chat')) {
      heldChatRequestId = params.requestId;
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

  // ================= A) the floor on load: sign, org, hosts, robots =================
  const panelInfo = await ev(`(() => {
    const p = document.querySelector('[data-testid="panel-office-main"]');
    if (!p) return null;
    const r = p.getBoundingClientRect();
    return { top: r.top, height: r.height };
  })()`);
  check('office panel exists WITHOUT opening anything, prominent on load',
    !!panelInfo && panelInfo.top < 200 && panelInfo.height > 500, JSON.stringify(panelInfo));
  check('ALL desks (hosts cabin + 7 cabins + board) fit the panel — no internal scroll at laptop height',
    await ev(`(() => {
      const body = document.querySelector('.office-panel-body');
      return !!body && body.scrollHeight <= body.clientHeight + 2;
    })()`));

  const floorInfo = await ev(`(() => {
    const scope = '.office-panel-main ';
    const sign = document.querySelector(scope + '.office-sign-brand');
    const org = document.querySelector(scope + '.office-orgline');
    const hosts = document.querySelector(scope + '[data-testid="office-hosts-cabin"]');
    const board = document.querySelector(scope + '[data-testid="office-board"]');
    const cabins = {};
    for (const [k] of ${JSON.stringify(CABINS)}) {
      const el = document.querySelector(scope + '[data-testid="office-cabin-' + k + '"]');
      if (!el) { cabins[k] = null; continue; }
      const plaque = el.querySelector('.cabin-plaque');
      cabins[k] = {
        robot: !!el.querySelector('.cabin-robot-svg'),
        plaque: plaque ? plaque.textContent.replace(/\\s+/g, ' ').trim() : null,
        lit: el.className.includes('office-cabin-working'),
      };
    }
    return {
      sign: sign ? sign.textContent.trim() : null,
      org: org ? org.textContent.replace(/\\s+/g, ' ').trim() : null,
      hosts: hosts ? {
        anchor: hosts.getAttribute('data-handoff-anchor'),
        plaque: hosts.querySelector('.cabin-plaque').textContent.replace(/\\s+/g, ' ').trim(),
        bossRobot: !!hosts.querySelector('.hosts-seat-unique .cabin-robot-svg'),
        bossTag: hosts.querySelector('.hosts-role-boss')?.textContent.trim() || null,
        uniqaRobot: !!hosts.querySelector('.hosts-seat-uniqa .cabin-robot-svg'),
        managerTag: hosts.querySelector('.hosts-role-manager')?.textContent.trim() || null,
        mic: !!hosts.querySelector('.hosts-mic'),
        monitor: !!hosts.querySelector('.hosts-monitor'),
        duo: hosts.className.includes('office-hosts-duo'),
      } : null,
      board: !!board,
      cabins,
    };
  })()`);
  check('«Unique AI» entrance sign on the floor head', floorInfo.sign === 'Unique AI', floorInfo.sign || 'missing');
  check('org line: باس یونیک • مینیجر یونیکا • ٹیم 7 ایجنٹ',
    !!floorInfo.org && floorInfo.org.includes('باس: یونیک') && floorInfo.org.includes('مینیجر: یونیکا') && floorInfo.org.includes('7 ایجنٹ'),
    floorInfo.org || 'missing');
  check('hosts cabin is the dispatch hub (data-handoff-anchor=hub), plaque «یونیک + یونیکا»',
    !!floorInfo.hosts && floorInfo.hosts.anchor === 'hub' && floorInfo.hosts.plaque.includes('یونیک + یونیکا'),
    JSON.stringify(floorInfo.hosts && floorInfo.hosts.plaque));
  check('hosts cabin: باس robot seated with tag «باس — یونیک», mic + monitor on the desk',
    !!floorInfo.hosts && floorInfo.hosts.bossRobot && floorInfo.hosts.bossTag === 'باس — یونیک' && floorInfo.hosts.mic && floorInfo.hosts.monitor);
  check('Uniqa NOT summoned: her مینیجر seat is EMPTY (tag stays, no robot, no golden glow) — presence honesty',
    !!floorInfo.hosts && !floorInfo.hosts.uniqaRobot && floorInfo.hosts.managerTag === 'مینیجر — یونیکا' && !floorInfo.hosts.duo);
  check('all 7 cabins: robot-boy inside + plaque with NAME and DUTY above',
    CABINS.every(([k, person, duty]) => {
      const c = floorInfo.cabins[k];
      return c && c.robot && c.plaque && c.plaque.includes(person) && c.plaque.includes(duty);
    }),
    JSON.stringify(Object.fromEntries(Object.entries(floorInfo.cabins).map(([k, v]) => [k, v && v.plaque]))));
  check('آج کا بورڈ present; no cabin lit while idle',
    floorInfo.board && CABINS.every(([k]) => floorInfo.cabins[k] && !floorInfo.cabins[k].lit));

  let idleTravelerSeen = false;
  for (let i = 0; i < 15 && !idleTravelerSeen; i++) {
    idleTravelerSeen = await ev(`!!document.querySelector('.office-panel-main [data-testid="office-fly-file"]')`);
    if (!idleTravelerSeen) await sleep(100);
  }
  check('NO robot traveler while idle (no fake motion)', !idleTravelerSeen);

  await shotEl('09-hosts-unique-alone.png', '.office-panel-main [data-testid="office-hosts-cabin"]');
  await shot('01-desktop-idle.png');

  // ================= B) work: robots in motion + traveler flights =================
  await ev(`(() => {
    const ta = document.querySelector('[data-testid="input-message"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, 'کراچی کا موسم بتاؤ اور 100 ڈالر کتنے روپے کے ہیں؟');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await sleep(250);
  await ev(`document.querySelector('[data-testid="button-send-message"]').click()`);

  const chipSightings = [];
  let chipFirstRect = null;
  let chipLaterRect = null;
  let workingSeen = false;
  let legAnim = null;
  const pollStart = Date.now();
  while (Date.now() - pollStart < 7000) {
    const probe = await ev(`(() => {
      const chip = document.querySelector('.office-panel-main [data-testid="office-fly-file"]');
      const hasan = document.querySelector('.office-panel-main [data-testid="office-cabin-khabar-mausam"]');
      const umar = document.querySelector('.office-panel-main [data-testid="office-cabin-hisab-kitab"]');
      const leg = hasan ? hasan.querySelector('.robot-leg-l') : null;
      const out = {
        working: !!(hasan && hasan.className.includes('office-cabin-working') && umar && umar.className.includes('office-cabin-working')),
        legAnim: leg ? getComputedStyle(leg).animationName : null,
        chip: null,
      };
      if (chip) {
        const r = chip.getBoundingClientRect();
        out.chip = {
          from: chip.dataset.from, to: chip.dataset.to, kind: chip.dataset.kind,
          robot: !!chip.querySelector('svg'),
          doc: chip.textContent.includes('📄'),
          x: r.left + r.width / 2, y: r.top + r.height / 2,
        };
      }
      return out;
    })()`);
    if (probe.working) { workingSeen = true; legAnim = probe.legAnim; }
    if (probe.chip) {
      const key = `${probe.chip.from}->${probe.chip.to}:${probe.chip.kind}`;
      if (!chipSightings.includes(key)) {
        chipSightings.push(key);
        if (!chipFirstRect) {
          chipFirstRect = probe.chip;
          await sleep(300); // let the traveler reach mid-arc (full size/opacity) before the still
          await shot('03-desktop-handoff-midflight.png');
          await sleep(120);
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
  check('حسن + عمر cabins LIT «working» while the request runs', workingSeen);
  check('working robot REALLY in motion (leg animation = robot-step)', legAnim === 'robot-step', String(legAnim));
  check('traveler flew hosts(hub) → حسن (dispatch)', chipSightings.includes('hub->khabar-mausam:dispatch'), chipSightings.join(' | '));
  check('traveler then flew حسن → عمر (handoff)', chipSightings.includes('khabar-mausam->hisab-kitab:handoff'), chipSightings.join(' | '));
  check('traveler IS a robot carrying the 📄 (svg + file in hands)',
    !!chipFirstRect && chipFirstRect.robot && chipFirstRect.doc);
  check('traveler REALLY moved between samples (>25px)',
    !!chipFirstRect && !!chipLaterRect && Math.hypot(chipLaterRect.x - chipFirstRect.x, chipLaterRect.y - chipFirstRect.y) > 25,
    chipFirstRect && chipLaterRect ? `(${chipFirstRect.x.toFixed(0)},${chipFirstRect.y.toFixed(0)}) → (${chipLaterRect.x.toFixed(0)},${chipLaterRect.y.toFixed(0)})` : 'missing samples');
  await shot('02-desktop-working.png');

  // ================= C) release: deliver flights + board pins + done =================
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
        if (deliverSightings.length === 1) {
          await sleep(250); // mid-arc, full opacity
          await shot('04b-desktop-deliver-midflight.png');
        }
      }
    }
    if (boardRows >= 2 && deliverSightings.length >= 2) break;
    await sleep(60);
  }
  check('both completions pinned on the panel board', boardRows >= 2, `rows=${boardRows}`);
  check('traveler robots carried the files cabin → board (deliver)',
    deliverSightings.includes('khabar-mausam->board:deliver') && deliverSightings.includes('hisab-kitab->board:deliver'),
    deliverSightings.join(' | ') || 'none seen');
  await sleep(1800);
  check('cabins settle into done state after real completion',
    await ev(`[...document.querySelectorAll('.office-panel-main .office-cabin')].some((c) => c.className.includes('office-cabin-done'))`));
  await ev(`(() => { document.querySelectorAll('.tool-results .tool-results-close').forEach((b) => b.click()); return true; })()`).catch(() => {});
  await sleep(500);
  await shot('04-desktop-delivered.png');

  // ================= D) overlay close-up: robots, plaques, باس/مینیجر tags =================
  await ev(`document.querySelector('[data-testid="button-office-expand"]').click()`);
  await sleep(900);
  const modalInfo = await ev(`(() => {
    const s = document.querySelector('[data-testid="panel-agent-team-scene"]');
    if (!s) return null;
    const hosts = s.querySelector('[data-testid="office-hosts-cabin"]');
    return {
      cabinsWithRobots: s.querySelectorAll('.office-cabin .cabin-robot-svg').length,
      plaques: s.querySelectorAll('.office-cabin .cabin-plaque').length,
      sign: !!s.querySelector('.office-sign-brand'),
      bossTag: hosts?.querySelector('.hosts-role-boss')?.textContent.trim() || null,
      managerTag: hosts?.querySelector('.hosts-role-manager')?.textContent.trim() || null,
    };
  })()`);
  check('overlay scene: 7 cabins with robots + plaques, sign, hosts cabin with باس/مینیجر tags',
    !!modalInfo && modalInfo.cabinsWithRobots === 7 && modalInfo.plaques === 7 && modalInfo.sign
      && modalInfo.bossTag === 'باس — یونیک' && modalInfo.managerTag === 'مینیجر — یونیکا',
    JSON.stringify(modalInfo));
  await shot('06-desktop-modal-closeup.png');
  // The reply's own result cards stack over the scene's middle
  // (pre-existing overlay behavior) — dismiss everything that is
  // not the office scene so the hosts cabin is truly visible.
  await ev(`(() => { document.querySelectorAll('.tool-results:not(.office-scene) .tool-results-close').forEach((b) => b.click()); return true; })()`).catch(() => {});
  await sleep(700);
  check('hosts cabin in the modal is not occluded by leftover result cards',
    await ev(`(() => {
      const el = document.querySelector('[data-testid="panel-agent-team-scene"] [data-testid="office-hosts-cabin"]');
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!hit && !!hit.closest('[data-testid="office-hosts-cabin"]');
    })()`));
  await shotEl('07-hosts-labels-closeup.png', '[data-testid="panel-agent-team-scene"] [data-testid="office-hosts-cabin"]');
  await ev(`(() => { document.querySelector('[data-testid="panel-agent-team-scene"] .tool-results-close').click(); return true; })()`);
  await sleep(400);

  // ================= E) Uniqa summoned: seated + golden =================
  await ev(`localStorage.setItem('unique-ai-persona', 'uniqa')`);
  await page.send('Page.navigate', { url: `${APP}/` });
  let duoLoaded = false;
  for (let i = 0; i < 30 && !duoLoaded; i++) {
    await sleep(700);
    duoLoaded = await ev(`!!document.querySelector('.office-panel-main [data-testid="office-hosts-cabin"]')`).catch(() => false);
  }
  await sleep(1200);
  const duoInfo = await ev(`(() => {
    const hosts = document.querySelector('.office-panel-main [data-testid="office-hosts-cabin"]');
    if (!hosts) return null;
    return {
      uniqaRobot: !!hosts.querySelector('.hosts-seat-uniqa .cabin-robot-svg'),
      duo: hosts.className.includes('office-hosts-duo'),
      status: hosts.querySelector('.cabin-status')?.textContent.trim() || null,
    };
  })()`);
  check('Uniqa summoned: robot SEATED in the hosts cabin, cabin golden (duo)',
    !!duoInfo && duoInfo.uniqaRobot && duoInfo.duo, JSON.stringify(duoInfo));
  await shotEl('08-hosts-duo.png', '.office-panel-main [data-testid="office-hosts-cabin"]');
  await ev(`localStorage.removeItem('unique-ai-persona')`);

  // ================= F) phone width =================
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
      robots: panel.querySelectorAll('.cabin-robot-svg').length,
      hosts: !!panel.querySelector('[data-testid="office-hosts-cabin"]'),
    };
  })()`);
  check('phone: composer + chat usable, office section below with robots + hosts cabin',
    !!mobileInfo && mobileInfo.chatH > 200 && mobileInfo.panelW > 300 && mobileInfo.cabins >= 7 && mobileInfo.robots >= 8 && mobileInfo.hosts && mobileInfo.panelBelowChat,
    JSON.stringify(mobileInfo));
  await ev(`document.querySelector('[data-testid="panel-office-main"]').scrollIntoView({ block: 'start' })`);
  await sleep(700);
  await shot('05-mobile-office.png');

  console.log(failed === 0 ? '\n✅ ROBOTS VERIFY: ALL PASS' : `\n❌ ROBOTS VERIFY: ${failed} FAILURES`);
} catch (err) {
  console.error('VERIFY ERROR:', err.message);
  console.error(serverLog.slice(-1500));
  failed++;
} finally {
  try { chromeProc.kill('SIGKILL'); } catch { /* already gone */ }
  try { serverProc.kill('SIGKILL'); } catch { /* already gone */ }
}
process.exit(failed ? 1 : 0);
