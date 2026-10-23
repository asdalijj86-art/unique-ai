/**
 * cdp-verify-floor.mjs — visual verification of the LIVING FLOOR
 * office (Round 4, built to the user's reference VIDEO: one
 * top-down floor, labeled zones, chibi characters who WALK the
 * work between desks — after he rejected the cabin grid:
 * «ایسا کیبن نہیں تھا بنانا»), driven in headless Chromium over
 * CDP against the REAL built app + server.
 *
 * Proves:
 *  A) On load, the main-screen panel shows ONE floor scene: the
 *     «Unique AI» sign on the window wall, the org line, 11 labeled
 *     zones, the آج کا بورڈ block + plaza kiosk, and 8 robot-boy
 *     characters (باس یونیک at the hosts' desk + 7 agents) each
 *     with a floating NAME label. Uniqa's manager chair stands
 *     EMPTY while she is not summoned. Idle honesty sampler: no
 *     character carries a 📄, none glows «working», and every
 *     character stays inside his own zone.
 *  B) A two-agent request (weather + currency) held at the network
 *     seam: حسن + عمر go «working» AT their desks (computed arm
 *     animation = robot-type, zones glow); then the DISPATCH — the
 *     boss's own character picks up the 📄 at the hosts' desk and
 *     WALKS it across the floor to حسن's doorstep (three position
 *     phases sampled: far / mid-floor walking / arrived); then
 *     حسن carries it on to عمر (handoff).
 *  C) Releasing the request pins both completions on the board;
 *     the agents WALK their files to the plaza board (kiosk glows
 *     on delivery) and settle «done» at their desks.
 *  D) The ⤢ overlay shows the same big floor; clicking دانیال's
 *     character opens his close-up card.
 *  E) persona=uniqa: Uniqa's golden robot sits at the hosts' desk
 *     beside the boss (hosts zone glows gold); removing the
 *     persona empties her chair again.
 *  F) Phone width: chat stays usable and the floor lives below it.
 *
 * TRANSPORT NOTE (environment, 2026-10-23): this sandbox's Chromium
 * 152 blocks ALL loopback page loads with
 * ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS, so every request the
 * page makes is relayed through the CDP Fetch domain: node fetches
 * it from the REAL running server and fulfills it in-page. The app
 * code, the server and every response byte are the production
 * ones — only Chrome's own network transport is bypassed. The ONE
 * substituted response is the chat completion itself (held, then
 * answered with exact ChatAction shapes) — the same model seam the
 * other verifiers stub, since no Gemini key exists in the sandbox.
 *
 * Screenshots land in the goal's office-floor-verify folder.
 * Prereqs: client built (server/dist), chrome at /opt/meta-chromium/chrome.
 * Run: node server/cdp-verify-floor.mjs   (from repo root)
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
const OUT = '/home/hatch/workspace/goals/unique-ai-project-completion/hidden_files/office-floor-verify';
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

rmSync('/tmp/cdp-floor-profile', { recursive: true, force: true });
const chromeProc = spawn('/opt/meta-chromium/chrome', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
  `--remote-debugging-port=${CDP_PORT}`, '--user-data-dir=/tmp/cdp-floor-profile',
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

const AGENTS = [
  ['talash', 'دانیال'], ['khabar-mausam', 'حسن'], ['hisab-kitab', 'عمر'],
  ['likhai', 'علی'], ['media', 'حمزہ'], ['quran-namaz', 'یوسف'], ['builder', 'احمد'],
];
const SCOPE = '.office-panel-main ';

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

  // ================= A) the floor on load =================
  const a = await ev(`(() => {
    const q = (s) => document.querySelector('${SCOPE}' + s);
    const qa = (s) => [...document.querySelectorAll('${SCOPE}' + s)];
    const sign = q('.office-sign-brand');
    const org = q('.office-orgline');
    const hosts = q('[data-testid="office-hosts-cabin"]');
    const uniq = q('[data-testid="floor-char-unique"]');
    const chars = {};
    for (const [k] of ${JSON.stringify(AGENTS)}) {
      const el = q('[data-testid="floor-char-' + k + '"]');
      chars[k] = el ? {
        robot: !!el.querySelector('.cabin-robot-svg'),
        name: el.querySelector('.floor-char-name')?.textContent.trim() || null,
        status: el.getAttribute('data-status'),
      } : null;
    }
    return {
      sign: sign ? sign.textContent.trim() : null,
      org: org ? org.textContent.replace(/\\s+/g, ' ').trim() : null,
      zones: qa('.floor-zone').length,
      zoneLabels: qa('.floor-zone-label').map((e) => e.textContent.trim()),
      hostsAnchor: hosts ? hosts.getAttribute('data-handoff-anchor') : null,
      hostsDuo: hosts ? hosts.className.includes('floor-zone-duo') : null,
      uniq: uniq ? {
        robot: !!uniq.querySelector('.cabin-robot-svg'),
        name: uniq.querySelector('.floor-char-name')?.textContent.trim() || null,
        role: uniq.querySelector('.floor-char-role')?.textContent.trim() || null,
      } : null,
      uniqaChar: !!q('[data-testid="floor-char-uniqa"]'),
      emptySeat: !!q('[data-testid="office-uniqa-seat"]'),
      chars,
      board: !!q('[data-testid="office-board"]'),
      kiosk: (() => { const k = q('[data-testid="floor-board-kiosk"]'); return k ? k.getAttribute('data-handoff-anchor') : null; })(),
      workingChars: qa('.floor-char-working').length,
      workingZones: qa('.floor-zone-working').length,
    };
  })()`);
  check('«Unique AI» sign hangs on the floor wall', a.sign === 'Unique AI', a.sign || 'missing');
  check('org line: باس یونیک • مینیجر یونیکا • ٹیم 7 ایجنٹ',
    !!a.org && a.org.includes('باس: یونیک') && a.org.includes('مینیجر: یونیکا') && a.org.includes('7 ایجنٹ'), a.org || 'missing');
  check('11 labeled zones on the floor (hosts + 7 agents + meeting + plaza + coffee)',
    a.zones === 11 && a.zoneLabels.includes('میڈیا') && a.zoneLabels.includes('بلڈر') && a.zoneLabels.includes('قرآن و نماز'),
    `zones=${a.zones} labels=${a.zoneLabels.join('/')}`);
  check('hosts zone is the dispatch hub (data-handoff-anchor=hub), not golden while Uniqa is away',
    a.hostsAnchor === 'hub' && a.hostsDuo === false);
  check('باس یونیک: robot-boy at the hosts desk with floating name + باس role label',
    !!a.uniq && a.uniq.robot && a.uniq.name === 'یونیک' && a.uniq.role === 'باس', JSON.stringify(a.uniq));
  check('Uniqa NOT summoned: NO character for her — her manager chair stands EMPTY (presence honesty)',
    a.uniqaChar === false && a.emptySeat === true);
  check('all 7 agents on the floor: robot-boy + floating NAME label each, none working while idle',
    AGENTS.every(([k, person]) => {
      const c = a.chars[k];
      return c && c.robot && c.name === person && c.status !== 'working';
    }) && a.workingChars === 0 && a.workingZones === 0,
    JSON.stringify(Object.fromEntries(Object.entries(a.chars).map(([k, v]) => [k, v && v.name]))));
  check('آج کا بورڈ block + plaza kiosk (data-handoff-anchor=board) present', a.board && a.kiosk === 'board');

  // Idle honesty sampler (~2.6s): nothing carried, nobody leaves his zone.
  let idleViolation = null;
  for (let i = 0; i < 10 && !idleViolation; i++) {
    idleViolation = await ev(`(() => {
      const feet = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.86 }; };
      const inside = (p, el, pad) => {
        const r = el.getBoundingClientRect();
        return p.x >= r.left - pad && p.x <= r.right + pad && p.y >= r.top - pad && p.y <= r.bottom + pad;
      };
      for (const el of document.querySelectorAll('${SCOPE}.floor-char')) {
        if (el.getAttribute('data-carrying') === 'true') return 'a character carries 📄 while idle: ' + el.getAttribute('data-testid');
      }
      const pairs = [['unique', '[data-testid="office-hosts-cabin"]'],
        ...${JSON.stringify(AGENTS)}.map(([k]) => [k, '[data-testid="floor-zone-' + k + '"]'])];
      for (const [k, zsel] of pairs) {
        const ch = document.querySelector('${SCOPE}[data-testid="floor-char-' + k + '"]');
        const zo = document.querySelector('${SCOPE}' + zsel);
        if (ch && zo && !inside(feet(ch), zo, 9)) return 'character outside his own zone while idle: ' + k;
      }
      return null;
    })()`);
    if (!idleViolation) await sleep(260);
  }
  check('IDLE honesty (2.6s sampler): no 📄 carried, every character inside his OWN zone', !idleViolation, idleViolation || '');
  await shot('01-desktop-idle.png');
  await shotEl('07-floor-closeup-idle.png', '.office-panel-main .floor-scene');

  // ================= B) work + the boss WALKS the file =================
  await ev(`(() => {
    const ta = document.querySelector('[data-testid="input-message"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, 'کراچی کا موسم بتاؤ اور 100 ڈالر کتنے روپے کے ہیں؟');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await sleep(250);
  await ev(`document.querySelector('[data-testid="button-send-message"]').click()`);

  const probeB = `(() => {
    const q = (s) => document.querySelector('${SCOPE}' + s);
    const scene = q('.floor-scene');
    const sr = scene.getBoundingClientRect();
    const fpt = (fx, fy) => ({ x: sr.left + (fx / 100) * sr.width, y: sr.top + (fy / 75) * sr.height });
    const feet = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.86 }; };
    const st = (k) => q('[data-testid="floor-char-' + k + '"]');
    const uniq = st('unique'); const hasan = st('khabar-mausam'); const umar = st('hisab-kitab');
    const arm = hasan ? hasan.querySelector('.robot-arm-l') : null;
    return {
      uniqPos: uniq ? feet(uniq) : null,
      uniqCarrying: uniq ? uniq.getAttribute('data-carrying') === 'true' : false,
      uniqWalking: uniq ? uniq.className.includes('floor-char-walking') : false,
      hasanFront: fpt(49.25, 28.2),
      sceneW: sr.width,
      hasanStatus: hasan ? hasan.getAttribute('data-status') : null,
      umarStatus: umar ? umar.getAttribute('data-status') : null,
      hasanCarrying: hasan ? hasan.getAttribute('data-carrying') === 'true' : false,
      armAnim: arm ? getComputedStyle(arm).animationName : null,
      hasanZoneWorking: !!q('.floor-zone-khabar-mausam.floor-zone-working'),
      umarZoneWorking: !!q('.floor-zone-hisab-kitab.floor-zone-working'),
    };
  })()`;
  let farSeen = false; let midSeen = false; let arrivedSeen = false;
  let workingSeen = false; let armAnim = null; let hasanCarrySeen = false;
  let shotA = false; let shotB = false; let shotC = false;
  let firstDist = null;
  // Screenshots fire WITHOUT awaiting inside the poll loop: an
  // awaited captureScreenshot stalls sampling ~0.5s — longer than
  // the mid-floor window of a 1.8s walk (that stall flaked phase 2
  // once in four runs; the walk itself was proven by phases 1+3).
  const pendingShots = [];
  const bStart = Date.now();
  while (Date.now() - bStart < 16000) {
    const p = await ev(probeB);
    if (p.hasanStatus === 'working' && p.umarStatus === 'working' && p.hasanZoneWorking && p.umarZoneWorking) {
      workingSeen = true; armAnim = p.armAnim;
    }
    if (p.hasanCarrying) hasanCarrySeen = true;
    if (p.uniqPos && p.hasanFront) {
      const d = Math.hypot(p.uniqPos.x - p.hasanFront.x, p.uniqPos.y - p.hasanFront.y);
      if (firstDist === null) firstDist = d;
      if (p.uniqCarrying && d > p.sceneW * 0.34) farSeen = true;
      if (p.uniqCarrying && p.uniqWalking && d <= p.sceneW * 0.34 && d > Math.max(30, p.sceneW * 0.06)) {
        midSeen = true;
        if (!shotB) { shotB = true; pendingShots.push(shot('03b-dispatch-midfloor.png')); }
      }
      if (p.uniqCarrying && !shotA) { shotA = true; pendingShots.push(shot('03a-dispatch-leaving.png')); }
      if (p.uniqCarrying && d <= Math.max(30, p.sceneW * 0.06)) {
        arrivedSeen = true;
        if (!shotC) { shotC = true; pendingShots.push(shot('03c-dispatch-arriving.png')); }
      }
    }
    if (heldChatRequestId && workingSeen && hasanCarrySeen) break;
    await sleep(60);
  }
  await Promise.allSettled(pendingShots);
  check('chat request reached the network seam and is held', !!heldChatRequestId);
  check('حسن + عمر «working» at their desks, their ZONES glowing', workingSeen);
  check('working agent REALLY typing (computed arm animation = robot-type)', armAnim === 'robot-type', String(armAnim));
  check('DISPATCH: باس یونیک carried the 📄 himself — phase 1: still far from حسن (near hosts)', farSeen);
  check('DISPATCH phase 2: boss seen WALKING mid-floor with the file', midSeen);
  check('DISPATCH phase 3: boss ARRIVED at حسن doorstep with the file', arrivedSeen);
  check('HANDOFF: حسن then carried the 📄 onward himself (to عمر)', hasanCarrySeen);
  await shot('02-desktop-working.png');

  // ================= C) release: deliver walks + board pins + done =================
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

  const probeC = `(() => {
    const q = (s) => document.querySelector('${SCOPE}' + s);
    const qa = (s) => [...document.querySelectorAll('${SCOPE}' + s)];
    const scene = q('.floor-scene');
    const sr = scene.getBoundingClientRect();
    const boardFront = { x: sr.left + (55.5 / 100) * sr.width, y: sr.top + (45.8 / 75) * sr.height };
    let carrierNearBoard = false; let anyCarrying = false;
    for (const el of qa('.floor-char')) {
      if (el.getAttribute('data-carrying') === 'true') {
        anyCarrying = true;
        const r = el.getBoundingClientRect();
        const f = { x: r.left + r.width / 2, y: r.top + r.height * 0.86 };
        if (Math.hypot(f.x - boardFront.x, f.y - boardFront.y) < Math.max(34, sr.width * 0.07)) carrierNearBoard = true;
      }
    }
    return {
      rows: qa('.office-board-row').length,
      kioskGlow: !!q('.floor-kiosk.floor-kiosk-glow'),
      anyCarrying, carrierNearBoard,
      hasanStatus: q('[data-testid="floor-char-khabar-mausam"]')?.getAttribute('data-status') || null,
    };
  })()`;
  let boardRows = 0; let kioskGlowSeen = false; let deliverWalkSeen = false; let nearBoardSeen = false;
  const cStart = Date.now();
  while (Date.now() - cStart < 14000) {
    const p = await ev(probeC);
    boardRows = p.rows;
    if (p.kioskGlow) kioskGlowSeen = true;
    if (p.anyCarrying) deliverWalkSeen = true;
    if (p.carrierNearBoard) nearBoardSeen = true;
    if (boardRows >= 2 && kioskGlowSeen && nearBoardSeen) break;
    await sleep(60);
  }
  check('both completions pinned on the panel board', boardRows >= 2, `rows=${boardRows}`);
  check('DELIVER: an agent WALKED his file across the floor after completion', deliverWalkSeen);
  check('DELIVER: the carrier reached the plaza board (within ~7% of floor width)', nearBoardSeen);
  check('DELIVER: the board kiosk GLOWED as the file arrived', kioskGlowSeen);
  await sleep(2200);
  const doneStatus = await ev(`document.querySelector('${SCOPE}[data-testid="floor-char-khabar-mausam"]')?.getAttribute('data-status')`);
  check('agents settle «done» at their desks after real completion', doneStatus === 'done', String(doneStatus));
  await ev(`(() => { document.querySelectorAll('.tool-results:not(.office-scene) .tool-results-close').forEach((b) => b.click()); return true; })()`).catch(() => {});
  await sleep(500);
  await shot('04-desktop-delivered.png');

  // ================= D) overlay: the big floor + click a character =================
  await ev(`document.querySelector('[data-testid="button-office-expand"]').click()`);
  await sleep(900);
  const d = await ev(`(() => {
    const s = document.querySelector('[data-testid="panel-agent-team-scene"]');
    if (!s) return null;
    return {
      scene: !!s.querySelector('.floor-scene'),
      chars: s.querySelectorAll('.floor-char').length,
      zones: s.querySelectorAll('.floor-zone').length,
      sign: !!s.querySelector('.office-sign-brand'),
      emptySeat: !!s.querySelector('[data-testid="office-uniqa-seat"]'),
    };
  })()`);
  check('overlay: the SAME big floor — 8 characters, 11 zones, sign, Uniqa chair empty',
    !!d && d.scene && d.chars === 8 && d.zones === 11 && d.sign && d.emptySeat, JSON.stringify(d));
  await shot('06-desktop-modal-closeup.png');
  await ev(`document.querySelector('[data-testid="panel-agent-team-scene"] [data-testid="floor-char-talash"]').click()`);
  await sleep(600);
  const closeupText = await ev(`(() => {
    const c = document.querySelector('[data-testid="panel-agent-team-scene"] [data-testid="office-closeup"]');
    return c ? c.textContent.replace(/\\s+/g, ' ').trim() : null;
  })()`);
  check('clicking دانیال character opens his close-up card', !!closeupText && closeupText.includes('دانیال'), (closeupText || 'missing').slice(0, 80));
  await ev(`(() => { document.querySelector('[data-testid="panel-agent-team-scene"] .tool-results-close').click(); return true; })()`);
  await sleep(400);

  // ================= E) Uniqa summoned: golden seat in the hosts corner =================
  await ev(`localStorage.setItem('unique-ai-persona', 'uniqa')`);
  await page.send('Page.navigate', { url: `${APP}/` });
  let duoLoaded = false;
  for (let i = 0; i < 30 && !duoLoaded; i++) {
    await sleep(700);
    duoLoaded = await ev(`!!document.querySelector('${SCOPE}[data-testid="floor-char-uniqa"]')`).catch(() => false);
  }
  await sleep(1000);
  const e = await ev(`(() => {
    const q = (s) => document.querySelector('${SCOPE}' + s);
    const u = q('[data-testid="floor-char-uniqa"]');
    const hosts = q('[data-testid="office-hosts-cabin"]');
    return {
      char: !!u,
      robot: u ? !!u.querySelector('.cabin-robot-svg') : false,
      name: u ? u.querySelector('.floor-char-name')?.textContent.trim() || null : null,
      role: u ? u.querySelector('.floor-char-role')?.textContent.trim() || null : null,
      goldTint: u ? (u.getAttribute('style') || '').includes('fde047') : false,
      duo: hosts ? hosts.className.includes('floor-zone-duo') : false,
      emptySeat: !!q('[data-testid="office-uniqa-seat"]'),
    };
  })()`);
  check('Uniqa summoned: golden robot SEATED at the hosts desk, name + مینیجر label, hosts zone golden',
    !!e && e.char && e.robot && e.name === 'یونیکا' && e.role === 'مینیجر' && e.goldTint && e.duo && !e.emptySeat,
    JSON.stringify(e));
  await shotEl('08-hosts-duo.png', '.office-panel-main .floor-scene');
  await ev(`localStorage.removeItem('unique-ai-persona')`);
  await page.send('Page.navigate', { url: `${APP}/` });
  let soloBack = false;
  for (let i = 0; i < 30 && !soloBack; i++) {
    await sleep(700);
    soloBack = await ev(`!!document.querySelector('${SCOPE}[data-testid="office-uniqa-seat"]') && !document.querySelector('${SCOPE}[data-testid="floor-char-uniqa"]')`).catch(() => false);
  }
  check('persona back to default: Uniqa gone, her chair empty again', soloBack === true);
  await shotEl('09-hosts-unique-alone.png', '.office-panel-main .floor-scene');

  // ================= F) phone width =================
  await page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await page.send('Page.navigate', { url: `${APP}/` });
  let mobileLoaded = false;
  for (let i = 0; i < 30 && !mobileLoaded; i++) {
    await sleep(700);
    mobileLoaded = await ev(`!!document.querySelector('[data-testid="panel-office-main"]')`).catch(() => false);
  }
  await sleep(800);
  const f = await ev(`(() => {
    const panel = document.querySelector('[data-testid="panel-office-main"]');
    const chat = document.querySelector('.jarvis-chat');
    const composer = document.querySelector('[data-testid="input-message"]');
    if (!panel || !chat || !composer) return null;
    const pr = panel.getBoundingClientRect();
    const cr = chat.getBoundingClientRect();
    const scene = panel.querySelector('.floor-scene');
    const sr = scene ? scene.getBoundingClientRect() : null;
    return {
      panelW: pr.width,
      panelBelowChat: pr.top >= cr.bottom - 4,
      chatH: cr.height,
      chars: panel.querySelectorAll('.floor-char').length,
      sceneH: sr ? sr.height : 0,
    };
  })()`);
  check('phone: composer + chat usable, floor below with its 8 characters',
    !!f && f.chatH > 200 && f.panelW > 300 && f.chars >= 8 && f.sceneH > 150 && f.panelBelowChat,
    JSON.stringify(f));
  await ev(`document.querySelector('[data-testid="panel-office-main"]').scrollIntoView({ block: 'start' })`);
  await sleep(700);
  await shot('05-mobile-office.png');

  console.log(failed === 0 ? '\n✅ FLOOR VERIFY: ALL PASS' : `\n❌ FLOOR VERIFY: ${failed} FAILURES`);
} catch (err) {
  console.error('VERIFY ERROR:', err.message);
  console.error(serverLog.slice(-1500));
  failed++;
} finally {
  try { chromeProc.kill('SIGKILL'); } catch { /* already gone */ }
  try { serverProc.kill('SIGKILL'); } catch { /* already gone */ }
}
process.exit(failed ? 1 : 0);
