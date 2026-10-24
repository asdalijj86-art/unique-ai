/**
 * cdp-verify-floor.mjs — visual verification of the LIVING FLOOR
 * office (Round 4, built to the user's reference VIDEO: one
 * top-down floor, labeled zones, chibi characters who WALK the
 * work between desks — after he rejected the cabin grid:
 * «ایسا کیبن نہیں تھا بنانا»), driven in headless Chromium over
 * CDP against the REAL built app + server.
 *
 * VISUAL ROUND (2026-10-24) additions — the user's orders:
 * «یہ روبوٹ نہیں — کارٹون لگاؤ، انسان جیسے دکھائی دیں، خوبصورت
 * چہرے ہوں» (23:43), «ان کے سامنے کمپیوٹر رکھو» (23:41) and the
 * color+uniform decision (00:03: ONE brand color family for the
 * whole office; ONE identical office uniform for all 7 agents).
 * This verifier now proves HUMANS, not robots:
 *  A) On load, the main-screen panel shows ONE floor scene: the
 *     «Unique AI» sign in the org strip above it, 11 labeled
 *     zones, the آج کا بورڈ block + plaza kiosk, and 8 CARTOON HUMAN
 *     characters (باس یونیک at the hosts' desk + 7 agents) — each a
 *     person SVG with face + hair (person-eyes/person-head present),
 *     each with a floating NAME label. ZERO robot markup anywhere
 *     in the office panel and no 🤖 inside the scene. All 7 agents
 *     wear the IDENTICAL uniform (same blazer + tie fills in every
 *     agent SVG); every agent zone wears the SAME brand border
 *     color; and every desk — 7 agents + boss + manager seat — has
 *     a COMPUTER (floor-pc) standing at the exact in-front-of-seat
 *     point from lib/floor-layout, inside its zone. Uniqa's manager
 *     chair stands EMPTY while she is not summoned, but HER
 *     computer already waits at her seat (dim). Idle honesty
 *     sampler: no character carries a 📄, none glows «working»,
 *     and every character stays inside his own zone.
 *  B) A two-agent request (weather + currency) held at the network
 *     seam: حسن + عمر go «working» AT their desks (computed arm
 *     animation = person-type, zones glow, their desk computers
 *     switch ON/bright); then the DISPATCH — the boss's own
 *     character picks up the 📄 at the hosts' desk and WALKS it
 *     across the floor to حسن's doorstep (three position phases
 *     sampled: far / mid-floor walking / arrived); then حسن
 *     carries it on to عمر (handoff).
 *  C) Releasing the request pins both completions on the board;
 *     the agents WALK their files to the plaza board (kiosk glows
 *     on delivery) and settle «done» at their desks.
 *  D) The ⤢ overlay shows the same big floor (8 people, 9+
 *     computers); clicking دانیال's character opens his close-up.
 *  E) persona=uniqa: Uniqa — a GIRL (long-hair person SVG) — sits
 *     golden at the hosts' desk beside the boss, her computer ON
 *     (hosts zone glows gold); removing the persona empties her
 *     chair again and her computer dims.
 *  F) Phone width: chat stays usable and the floor lives below it.
 *
 * CLEANUP ROUND (2026-10-24 00:34/00:41/00:42) additions — the
 * user's screenshot inspection («یہ چیزیں تم خود دیکھ لیا کرو»):
 *  G) The org line is GONE from the scene's bottom edge; instead
 *     an ORG STRIP stands ABOVE the floor (in flow, never inside
 *     the scene): باس: یونیک on one side of the «Unique AI» sign,
 *     مینیجر: یونیکا on the other, ٹیم: 7 ایجنٹ + the hosts'
 *     presence line in the row beneath — separate elements, and
 *     NO org text anywhere inside the scene.
 *  H) DECLUTTER GEOMETRY AUDIT: for every text element on the
 *     floor (every zone plaque, every SEATED character's name/
 *     role label, the board kiosk's texts) assert ZERO rectangle
 *     intersection with every prop (desk computers, deskbars,
 *     the hosts' mic, یوسف's mosque, حمزہ's wall screen, server
 *     racks, sofa, the meeting table set, the coffee set). Any
 *     collision is NAMED in the failure output.
 *  I) COFFEE CORNER: a café set (round table + cup + 2 chairs
 *     around it) exists and never touches the «کافی» plaque.
 *  J) MOSQUE: 🕌 present, SIZED (a real marker, not a speck),
 *     in یوسف's zone, zero overlap with his name + his plaque.
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
 * FIX ROUND 2 (2026-10-24) additions — the user's OWN
 * screenshot inspection («تمہاری چھوٹی چھوٹی غلطیاں پکڑ رہا ہوں
 * میں… اپنے کام چیک کر لو») caught what section H's audit
 * missed: عمر's and احمد's plaques stood at the BACK of their
 * zones, half-hidden behind their bodies:
 *  K) Both front-row plaques now stand at the FRONT (bottom) of
 *     their zones like the other five agents' — desk stacks
 *     moved up in lib/floor-layout — and an EXTENDED audit
 *     proves every floor text clear of desk bars, PCs, character
 *     HOME bodies (rects translated to the chair point, so a
 *     strolling character cannot hide a collision), every other
 *     text, and every prop; every plaque vertically contained
 *     in its zone and the two fixed plaques fully contained
 *     (the one pre-existing exception — wide «خبر و موسم»
 *     spilling over empty side rug — is documented at the
 *     check). The meeting room seats EIGHT chairs in two
 *     FACING rows of 4 (DOM-asserted, pairs opposite each
 *     other); the لانج holds TWO sofas facing each other (FIX
 *     ROUND 3: both DRAWN upright in CSS, no flip anywhere, the
 *     floor lamp upright between them — DOM-asserted). Zone crops
 *     of عمر / احمد / meeting / لانج are shot for eyeball review.
 *
 * FIX ROUND 3 (2026-10-24, the user's live-floor inspection)
 * additions: L) the idle amble — an idle agent stays SEATED at
 *     his desk; a ~21s sampler asserts every agent spends the
 *     clear majority of samples within 2.5 units of his chair
 *     (the old stroll left یوسف standing far from his computer:
 *     «یوسف دیکھو کہاں پہ ہے… کمپیوٹر دیکھو کہاں پہ ہے»).
 *
 * Screenshots land in the goal's office-fix3-verify folder.
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
const OUT = '/home/hatch/workspace/goals/unique-ai-project-completion/hidden_files/office-fix3-verify';
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
  // Desk geometry from lib/floor-layout (the map the scene renders):
  // each staffed desk's computer stands at (desk.x, chair.y + 2.9) —
  // on the desk's front half, directly IN FRONT of the seat (screen
  // over his chest, face visible above it); hosts' seats likewise.
  const DESKS = {
    talash: [33.25, 19.5, 20.7], 'khabar-mausam': [49.25, 19.5, 20.7], likhai: [65.25, 19.5, 20.7],
    media: [86.5, 21, 22.2], 'quran-namaz': [86.5, 44, 45.2],
    'hisab-kitab': [33, 62.8, 64], builder: [71, 64.7, 65.9],
  };
  const a = await ev(`(() => {
    const q = (s) => document.querySelector('${SCOPE}' + s);
    const qa = (s) => [...document.querySelectorAll('${SCOPE}' + s)];
    const sign = q('.office-sign-brand');
    const hosts = q('[data-testid="office-hosts-cabin"]');
    const uniq = q('[data-testid="floor-char-unique"]');
    const panel = document.querySelector('[data-testid="panel-office-main"]');
    const scene = q('.floor-scene');
    const sr = scene.getBoundingClientRect();
    const fpt = (fx, fy) => ({ x: sr.left + (fx / 100) * sr.width, y: sr.top + (fy / 75) * sr.height });
    // ORG STRIP (cleanup round): above the scene, in flow — the
    // boss/manager/team items are separate elements flanking the
    // sign; NOTHING org-related may remain inside the scene.
    const strip = q('.office-orgstrip');
    const stripInfo = strip ? (() => {
      const srect = strip.getBoundingClientRect();
      const boss = strip.querySelector('[data-testid="org-boss"]');
      const manager = strip.querySelector('[data-testid="org-manager"]');
      const team = strip.querySelector('[data-testid="org-team"]');
      const status = strip.querySelector('[data-testid="org-hosts-status"]');
      return {
        insideScene: !!strip.closest('.floor-scene'),
        aboveScene: srect.bottom <= sr.top + 2,
        boss: boss ? boss.textContent.replace(/\\s+/g, ' ').trim() : null,
        manager: manager ? manager.textContent.replace(/\\s+/g, ' ').trim() : null,
        team: team ? team.textContent.replace(/\\s+/g, ' ').trim() : null,
        status: status ? status.textContent.replace(/\\s+/g, ' ').trim() : null,
        separate: !!(boss && manager && team && boss !== manager && boss !== team),
      };
    })() : null;
    const sceneOrgText = scene.textContent.includes('باس: یونیک') || scene.textContent.includes('مینیجر: یونیکا') || scene.textContent.includes('ٹیم: 7 ایجنٹ');
    const personOf = (el) => {
      const svg = el.querySelector('.floor-person-svg');
      if (!svg) return null;
      return {
        eyes: !!svg.querySelector('.person-eyes'),
        head: !!svg.querySelector('.person-head'),
        hairMarkup: svg.querySelector('.person-head').innerHTML.length,
        markup: svg.innerHTML,
      };
    };
    const chars = {};
    for (const [k] of ${JSON.stringify(AGENTS)}) {
      const el = q('[data-testid="floor-char-' + k + '"]');
      chars[k] = el ? {
        person: personOf(el),
        name: el.querySelector('.floor-char-name')?.textContent.trim() || null,
        status: el.getAttribute('data-status'),
      } : null;
    }
    // Computers in front: the monitor STANDS on the desk at the
    // floor point (its box is bottom-anchored there), so its
    // bottom-center must land on the expected in-front-of-seat
    // point, inside the zone.
    const pcAt = (pcSel, fx, fy, zoneSel) => {
      const pc = q(pcSel);
      if (!pc) return null;
      const r = pc.getBoundingClientRect();
      const c = { x: r.left + r.width / 2, y: r.bottom };
      const want = fpt(fx, fy);
      const zone = q(zoneSel);
      const zr = zone ? zone.getBoundingClientRect() : null;
      return {
        on: pc.getAttribute('data-on'),
        dist: Math.hypot(c.x - want.x, c.y - want.y),
        tol: Math.max(4, sr.width * 0.012),
        insideZone: zr ? (c.x >= zr.left && c.x <= zr.right && c.y >= zr.top && c.y <= zr.bottom) : false,
        wFrac: r.width / sr.width,
      };
    };
    const pcs = {};
    for (const [k, [dx, dy, cy]] of Object.entries(${JSON.stringify(DESKS)})) {
      pcs[k] = pcAt('[data-testid="floor-pc-' + k + '"]', dx, cy + 2.9, '[data-testid="floor-zone-' + k + '"]');
    }
    pcs.unique = pcAt('[data-testid="floor-pc-unique"]', 10.4, 21.4 + 2.9, '[data-testid="office-hosts-cabin"]');
    pcs.uniqa = pcAt('[data-testid="floor-pc-uniqa"]', 15.1, 21.4 + 2.9, '[data-testid="office-hosts-cabin"]');
    // FACE CLEAR of the screen: for every character seated at his
    // chair right now, his EYES must sit ABOVE his monitor's top
    // edge — the computer is in front of his chest, never his face.
    const faceClear = {};
    const seatCheck = (charSel, pcSel, fx, fy) => {
      const ch = q(charSel); const pc = q(pcSel);
      if (!ch || !pc) return null;
      const cr = ch.getBoundingClientRect();
      const feetP = { x: cr.left + cr.width / 2, y: cr.top + cr.height * 0.86 };
      const want = fpt(fx, fy);
      if (Math.hypot(feetP.x - want.x, feetP.y - want.y) > sr.width * 0.03) return 'away';
      const eyes = ch.querySelector('.person-eyes');
      if (!eyes) return null;
      const er = eyes.getBoundingClientRect();
      const pr = pc.getBoundingClientRect();
      return er.bottom <= pr.top + 3;
    };
    for (const [k, [dx, dy, cy]] of Object.entries(${JSON.stringify(DESKS)})) {
      faceClear[k] = seatCheck('[data-testid="floor-char-' + k + '"]', '[data-testid="floor-pc-' + k + '"]', dx, cy);
    }
    faceClear.unique = seatCheck('[data-testid="floor-char-unique"]', '[data-testid="floor-pc-unique"]', 10.4, 21.4);
    const zoneBorder = (k) => {
      const z = q('[data-testid="floor-zone-' + k + '"]');
      return z ? getComputedStyle(z).borderTopColor : null;
    };
    return {
      sign: sign ? sign.textContent.trim() : null,
      strip: stripInfo,
      sceneOrgText,
      zones: qa('.floor-zone').length,
      zoneLabels: qa('.floor-zone-label').map((e) => e.textContent.trim()),
      hostsAnchor: hosts ? hosts.getAttribute('data-handoff-anchor') : null,
      hostsDuo: hosts ? hosts.className.includes('floor-zone-duo') : null,
      uniq: uniq ? {
        person: personOf(uniq),
        name: uniq.querySelector('.floor-char-name')?.textContent.trim() || null,
        role: uniq.querySelector('.floor-char-role')?.textContent.trim() || null,
      } : null,
      uniqaChar: !!q('[data-testid="floor-char-uniqa"]'),
      emptySeat: !!q('[data-testid="office-uniqa-seat"]'),
      chars,
      pcs,
      faceClear,
      robotMarkup: panel ? panel.querySelectorAll('.cabin-robot, .cabin-robot-svg, [class*="robot"]').length : -1,
      robotEmojiInScene: scene ? scene.textContent.includes('🤖') : null,
      agentZoneBorders: ['talash', 'khabar-mausam', 'media', 'builder'].map(zoneBorder),
      board: !!q('[data-testid="office-board"]'),
      kiosk: (() => { const k = q('[data-testid="floor-board-kiosk"]'); return k ? k.getAttribute('data-handoff-anchor') : null; })(),
      workingChars: qa('.floor-char-working').length,
      workingZones: qa('.floor-zone-working').length,
    };
  })()`);
  check('«Unique AI» sign stands in the org strip', a.sign === 'Unique AI', a.sign || 'missing');
  check('ORG STRIP at the TOP (cleanup round): above the scene, NOT inside it — باس one side, مینیجر other, ٹیم + presence line, all separate',
    !!a.strip && !a.strip.insideScene && a.strip.aboveScene && a.strip.separate
      && !!a.strip.boss && a.strip.boss.includes('باس: یونیک')
      && !!a.strip.manager && a.strip.manager.includes('مینیجر: یونیکا')
      && !!a.strip.team && a.strip.team.includes('7 ایجنٹ')
      && !!a.strip.status && a.strip.status.includes('یونیک حاضر ہے'),
    JSON.stringify(a.strip));
  check('NOTHING org-related inside the scene (bottom edge clean of باس/مینیجر/ٹیم text)',
    a.sceneOrgText === false, `sceneOrgText=${a.sceneOrgText}`);
  check('11 labeled zones on the floor (hosts + 7 agents + meeting + plaza + coffee)',
    a.zones === 11 && a.zoneLabels.includes('میڈیا') && a.zoneLabels.includes('بلڈر') && a.zoneLabels.includes('قرآن و نماز'),
    `zones=${a.zones} labels=${a.zoneLabels.join('/')}`);
  check('hosts zone is the dispatch hub (data-handoff-anchor=hub), not golden while Uniqa is away',
    a.hostsAnchor === 'hub' && a.hostsDuo === false);
  check('ZERO robots: no robot markup anywhere in the office panel, no 🤖 inside the scene',
    a.robotMarkup === 0 && a.robotEmojiInScene === false, `robotMarkup=${a.robotMarkup} robotEmoji=${a.robotEmojiInScene}`);
  check('باس یونیک: CARTOON HUMAN at the hosts desk (face + hair person SVG), floating name + باس role label',
    !!a.uniq && !!a.uniq.person && a.uniq.person.eyes && a.uniq.person.head && a.uniq.name === 'یونیک' && a.uniq.role === 'باس',
    JSON.stringify(a.uniq && { name: a.uniq.name, role: a.uniq.role, person: !!a.uniq.person }));
  check('Uniqa NOT summoned: NO character for her — her manager chair stands EMPTY (presence honesty)',
    a.uniqaChar === false && a.emptySeat === true);
  check('all 7 agents on the floor: cartoon HUMAN (eyes+head+hair) + floating NAME label each, none working while idle',
    AGENTS.every(([k, person]) => {
      const c = a.chars[k];
      return c && c.person && c.person.eyes && c.person.head && c.person.hairMarkup > 60 && c.name === person && c.status !== 'working';
    }) && a.workingChars === 0 && a.workingZones === 0,
    JSON.stringify(Object.fromEntries(Object.entries(a.chars).map(([k, v]) => [k, v && v.name]))));
  check('UNIFORM: all 7 agents wear the IDENTICAL office uniform (same blazer #2b3a6e + tie #7c3aed in every SVG)',
    AGENTS.every(([k]) => {
      const m = a.chars[k] && a.chars[k].person && a.chars[k].person.markup;
      return !!m && m.includes('#2b3a6e') && m.includes('#7c3aed');
    }));
  check('BOSS look distinct: یونیک suit is NOT the agent uniform (deep-blue #1d3160, no uniform blazer)',
    !!a.uniq && !!a.uniq.person && a.uniq.person.markup.includes('#1d3160') && !a.uniq.person.markup.includes('#2b3a6e'));
  check('ONE brand color: every agent zone wears the SAME border color (talash = khabar = media = builder)',
    a.agentZoneBorders.every((b) => b && b === a.agentZoneBorders[0]), a.agentZoneBorders.join(' | '));
  check('COMPUTERS IN FRONT: all 9 desk monitors (7 agents + boss + manager seat) stand at the in-front-of-seat point, inside their zones',
    Object.entries(a.pcs).every(([, p]) => p && p.dist <= p.tol && p.insideZone && p.wFrac > 0.03 && p.wFrac < 0.085),
    JSON.stringify(Object.fromEntries(Object.entries(a.pcs).map(([k, p]) => [k, p && Math.round(p.dist)]))));
  check('FACES CLEAR: every seated character\'s EYES are above his monitor\'s top edge (computer at his chest, not his face)',
    Object.entries(a.faceClear).every(([, v]) => v === true || v === 'away') && a.faceClear.unique === true,
    JSON.stringify(a.faceClear));
  check('idle computers: agents\' monitors dim (data-on=false); the boss\'s is on; Uniqa\'s waits dim at her empty seat',
    AGENTS.every(([k]) => a.pcs[k] && a.pcs[k].on === 'false') && a.pcs.unique.on === 'true' && a.pcs.uniqa.on === 'false',
    JSON.stringify(Object.fromEntries(Object.entries(a.pcs).map(([k, p]) => [k, p && p.on]))));
  check('آج کا بورڈ block + plaza kiosk (data-handoff-anchor=board) present', a.board && a.kiosk === 'board');

  // ================= H) DECLUTTER GEOMETRY AUDIT =================
  // The user's law (2026-10-24 00:41): every name + duty text on
  // the floor stands COMPLETELY clear — no prop over any text.
  // Rects are measured live in the panel: every zone plaque,
  // every SEATED character's name/role label (feet within 3% of
  // scene width of his chair — a strolling char's label is
  // transient and paints above props anyway) and the kiosk's
  // texts are tested against every prop rect. >1px of shared
  // area on BOTH axes = a collision, and it is NAMED.
  const audit = await ev(`(() => {
    const q = (s) => document.querySelector('${SCOPE}' + s);
    const qa = (s) => [...document.querySelectorAll('${SCOPE}' + s)];
    const scene = q('.floor-scene');
    const sr = scene.getBoundingClientRect();
    const R = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
    const hits = (x, y) => (Math.min(x.r, y.r) - Math.max(x.l, y.l)) > 1 && (Math.min(x.b, y.b) - Math.max(x.t, y.t)) > 1;
    const labels = [];
    for (const el of qa('.floor-zone-label')) labels.push(['plaque:' + el.textContent.trim(), R(el)]);
    for (const el of qa('.floor-kiosk-title, .floor-kiosk-count')) labels.push(['kiosk:' + el.textContent.trim(), R(el)]);
    const chairs = { unique: [10.4, 21.4], uniqa: [15.1, 21.4] };
    for (const [k, [dx, dy, cy]] of Object.entries(${JSON.stringify(DESKS)})) chairs[k] = [dx, cy];
    const feetOf = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.86 }; };
    const seatedKeys = [];
    for (const [k, [cx, cy]] of Object.entries(chairs)) {
      const ch = q('[data-testid="floor-char-' + k + '"]');
      if (!ch) continue; // Uniqa absent: her ghost label rides the empty-chair element, checked below
      const f = feetOf(ch);
      const want = { x: sr.left + (cx / 100) * sr.width, y: sr.top + (cy / 75) * sr.height };
      if (Math.hypot(f.x - want.x, f.y - want.y) > sr.width * 0.03) continue;
      seatedKeys.push(k);
      const nm = ch.querySelector('.floor-char-name');
      if (nm) labels.push(['name:' + k, R(nm)]);
      const rl = ch.querySelector('.floor-char-role');
      if (rl) labels.push(['role:' + k, R(rl)]);
    }
    // Uniqa's empty chair carries NO text by design (cleanup
    // round): her name stands in the org strip, and a label at
    // her seat has no collision-free slot in the monitors' band.
    const ghost = q('[data-testid="office-uniqa-seat"] .floor-char-name');
    if (ghost) labels.push(['name:uniqa-ghost', R(ghost)]);
    const propSel = '.floor-pc, .floor-deskbar, .floor-hosts-mic, .floor-quran-rug, .floor-media-screen, .floor-racks, .floor-sofa, .floor-lamp, .floor-coffee-set, .floor-meeting-table, .floor-zone-plant';
    const props = [];
    for (const el of qa(propSel)) {
      const id = (el.getAttribute('data-testid') || el.className.split(' ')[0]);
      props.push([id, R(el)]);
    }
    const collisions = [];
    for (const [ln, lr] of labels) for (const [pn, pr] of props) if (hits(lr, pr)) collisions.push(ln + ' × ' + pn);
    const mosque = q('[data-testid="floor-mosque"]');
    const mosqueInfo = mosque ? (() => { const r = mosque.getBoundingClientRect(); return { w: r.width, h: r.height }; })() : null;
    const coffeeSet = q('[data-testid="floor-coffee-set"]');
    const coffeeInfo = coffeeSet ? {
      table: !!coffeeSet.querySelector('.fcs-table'),
      cup: !!coffeeSet.querySelector('.fcs-cup'),
      chairs: coffeeSet.querySelectorAll('.fcs-chair').length,
    } : null;
    return { collisions, seatedKeys, mosqueInfo, coffeeInfo, propCount: props.length, labelCount: labels.length };
  })()`);
  check('DECLUTTER AUDIT: ZERO overlap between any name/plaque text and any prop (mic, mosque, screens, PCs, sofa, tables, coffee set)',
    audit.collisions.length === 0, audit.collisions.length ? audit.collisions.join(' ; ') : `${audit.labelCount} texts × ${audit.propCount} props clean; seated=${audit.seatedKeys.join(',')}`);
  check('MOSQUE: 🕌 present in یوسف zone, SIZED to be plainly visible (not a speck)',
    !!audit.mosqueInfo && audit.mosqueInfo.w >= 24 && audit.mosqueInfo.h >= 18,
    JSON.stringify(audit.mosqueInfo));
  check('COFFEE CORNER: café set rebuilt — round table + cup + 2 chairs around it (and zero plaque overlap per the audit)',
    !!audit.coffeeInfo && audit.coffeeInfo.table && audit.coffeeInfo.cup && audit.coffeeInfo.chairs === 2,
    JSON.stringify(audit.coffeeInfo));

  // ================= K) FIX ROUND 2 — EXTENDED AUDIT =================
  // Section H checked text × props and MISSED the user's catch:
  // عمر's and احمد's plaques stood at the back of their zones,
  // half-hidden behind their own BODIES (a body is not in the
  // prop selector). This audit therefore tests every floor text
  // against (a) every OTHER text, (b) every character's HOME
  // body — his body rect translated so his feet land exactly on
  // his chair point, so a character caught mid-stroll cannot
  // hide a collision — and (c) full containment of every plaque
  // inside its own zone. It also DOM-asserts the user's two
  // furnishing orders: EIGHT meeting chairs in two facing rows
  // of four (each chair directly opposite its pair, hugging the
  // table) and TWO لانج sofas facing each other (FIX ROUND 3:
  // both DRAWN upright in CSS — no scaleY(-1) flip anywhere —
  // far backrest above its seat, near backrest below its seat,
  // same column, both inside the plaza, lamp upright between).
  const audit2 = await ev(`(() => {
    const q = (s) => document.querySelector('${SCOPE}' + s);
    const qa = (s) => [...document.querySelectorAll('${SCOPE}' + s)];
    const scene = q('.floor-scene');
    const sr = scene.getBoundingClientRect();
    const R = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
    const hits = (x, y) => (Math.min(x.r, y.r) - Math.max(x.l, y.l)) > 1 && (Math.min(x.b, y.b) - Math.max(x.t, y.t)) > 1;
    const texts = [];
    for (const el of qa('.floor-zone-label')) texts.push(['plaque:' + el.textContent.trim(), R(el)]);
    for (const el of qa('.floor-kiosk-title, .floor-kiosk-count')) texts.push(['kiosk:' + el.textContent.trim(), R(el)]);
    const chairs = { unique: [10.4, 21.4] };
    for (const [k, [dx, dy, cy]] of Object.entries(${JSON.stringify(DESKS)})) chairs[k] = [dx, cy];
    const feetOf = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.86 }; };
    const homePt = (cx, cy) => ({ x: sr.left + (cx / 100) * sr.width, y: sr.top + (cy / 75) * sr.height });
    const homeBodies = [];
    for (const [k, [cx, cy]] of Object.entries(chairs)) {
      const ch = q('[data-testid="floor-char-' + k + '"]');
      if (!ch) continue;
      const f = feetOf(ch);
      const want = homePt(cx, cy);
      if (Math.hypot(f.x - want.x, f.y - want.y) <= sr.width * 0.03) {
        const nm = ch.querySelector('.floor-char-name');
        if (nm) texts.push(['name:' + k, R(nm)]);
        const rl = ch.querySelector('.floor-char-role');
        if (rl) texts.push(['role:' + k, R(rl)]);
      }
      // HOME body: the live body rect shifted so the feet land
      // on the chair point — where the body stands whenever the
      // character is home, strolling or not.
      const bd = ch.querySelector('.floor-char-body');
      if (bd) {
        const r = bd.getBoundingClientRect();
        const dx = want.x - f.x, dy = want.y - f.y;
        homeBodies.push(['body:' + k, { l: r.left + dx, t: r.top + dy, r: r.right + dx, b: r.bottom + dy }]);
      }
    }
    const collisions2 = [];
    for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
      if (hits(texts[i][1], texts[j][1])) collisions2.push(texts[i][0] + ' × ' + texts[j][0]);
    }
    for (const [tn, tr] of texts) for (const [bn, br] of homeBodies) {
      if (hits(tr, br)) collisions2.push(tn + ' × ' + bn);
    }
    // Containment, scoped honestly: VERTICAL containment for
    // every plaque (its front/back placement — the axis this
    // round's fix is about) and FULL containment for the two
    // FIXED zones. One known, pre-existing exception to full
    // horizontal containment: «خبر و موسم»'s label is wider
    // than its narrow zone at panel scale (min-font clamp) and
    // spills ~1 unit over each side border onto EMPTY neighbor
    // rug — it covers no text and nothing covers it (proven by
    // the text × text / body / prop audits above); the user's
    // approved look, unchanged by this round.
    const containment = [];
    for (const z of qa('.floor-zone')) {
      const lab = z.querySelector('.floor-zone-label');
      if (!lab) continue;
      const zr = R(z), lr = R(lab);
      const vOk = lr.t >= zr.t - 1 && lr.b <= zr.b + 1;
      const fullOk = vOk && lr.l >= zr.l - 1 && lr.r <= zr.r + 1;
      const fixed = z.className.includes('floor-zone-hisab-kitab') || z.className.includes('floor-zone-builder');
      containment.push([lab.textContent.trim(), vOk, fullOk, fixed]);
    }
    // MEETING: 8 chairs, two facing rows of 4, pairs opposite.
    const mzone = q('[data-testid="floor-zone-meeting"]');
    const surf = mzone ? mzone.querySelector('.fmt-surface') : null;
    let meeting = null;
    if (mzone && surf) {
      const srf = R(surf);
      const scx = (srf.l + srf.r) / 2, scy = (srf.t + srf.b) / 2;
      const chs = [...mzone.querySelectorAll('.fmt-chair')].map((c) => { const r = R(c); return { cx: (r.l + r.r) / 2, cy: (r.t + r.b) / 2, t: r.t, b: r.b }; });
      const topRow = chs.filter((c) => c.cy < scy);
      const botRow = chs.filter((c) => c.cy >= scy);
      const pairsOk = topRow.length === 4 && botRow.length === 4
        && topRow.every((t) => botRow.some((b) => Math.abs(b.cx - t.cx) <= 3));
      const hugOk = topRow.every((t) => t.b <= srf.t + 2) && botRow.every((b) => b.t >= srf.b - 2);
      meeting = { count: chs.length, topRow: topRow.length, botRow: botRow.length, pairsOk, hugOk };
    }
    // LOUNGE (FIX ROUND 3): exactly 2 sofas, both DRAWN upright —
    // NO flip transform on either (the old scaleY(-1) emoji flip
    // hung its lamp upside down; the user caught it on the live
    // floor) — facing proven by construction: the far sofa's
    // backrest stands ABOVE its seat, the near sofa's backrest
    // BELOW its seat; same column; both inside the plaza. Plus
    // the floor LAMP: present, inside the plaza, shade ABOVE its
    // pole (upright, as a lamp stands).
    const pzone = q('[data-testid="floor-zone-plaza"]');
    let sofas = null;
    if (pzone) {
      const zr = R(pzone);
      const list = [...pzone.querySelectorAll('.floor-sofa')].map((s) => {
        const r = R(s);
        const m = getComputedStyle(s).transform || '';
        const back = s.querySelector('.fsofa-back');
        const seat = s.querySelector('.fsofa-seat');
        const br = back ? R(back) : null;
        const tr = seat ? R(seat) : null;
        return {
          r, cx: (r.l + r.r) / 2, cy: (r.t + r.b) / 2,
          flipped: m.indexOf('matrix(1, 0, 0, -1') === 0 || m.indexOf('matrix(-1') === 0,
          backAboveSeat: !!(br && tr && br.b <= tr.t + 2),
          backBelowSeat: !!(br && tr && br.t >= tr.b - 2),
        };
      });
      const far = list.find((s) => s.backAboveSeat);
      const near = list.find((s) => s.backBelowSeat);
      const lampEl = pzone.querySelector('.floor-lamp');
      let lamp = null;
      if (lampEl) {
        const lr = R(lampEl);
        const shade = lampEl.querySelector('.flamp-shade');
        const pole = lampEl.querySelector('.flamp-pole');
        const shr = shade ? R(shade) : null;
        const por = pole ? R(pole) : null;
        lamp = {
          inside: lr.l >= zr.l - 1 && lr.r <= zr.r + 1 && lr.t >= zr.t - 1 && lr.b <= zr.b + 1,
          upright: !!(shr && por && shr.b <= por.t + 2),
        };
      }
      sofas = {
        count: list.length,
        noneFlipped: list.length === 2 && list.every((s) => !s.flipped),
        facing: list.length === 2 && !!far && !!near && far !== near && far.cy < near.cy,
        sameColumn: list.length === 2 && Math.abs(list[0].cx - list[1].cx) <= 4,
        inside: list.every((s) => s.r.l >= zr.l - 1 && s.r.r <= zr.r + 1 && s.r.t >= zr.t - 1 && s.r.b <= zr.b + 1),
        lamp,
      };
    }
    return { collisions2, containment, meeting, sofas, textCount: texts.length, bodyCount: homeBodies.length };
  })()`);
  check('FIX2 AUDIT: ZERO overlap between any floor text and any other text or any character HOME body (the bodies the old audit never tested)',
    audit2.collisions2.length === 0, audit2.collisions2.length ? audit2.collisions2.join(' ; ') : `${audit2.textCount} texts × ${audit2.bodyCount} home bodies clean`);
  check('FIX2: every plaque vertically contained in its own zone (front placement, no front/back crossing); the two FIXED plaques (حساب کتاب / بلڈر) fully contained',
    audit2.containment.every(([, vOk]) => vOk) && audit2.containment.filter(([, , , fixed]) => fixed).every(([, , fullOk]) => fullOk),
    audit2.containment.map(([t, vOk, fullOk, fixed]) => `${t}:v=${vOk},full=${fullOk}${fixed ? ',FIXED' : ''}`).join(' | '));
  check('MEETING ROOM: EIGHT chairs in two FACING rows of 4 (each chair opposite its pair, hugging the table)',
    !!audit2.meeting && audit2.meeting.count === 8 && audit2.meeting.pairsOk && audit2.meeting.hugOk,
    JSON.stringify(audit2.meeting));
  check('LOUNGE (FIX3): exactly TWO sofas FACING each other, BOTH drawn upright (no flip anywhere), one column, inside the plaza — plus the floor lamp standing upright (shade above pole) inside the plaza',
    !!audit2.sofas && audit2.sofas.count === 2 && audit2.sofas.noneFlipped && audit2.sofas.facing && audit2.sofas.sameColumn && audit2.sofas.inside
      && !!audit2.sofas.lamp && audit2.sofas.lamp.inside && audit2.sofas.lamp.upright,
    JSON.stringify(audit2.sofas));

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

  // L) SEATED-MAJORITY sampler (FIX ROUND 3, user 2026-10-24:
  // «یوسف دیکھو کہاں پہ ہے… اور اس کا کمپیوٹر دیکھو کہاں پہ
  // ہے»): the old idle stroll parked agents at random points far
  // from their desks. An idle agent must now spend the clear
  // majority of a ~30s window SEATED at his own chair (his
  // computer in front of him) — a short out-and-back amble is
  // the only absence allowed. Feet = the char element's bottom
  // centre; at his chair that sits ~1.9 units below the chair
  // point (measured), so seated = within 2.2 units of
  // (chair.x, chair.y + 1.9) on both axes.
  const seatSamples = {};
  for (let i = 0; i < 20; i++) {
    const snap = await ev(`(() => {
      const scene = document.querySelector('${SCOPE}.floor-scene');
      if (!scene) return null;
      const sr = scene.getBoundingClientRect();
      const out = {};
      for (const k of ${JSON.stringify(AGENTS.map(([k]) => k))}) {
        const el = document.querySelector('${SCOPE}[data-testid="floor-char-' + k + '"]');
        if (!el) continue;
        const r = el.getBoundingClientRect();
        out[k] = {
          fx: ((r.left + r.width / 2 - sr.left) / sr.width) * 100,
          fy: ((r.bottom - sr.top) / sr.height) * 75,
        };
      }
      return out;
    })()`);
    if (snap) {
      for (const [k, chair] of Object.entries(DESKS)) {
        const s = snap[k];
        if (!s) continue;
        seatSamples[k] = seatSamples[k] || { seated: 0, total: 0 };
        seatSamples[k].total++;
        if (Math.abs(s.fx - chair[0]) <= 2.2 && Math.abs(s.fy - (chair[2] + 1.9)) <= 2.2) seatSamples[k].seated++;
      }
    }
    await sleep(1500);
  }
  const seatReport = Object.entries(seatSamples).map(([k, v]) => `${k}:${v.seated}/${v.total}`).join(' ');
  check('FIX3 SEATED MAJORITY: every idle agent sits at his OWN desk (computer in front) for the majority (≥55%) of a 30s window — ambles return home (the old stroll scored ~0–20%)',
    Object.keys(seatSamples).length === 7 && Object.values(seatSamples).every((v) => v.total >= 14 && v.seated / v.total >= 0.55),
    seatReport);
  await shot('01-desktop-idle.png');
  await shotEl('07-floor-closeup-idle.png', '.office-panel-main .floor-wrap');
  await shotEl('10-coffee-corner.png', '.office-panel-main .floor-zone-coffee');
  // FIX ROUND 2 zone crops — the four spots the user ordered fixed, for eyeball review.
  await shotEl('11-umar-zone.png', '.office-panel-main .floor-zone-hisab-kitab');
  await shotEl('12-ahmad-zone.png', '.office-panel-main .floor-zone-builder');
  await shotEl('13-meeting-room.png', '.office-panel-main .floor-zone-meeting');
  await shotEl('14-lounge.png', '.office-panel-main .floor-zone-plaza');

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
    const arm = hasan ? hasan.querySelector('.person-arm-l') : null;
    const hasanPc = q('[data-testid="floor-pc-khabar-mausam"]');
    const umarPc = q('[data-testid="floor-pc-hisab-kitab"]');
    return {
      hasanPcOn: hasanPc ? hasanPc.getAttribute('data-on') : null,
      umarPcOn: umarPc ? umarPc.getAttribute('data-on') : null,
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
  let pcsOnSeen = false; let shotWorkingClose = false;
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
      if (p.hasanPcOn === 'true' && p.umarPcOn === 'true') {
        pcsOnSeen = true;
        if (!shotWorkingClose) {
          shotWorkingClose = true;
          pendingShots.push(shotEl('02b-working-computer.png', '.office-panel-main .floor-zone-khabar-mausam'));
        }
      }
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
  check('working agent REALLY typing AT his computer (computed arm animation = person-type)', armAnim === 'person-type', String(armAnim));
  check('working agents\' desk computers switched ON/bright (data-on=true)', pcsOnSeen);
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
    const os = s.querySelector('.floor-scene');
    return {
      scene: !!os,
      chars: s.querySelectorAll('.floor-char').length,
      persons: s.querySelectorAll('.floor-person-svg').length,
      pcs: s.querySelectorAll('.floor-pc').length,
      robots: s.querySelectorAll('.cabin-robot, .cabin-robot-svg').length,
      zones: s.querySelectorAll('.floor-zone').length,
      sign: !!s.querySelector('.office-sign-brand'),
      emptySeat: !!s.querySelector('[data-testid="office-uniqa-seat"]'),
      orgStrip: !!s.querySelector('.office-orgstrip'),
      orgInScene: os ? (os.textContent.includes('باس: یونیک') || os.textContent.includes('مینیجر: یونیکا')) : null,
    };
  })()`);
  check('overlay: the SAME big floor — 8 PEOPLE (person SVGs), 9 desk computers, ZERO robots, 11 zones, sign, Uniqa chair empty',
    !!d && d.scene && d.chars === 8 && d.persons === 8 && d.pcs === 9 && d.robots === 0 && d.zones === 11 && d.sign && d.emptySeat, JSON.stringify(d));
  check('overlay: org strip rides above the big floor too, scene itself free of org text',
    !!d && d.orgStrip === true && d.orgInScene === false, JSON.stringify(d && { orgStrip: d.orgStrip, orgInScene: d.orgInScene }));
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
    const stripStatus = q('[data-testid="org-hosts-status"]');
    const hosts = q('[data-testid="office-hosts-cabin"]');
    const pc = q('[data-testid="floor-pc-uniqa"]');
    const svg = u ? u.querySelector('.floor-person-svg') : null;
    return {
      char: !!u,
      person: !!svg,
      eyes: svg ? !!svg.querySelector('.person-eyes') : false,
      girlLook: svg ? svg.innerHTML.includes('#7a5b16') && svg.innerHTML.includes('#fde047') : false,
      name: u ? u.querySelector('.floor-char-name')?.textContent.trim() || null : null,
      role: u ? u.querySelector('.floor-char-role')?.textContent.trim() || null : null,
      goldTint: u ? (u.getAttribute('style') || '').includes('fde047') : false,
      pcOn: pc ? pc.getAttribute('data-on') : null,
      duo: hosts ? hosts.className.includes('floor-zone-duo') : false,
      emptySeat: !!q('[data-testid="office-uniqa-seat"]'),
      stripStatus: stripStatus ? stripStatus.textContent.replace(/\\s+/g, ' ').trim() : null,
    };
  })()`);
  check('Uniqa summoned: golden GIRL (person SVG, gold outfit) SEATED at the hosts desk, her computer ON, name + مینیجر label, hosts zone golden',
    !!e && e.char && e.person && e.eyes && e.girlLook && e.name === 'یونیکا' && e.role === 'مینیجر' && e.goldTint && e.pcOn === 'true' && e.duo && !e.emptySeat,
    JSON.stringify(e));
  check('org strip presence line flips LIVE with the duo: «دونوں حاضر ہیں» while Uniqa is summoned',
    !!e && !!e.stripStatus && e.stripStatus.includes('دونوں حاضر ہیں'), String(e && e.stripStatus));
  await shotEl('08-hosts-duo.png', '.office-panel-main .floor-wrap');
  await ev(`localStorage.removeItem('unique-ai-persona')`);
  await page.send('Page.navigate', { url: `${APP}/` });
  let soloBack = false;
  for (let i = 0; i < 30 && !soloBack; i++) {
    await sleep(700);
    soloBack = await ev(`!!document.querySelector('${SCOPE}[data-testid="office-uniqa-seat"]') && !document.querySelector('${SCOPE}[data-testid="floor-char-uniqa"]')`).catch(() => false);
  }
  check('persona back to default: Uniqa gone, her chair empty again', soloBack === true);
  await shotEl('09-hosts-unique-alone.png', '.office-panel-main .floor-wrap');

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
