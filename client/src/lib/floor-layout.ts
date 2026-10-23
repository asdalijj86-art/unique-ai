/**
 * floor-layout — the geometry of the living office FLOOR (Round 4,
 * built to the user's reference VIDEO, 2026-10-23: «ویسا کیبن اور اس
 * کے اندر ویسے ہی وہ چلتے ہوئے — کام کرتے ہوئے نظر آئیں، ایک دوسرے
 * کے پاس آتے جاتے نظر آئیں کام کے لیے»).
 *
 * The video's office is ONE top-down illustrated floor: a window
 * wall at the back, labeled zones around open aisles, and little
 * characters who WALK the floor — sitting at their desks to work,
 * strolling inside their own zone when free, and physically
 * carrying things to each other's desks. This module is the pure
 * map of OUR version of that floor (100 × 75 units, origin top-left,
 * y grows downward like screen coordinates):
 *
 *   - every zone has a rect, a floor plaque label, and (for staffed
 *     zones) a desk with a chair point (where the character sits)
 *     and a front point (the doorstep a visitor stops at);
 *   - two open AISLES cross the floor between the zone rows —
 *     characters always travel desk → aisle → aisle → desk, so a
 *     walk never crosses another agent's desk;
 *   - the hosts' desk (یونیک باس + یونیکا مینیجر) is top-left like
 *     the video's FOUNDER/PM corner; احمد's build corner with the
 *     server racks is bottom-right like the video's server room;
 *     the plaza with the آج کا بورڈ kiosk sits in the middle.
 *
 * Pure and DOM-free (unit-tested by scripts/test-floor-layout.mjs);
 * the scene component (FloorScene) only executes what this map and
 * lib/office-handoff's flight plan decide.
 */

export interface FloorPoint { x: number; y: number }

export interface FloorZone {
  key: string;
  /** Floor plaque text (the video prints zone names on the floor). */
  label: string;
  rect: { x: number; y: number; w: number; h: number };
  /** Desk centre — where the desk prop (dual monitors) is drawn. */
  desk?: FloorPoint;
  /** Where the zone's character sits (feet point at the chair). */
  chair?: FloorPoint;
  /** Doorstep: a visiting character stops here, just outside the desk. */
  front?: FloorPoint;
  /** Open floor inside the zone where an idle character may stroll. */
  stroll?: { x: number; y: number; w: number; h: number };
}

export const FLOOR_W = 100;
export const FLOOR_H = 75;

/** The two open walking corridors between the zone rows. */
export const AISLE_YS = [33.8, 56.8];

/** Staffed + decorative zones, in paint order. Staffed zones are
 *  keyed by the agent key from lib/agent-team (plus 'hosts'). */
export const FLOOR_ZONES: FloorZone[] = [
  // ——— back row (under the window wall) ———
  { key: 'hosts', label: 'میزبان', rect: { x: 1, y: 12, w: 23.5, h: 19 },
    desk: { x: 12.75, y: 20 }, front: { x: 12.75, y: 29.3 },
    stroll: { x: 3, y: 24.5, w: 19.5, h: 4.5 } },
  { key: 'talash', label: 'تلاش', rect: { x: 26, y: 12, w: 14.5, h: 18 },
    desk: { x: 33.25, y: 19.5 }, chair: { x: 33.25, y: 20.7 }, front: { x: 33.25, y: 28.2 },
    stroll: { x: 27.5, y: 23.5, w: 11.5, h: 4.8 } },
  { key: 'khabar-mausam', label: 'خبر و موسم', rect: { x: 42, y: 12, w: 14.5, h: 18 },
    desk: { x: 49.25, y: 19.5 }, chair: { x: 49.25, y: 20.7 }, front: { x: 49.25, y: 28.2 },
    stroll: { x: 43.5, y: 23.5, w: 11.5, h: 4.8 } },
  { key: 'likhai', label: 'لکھائی', rect: { x: 58, y: 12, w: 14.5, h: 18 },
    desk: { x: 65.25, y: 19.5 }, chair: { x: 65.25, y: 20.7 }, front: { x: 65.25, y: 28.2 },
    stroll: { x: 59.5, y: 23.5, w: 11.5, h: 4.8 } },
  { key: 'media', label: 'میڈیا', rect: { x: 74, y: 12, w: 25, h: 21 },
    desk: { x: 86.5, y: 21 }, chair: { x: 86.5, y: 22.2 }, front: { x: 86.5, y: 30.3 },
    stroll: { x: 76, y: 25.5, w: 21, h: 5.5 } },
  // ——— middle row ———
  { key: 'meeting', label: 'میٹنگ', rect: { x: 1, y: 37, w: 23.5, h: 17 } },
  { key: 'plaza', label: 'لانج', rect: { x: 27, y: 36, w: 34, h: 18 } },
  { key: 'quran-namaz', label: 'قرآن و نماز', rect: { x: 74, y: 37, w: 25, h: 17 },
    desk: { x: 86.5, y: 44 }, chair: { x: 86.5, y: 45.2 }, front: { x: 86.5, y: 51.3 },
    stroll: { x: 76, y: 47.5, w: 21, h: 4.5 } },
  // ——— front row ———
  { key: 'coffee', label: 'کافی', rect: { x: 1, y: 59, w: 19, h: 14.5 } },
  { key: 'hisab-kitab', label: 'حساب کتاب', rect: { x: 24, y: 59, w: 20, h: 14.5 },
    desk: { x: 34, y: 65.5 }, chair: { x: 34, y: 66.7 }, front: { x: 34, y: 60.6 },
    stroll: { x: 26, y: 61, w: 16, h: 3.6 } },
  { key: 'builder', label: 'بلڈر', rect: { x: 62, y: 58, w: 37, h: 16 },
    desk: { x: 74, y: 65 }, chair: { x: 74, y: 66.2 }, front: { x: 74, y: 60.1 },
    stroll: { x: 64, y: 60.8, w: 15, h: 3.8 } },
];

export function zoneByKey(key: string): FloorZone | undefined {
  return FLOOR_ZONES.find((z) => z.key === key);
}

/** The hosts' desk seats: یونیک (boss) and یونیکا (manager) sit side
 *  by side at the one desk — two chair points, his and hers. */
export const HOST_SEATS: Record<'unique' | 'uniqa', FloorPoint> = {
  unique: { x: 10.4, y: 21.4 },
  uniqa: { x: 15.1, y: 21.4 },
};

/** The آج کا بورڈ kiosk stands in the plaza; a delivering character
 *  stops at its front point and the file is pinned there. */
export const BOARD_KIOSK = { x: 55.5, y: 40.5 };
export const BOARD_FRONT: FloorPoint = { x: 55.5, y: 45.8 };

/** Walking speeds, floor-units per second: a stroll ambles, a
 *  character carrying a file has somewhere to be. */
export const WALK_SPEEDS = { stroll: 8, walk: 20, carry: 26 };

function pickAisle(fromY: number, toY: number): number {
  let best = AISLE_YS[0];
  let bestCost = Infinity;
  for (const a of AISLE_YS) {
    const cost = Math.abs(fromY - a) + Math.abs(toY - a);
    if (cost < bestCost) { bestCost = cost; best = a; }
  }
  return best;
}

const near = (a: FloorPoint, b: FloorPoint) => Math.abs(a.x - b.x) < 0.6 && Math.abs(a.y - b.y) < 0.6;

/**
 * Route across the open floor: leave the start point vertically to
 * the cheaper aisle, travel along it, then turn in to the target.
 * Waypoints never cross a desk: desks live inside zone rects, the
 * vertical legs run at the walker's / target's own desk column (the
 * open strip in front of that desk), and the horizontal leg runs in
 * the aisle band, which no zone occupies.
 */
export function routePath(from: FloorPoint, to: FloorPoint): FloorPoint[] {
  if (near(from, to)) return [{ ...to }];
  const aisle = pickAisle(from.y, to.y);
  const pts: FloorPoint[] = [];
  const onAisle = Math.abs(from.y - aisle) < 0.6;
  if (!onAisle) pts.push({ x: from.x, y: aisle });
  if (Math.abs(to.x - from.x) > 0.6 || onAisle) pts.push({ x: to.x, y: aisle });
  pts.push({ ...to });
  return pts.filter((p, i) => i === 0 || !near(p, pts[i - 1]));
}

/** Total length of a waypoint path (floor units). */
export function pathLength(from: FloorPoint, pts: FloorPoint[]): number {
  let total = 0;
  let cur = from;
  for (const p of pts) {
    total += Math.hypot(p.x - cur.x, p.y - cur.y);
    cur = p;
  }
  return total;
}

/** A random open point inside a stroll rect (deterministic seed in,
 *  point out — the scene passes Math.random). */
export function strollPoint(zone: FloorZone, rand: () => number): FloorPoint | null {
  if (!zone.stroll) return null;
  const s = zone.stroll;
  return { x: s.x + rand() * s.w, y: s.y + rand() * s.h };
}
