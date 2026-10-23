/**
 * test-floor-layout.mjs — pure-geometry checks for the living floor
 * (client/src/lib/floor-layout.ts, Round 4): zones don't overlap,
 * every staffed zone has desk/chair/front, routes keep their
 * horizontal legs on the aisle bands, and path lengths are sane.
 * Run: node scripts/test-floor-layout.mjs   (from the repo root;
 * Node ≥22 imports the .ts module natively, like the other suites.)
 */
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mod = await import(pathToFileURL(join(root, 'client/src/lib/floor-layout.ts')).href);
const { FLOOR_ZONES, AISLE_YS, HOST_SEATS, BOARD_FRONT, WALK_SPEEDS, zoneByKey, routePath, pathLength, strollPoint } = mod;

let failed = 0;
const check = (label, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failed++;
};

const STAFFED = ['hosts', 'talash', 'khabar-mausam', 'likhai', 'media', 'quran-namaz', 'hisab-kitab', 'builder'];
check('all staffed zones exist with desk + front (+ chair except hosts)',
  STAFFED.every((k) => {
    const z = zoneByKey(k);
    return z && z.desk && z.front && (k === 'hosts' || z.chair);
  }));
check('hosts seats defined for unique + uniqa inside the hosts zone',
  HOST_SEATS.unique.x > 1 && HOST_SEATS.uniqa.x < 24.5 && HOST_SEATS.unique.y > 12 && HOST_SEATS.uniqa.y < 31);

let overlap = null;
for (let i = 0; i < FLOOR_ZONES.length; i++) {
  for (let j = i + 1; j < FLOOR_ZONES.length; j++) {
    const a = FLOOR_ZONES[i].rect, b = FLOOR_ZONES[j].rect;
    if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
      overlap = `${FLOOR_ZONES[i].key} × ${FLOOR_ZONES[j].key}`;
    }
  }
}
check('zone rects never overlap', !overlap, overlap || '');

check('aisle Ys sit in the gaps between zone rows',
  AISLE_YS[0] > 31 && AISLE_YS[0] < 36 && AISLE_YS[1] > 54.5 && AISLE_YS[1] < 59,
  AISLE_YS.join(','));

function horizontalLegsOnAisle(from, to) {
  const pts = routePath(from, to);
  let cur = from;
  for (const p of pts) {
    if (Math.abs(p.x - cur.x) > 0.6 && Math.abs(p.y - cur.y) > 0.6) return `diagonal leg ${JSON.stringify(cur)}→${JSON.stringify(p)}`;
    if (Math.abs(p.x - cur.x) > 0.6 && !AISLE_YS.some((a) => Math.abs(cur.y - a) < 0.01)) {
      return `horizontal leg off-aisle at y=${cur.y}`;
    }
    cur = p;
  }
  return null;
}
const spots = [
  zoneByKey('hosts').front,
  zoneByKey('khabar-mausam').chair,
  zoneByKey('hisab-kitab').front,
  BOARD_FRONT,
  zoneByKey('builder').chair,
  zoneByKey('quran-namaz').front,
  zoneByKey('talash').front,
  HOST_SEATS.unique,
];
let routeErr = null;
for (const a of spots) for (const b of spots) {
  const err = horizontalLegsOnAisle(a, b);
  if (err) routeErr = err;
}
check('every pairwise route keeps horizontal legs on an aisle', !routeErr, routeErr || '');

const hostToHasan = pathLength(zoneByKey('hosts').front, routePath(zoneByKey('hosts').front, zoneByKey('khabar-mausam').front));
check('hosts → حسن route length is sane (30–80 units)', hostToHasan > 30 && hostToHasan < 80, hostToHasan.toFixed(1));
check('carry speed crosses that route in ~1.5–3.5s',
  hostToHasan / WALK_SPEEDS.carry > 1.5 && hostToHasan / WALK_SPEEDS.carry < 3.5,
  `${(hostToHasan / WALK_SPEEDS.carry).toFixed(2)}s`);

const sp = strollPoint(zoneByKey('talash'), () => 0.5);
const tz = zoneByKey('talash');
check('stroll point lands inside the zone stroll rect',
  !!sp && sp.x >= tz.stroll.x && sp.x <= tz.stroll.x + tz.stroll.w && sp.y >= tz.stroll.y && sp.y <= tz.stroll.y + tz.stroll.h);
check('same-point route is a single waypoint', routePath({ x: 5, y: 5 }, { x: 5.2, y: 5.2 }).length === 1);

console.log(failed === 0 ? '\n✅ FLOOR-LAYOUT: ALL PASS' : `\n❌ FLOOR-LAYOUT: ${failed} FAILURES`);
process.exit(failed ? 1 : 0);
