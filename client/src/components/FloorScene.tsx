/**
 * FloorScene — the living office FLOOR (Round 4, built to the
 * user's reference VIDEO, 2026-10-23: «ویسا کیبن اور اس کے اندر
 * ویسے ہی وہ چلتے ہوئے — کام کرتے ہوئے نظر آئیں، ایک دوسرے کے پاس
 * آتے جاتے نظر آئیں کام کے لیے»; the round-3 cabin grid was
 * rejected: «ایسا کیبن نہیں تھا بنانا»).
 *
 * What the video shows, rebuilt with OUR cast and OUR real state:
 * one top-down illustrated floor (wood, window wall with a city
 * view, plants) divided into LABELED zones — hosts' desk top-left
 * like the video's FOUNDER corner, desks for the seven agents,
 * حمزہ's media corner, احمد's build corner with server racks,
 * یوسف's green Quran corner, a meeting table, a coffee corner and
 * a central plaza where آج کا بورڈ hangs on a kiosk. The CARTOON
 * HUMAN characters (FloorPerson figures — user, 2026-10-23 23:43:
 * «یہ روبوٹ نہیں — کارٹون لگاؤ، انسان جیسے دکھائی دیں، خوبصورت
 * چہرے ہوں»; the robots are retired) LIVE on this floor: each has
 * a floating name label, sits at his desk WITH A COMPUTER RIGHT IN
 * FRONT of him (user, 23:41: «ان کے سامنے کمپیوٹر رکھو»), strolls
 * inside his own zone when free — and when real work moves, he
 * physically WALKS it across the floor.
 *
 * رنگ و وردی (user, 2026-10-24 00:03): the whole floor wears ONE
 * color family — Unique AI's blue/violet brand — zones, desks,
 * plaques and glows alike; and all seven agents wear the SAME
 * office uniform (FloorPerson), individual only in face/hair/name.
 * یونیک keeps his boss look; یونیکا keeps her gold distinction.
 *
 * Motion honesty (the standing rule, tightened for walking):
 *  - WORKING (real AgentTaskState / live build): the agent walks
 *    to his desk chair and types there, amber ring + «کام کر رہا
 *    ہے» label — the same real state the strip renders.
 *  - HANDOFF/DISPATCH/DELIVER: flights still come ONLY from
 *    lib/office-handoff's plan over real snapshot diffs — but now
 *    the SENDER'S OWN character carries the 📄: out of his zone,
 *    along the open aisle, to the receiver's doorstep (receiver
 *    bounces), then walks back to his desk. No flight is ever
 *    invented; idle floors see no carrying at all.
 *  - IDLE: a character may amble inside HIS OWN zone (ambience,
 *    like the video's idle strolls) — it claims no status, carries
 *    nothing, and never leaves his zone.
 *  - Uniqa sits in the hosts' cabin ONLY while she is the present
 *    persona; otherwise her chair stands empty (presence honesty).
 *
 * Movement is CSS transitions on left/top between waypoints from
 * lib/floor-layout (desk → aisle → desk), one rAF-free timer chain
 * per character, transforms/opacity only besides that — a low-end
 * Chromebook stays smooth. Reduced motion: no strolls, walks
 * teleport with a fade.
 *
 * صفائی (CLEANUP ROUND, user 2026-10-24 00:34/00:41/00:42 — he
 * inspected the screenshots closely and taught: «یہ چیزیں تم خود
 * دیکھ لیا کرو»): (1) the org line no longer squats at the scene's
 * bottom edge hiding names — the hierarchy stands in a clear TOP
 * STRIP above the floor: باس on one side of the «Unique AI» sign,
 * مینیجر on the other, ٹیم + the hosts' presence line beneath,
 * each written separately and fully readable; (2) DECLUTTER LAW —
 * no prop may cover any name label or zone plaque, anywhere:
 * props live in clear corners of their zone or are gone (zone
 * plants removed, the hosts' mic sits on the desk clear of text,
 * یوسف's mosque moved to his zone's clear top-left corner —
 * bigger, visible, touching neither his name nor his plaque —
 * حمزہ's wall screen moved to his zone's left wall, the meeting
 * table shrunk off its plaque, and the coffee corner rebuilt as
 * a real little café set — table with chairs around it — with
 * the «کافی» plaque completely untouched).
 */
import { useEffect, useRef, useState } from 'react';
import { AGENT_DEFS, type AgentTaskState } from '@/lib/agent-team';
import { FloorPerson } from './FloorPerson';
import type { BoardEntry } from '@/lib/task-board';
import { planFlights, type Flight, type OfficeSnapshot } from '@/lib/office-handoff';
import {
  FLOOR_H, FLOOR_W, FLOOR_ZONES, HOST_SEATS, BOARD_FRONT, BOARD_KIOSK,
  WALK_SPEEDS, routePath, strollPoint, zoneByKey, type FloorPoint, type FloorZone,
} from '@/lib/floor-layout';
import type { Persona } from '@/lib/persona';

type CharKey = string; // 'unique' | 'uniqa' | agent key

/** Label/ring accent per character — all inside the ONE brand
 *  family (user, 2026-10-24: zones and cast take Unique's own
 *  blue/violet; یونیکا alone keeps gold, as his standing rule). */
const CHAR_NEON: Record<string, string> = { unique: '#38bdf8', uniqa: '#fde047' };
const neonFor = (key: string): string => CHAR_NEON[key] || '#a78bfa';
/** Every agent zone's rug/plaque/glow color: the one brand violet. */
const ZONE_NEON = '#a78bfa';

const pctX = (x: number) => `${(x / FLOOR_W) * 100}%`;
const pctY = (y: number) => `${(y / FLOOR_H) * 100}%`;

const sleep = (ms: number) => new Promise<void>((r) => { setTimeout(r, ms); });

interface WalkCtrl { token: number; timers: Map<ReturnType<typeof setTimeout>, () => void> }

export interface FloorSceneProps {
  tasks: AgentTaskState[] | null;
  persona: Persona;
  boardEntries: BoardEntry[];
  buildLive: { title: string; startedAt: number } | null;
  stateByKey: Map<string, AgentTaskState>;
  snapshot: OfficeSnapshot;
  snapshotSig: string;
  compact?: boolean;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
}

function homeOf(key: CharKey): FloorPoint {
  if (key === 'unique') return HOST_SEATS.unique;
  if (key === 'uniqa') return HOST_SEATS.uniqa;
  return zoneByKey(key)?.chair || { x: 50, y: 40 };
}

export function FloorScene(props: FloorSceneProps) {
  const { persona, boardEntries, stateByKey, snapshot, snapshotSig, compact = false, selectedKey, onSelect } = props;
  const wrapRef = useRef<HTMLDivElement>(null);

  const initialPositions = (): Record<CharKey, FloorPoint> => {
    const out: Record<CharKey, FloorPoint> = { unique: { ...HOST_SEATS.unique }, uniqa: { ...HOST_SEATS.uniqa } };
    for (const d of AGENT_DEFS) out[d.key] = { ...(zoneByKey(d.key)?.chair || { x: 50, y: 40 }) };
    return out;
  };
  const [positions, setPositions] = useState<Record<CharKey, FloorPoint>>(initialPositions);
  const [durations, setDurations] = useState<Record<CharKey, number>>({});
  const [walking, setWalking] = useState<ReadonlySet<CharKey>>(new Set());
  const [carrying, setCarrying] = useState<ReadonlySet<CharKey>>(new Set());
  const [receiving, setReceiving] = useState<ReadonlySet<CharKey>>(new Set());
  const [kioskGlow, setKioskGlow] = useState(false);

  const posRef = useRef(positions);
  const ctrlsRef = useRef(new Map<CharKey, WalkCtrl>());
  const busyRef = useRef(new Set<CharKey>()); // characters the flight/work engine owns right now
  const flightsActiveRef = useRef(0);
  const prevSnapshotRef = useRef<OfficeSnapshot | null>(null);
  const flightRunRef = useRef(0);
  const prevStatusRef = useRef(new Map<CharKey, string>());
  const reducedRef = useRef(false);

  useEffect(() => {
    reducedRef.current = typeof window !== 'undefined'
      && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const ctrlOf = (key: CharKey): WalkCtrl => {
    let c = ctrlsRef.current.get(key);
    if (!c) { c = { token: 0, timers: new Map() }; ctrlsRef.current.set(key, c); }
    return c;
  };

  const segSleep = (key: CharKey, ms: number) => new Promise<boolean>((resolve) => {
    const c = ctrlOf(key);
    const t = setTimeout(() => { c.timers.delete(t); resolve(true); }, ms);
    c.timers.set(t, () => resolve(false));
  });

  const cancelWalk = (key: CharKey) => {
    const c = ctrlOf(key);
    c.token++;
    for (const [t, res] of c.timers) { clearTimeout(t); res(); }
    c.timers.clear();
  };

  const setPos = (key: CharKey, p: FloorPoint, durMs: number) => {
    posRef.current = { ...posRef.current, [key]: p };
    setPositions(posRef.current);
    setDurations((d) => ({ ...d, [key]: durMs }));
  };

  const setFlag = (setter: React.Dispatch<React.SetStateAction<ReadonlySet<CharKey>>>, key: CharKey, on: boolean) => {
    setter((prev) => {
      if (prev.has(key) === on) return prev;
      const next = new Set(prev);
      if (on) next.add(key); else next.delete(key);
      return next;
    });
  };

  /** Walk one character along waypoints at `speed` units/sec.
   *  Supersedes any walk the character was on. Resolves true when
   *  the full path completed, false when superseded/cancelled. */
  const walkChar = async (key: CharKey, waypoints: FloorPoint[], speed: number): Promise<boolean> => {
    cancelWalk(key);
    const token = ctrlOf(key).token;
    setFlag(setWalking, key, true);
    try {
      for (const wp of waypoints) {
        if (ctrlOf(key).token !== token) return false;
        const cur = posRef.current[key];
        const dist = Math.hypot(wp.x - cur.x, wp.y - cur.y);
        if (dist < 0.4) { setPos(key, wp, 0); continue; }
        const dur = reducedRef.current ? 0 : Math.max(140, (dist / speed) * 1000);
        setPos(key, wp, dur);
        if (dur > 0) {
          const ok = await segSleep(key, dur);
          if (!ok || ctrlOf(key).token !== token) return false;
        }
      }
      return true;
    } finally {
      if (ctrlOf(key).token === token) setFlag(setWalking, key, false);
    }
  };

  const bounceChar = (key: CharKey) => {
    setFlag(setReceiving, key, true);
    setTimeout(() => setFlag(setReceiving, key, false), 700);
  };

  // ---------- flights: the sender's own character carries the 📄 ----------
  const carryFlight = async (flight: Flight): Promise<void> => {
    const isDeliver = flight.kind === 'deliver';
    const walker: CharKey = flight.from === 'hub' ? 'unique' : String(flight.from);
    const dest: FloorPoint = isDeliver
      ? BOARD_FRONT
      : (zoneByKey(String(flight.to))?.front || BOARD_FRONT);
    const receiver: CharKey | null = isDeliver ? null : String(flight.to);
    busyRef.current.add(walker);
    flightsActiveRef.current++;
    try {
      setFlag(setCarrying, walker, true);
      const arrived = await walkChar(walker, routePath(posRef.current[walker], dest), WALK_SPEEDS.carry);
      if (arrived) {
        if (receiver) bounceChar(receiver);
        if (isDeliver) { setKioskGlow(true); setTimeout(() => setKioskGlow(false), 800); }
        await sleep(reducedRef.current ? 90 : 430);
      }
      setFlag(setCarrying, walker, false);
      await walkChar(walker, routePath(posRef.current[walker], homeOf(walker)), WALK_SPEEDS.carry);
    } finally {
      setFlag(setCarrying, walker, false);
      busyRef.current.delete(walker);
      flightsActiveRef.current = Math.max(0, flightsActiveRef.current - 1);
    }
  };

  useEffect(() => {
    const prev = prevSnapshotRef.current;
    prevSnapshotRef.current = snapshot;
    if (!prev) return; // first sight: never perform past activity
    const flights = planFlights(prev, snapshot);
    if (!flights.length) return;
    const run = ++flightRunRef.current;
    void (async () => {
      for (const flight of flights) {
        if (flightRunRef.current !== run) return;
        await carryFlight(flight);
      }
    })();
    // snapshotSig fully captures the flight-relevant content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshotSig]);

  // ---------- status transitions: walk to the desk when work starts ----------
  const statusSig = AGENT_DEFS.map((d) => `${d.key}:${stateByKey.get(d.key)?.status || 'idle'}`).join('|');
  useEffect(() => {
    const prev = prevStatusRef.current;
    for (const d of AGENT_DEFS) {
      const now = stateByKey.get(d.key)?.status || 'idle';
      const was = prev.get(d.key) || 'idle';
      prev.set(d.key, now);
      if (now === 'working' && was !== 'working' && !busyRef.current.has(d.key)) {
        const chair = zoneByKey(d.key)?.chair;
        if (chair) {
          busyRef.current.add(d.key);
          void walkChar(d.key, routePath(posRef.current[d.key], chair), WALK_SPEEDS.walk)
            .finally(() => busyRef.current.delete(d.key));
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusSig]);

  // ---------- idle strolls: ambience inside the character's OWN zone ----------
  useEffect(() => {
    if (reducedRef.current) return;
    const iv = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (flightsActiveRef.current > 0) return;
      for (const d of AGENT_DEFS) {
        const status = stateByKey.get(d.key)?.status || 'idle';
        if (status === 'working' || status === 'failed') continue;
        if (busyRef.current.has(d.key)) continue;
        if (Math.random() > 0.16) continue;
        const zone = zoneByKey(d.key);
        if (!zone) continue;
        const target = strollPoint(zone, Math.random);
        if (!target) continue;
        const cur = posRef.current[d.key];
        if (Math.hypot(target.x - cur.x, target.y - cur.y) < 3) continue;
        busyRef.current.add(d.key);
        void walkChar(d.key, [target], WALK_SPEEDS.stroll)
          .finally(() => busyRef.current.delete(d.key));
      }
    }, 3000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusSig]);

  // ---------- unmount: silence every timer ----------
  useEffect(() => () => {
    for (const key of ctrlsRef.current.keys()) cancelWalk(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const anyWorking = AGENT_DEFS.some((d) => stateByKey.get(d.key)?.status === 'working');
  const boardCount = boardEntries.length;

  const charStatus = (key: CharKey): string => {
    if (key === 'unique' || key === 'uniqa') return 'present';
    return stateByKey.get(key)?.status || 'idle';
  };

  const renderChar = (
    key: CharKey,
    name: string,
    role: string | null,
  ) => {
    const p = positions[key];
    const status = charStatus(key);
    const isWalking = walking.has(key);
    const isCarrying = carrying.has(key);
    return (
      <button
        key={key}
        type="button"
        className={[
          'floor-char',
          `floor-char-${status}`,
          `floor-char-${key}`,
          isWalking ? 'floor-char-walking' : '',
          isCarrying ? 'floor-char-carrying' : '',
          receiving.has(key) ? 'floor-char-receive' : '',
          selectedKey === key ? 'floor-char-selected' : '',
        ].join(' ')}
        style={{
          left: pctX(p.x),
          top: pctY(p.y),
          zIndex: 10 + Math.round(p.y),
          transitionDuration: `${durations[key] || 0}ms`,
          '--neon': neonFor(key),
        } as React.CSSProperties}
        onClick={() => onSelect(selectedKey === key ? null : key)}
        data-testid={`floor-char-${key}`}
        data-status={status}
        data-carrying={isCarrying ? 'true' : undefined}
        aria-label={role ? `${name} — ${role}` : name}
        aria-pressed={selectedKey === key}
      >
        <span className="floor-char-label">
          <span className="floor-char-name">{name}</span>
          {role && <span className="floor-char-role">{role}</span>}
          {status === 'working' && <span className="floor-char-state">کام کر رہا ہے</span>}
          {status === 'done' && <span className="floor-char-state floor-char-state-done">ہو گیا ✓</span>}
          {status === 'failed' && <span className="floor-char-state floor-char-state-failed">ناکام</span>}
        </span>
        <span className="floor-char-body">
          <FloorPerson personKey={key} />
          {status === 'working' && <span className="floor-char-ring" aria-hidden="true" />}
          {isCarrying && <span className="floor-char-doc" aria-hidden="true">📄</span>}
        </span>
      </button>
    );
  };

  const duoNow = persona === 'uniqa';
  return (
    <div className={`floor-wrap${compact ? ' floor-compact' : ''}`}>
      {/* سرخی پٹی — the ORG STRIP above the floor (user, 2026-10-24
          00:34): the hierarchy at the very TOP, each name written
          separately and fully readable — باس on one side of the
          «Unique AI» sign, مینیجر on the other, ٹیم + the hosts'
          presence line in the row beneath. Nothing org-related
          remains at the scene's bottom edge. */}
      <div className="office-orgstrip" data-testid="office-orgstrip">
        <div className="office-orgstrip-row">
          <span className="office-org-item office-org-boss" data-testid="org-boss">👑 باس: یونیک</span>
          <div className="office-sign" aria-hidden="true">
            <span className="office-sign-plant">🪴</span>
            <span className="office-sign-text">
              <span className="office-sign-brand" dir="ltr">Unique AI</span>
              <span className="office-sign-sub">آفس اسسٹنٹ — ایجنٹ ٹیم</span>
            </span>
            <span className="office-sign-plant">🪴</span>
          </div>
          <span className="office-org-item office-org-manager" data-testid="org-manager">💛 مینیجر: یونیکا</span>
        </div>
        <div className="office-orgstrip-row office-orgstrip-row-sub">
          <span className="office-org-item office-org-team" data-testid="org-team">👥 ٹیم: 7 ایجنٹ</span>
          <span
            className={`office-org-item office-org-status${duoNow ? ' office-org-status-duo' : ''}`}
            data-testid="org-hosts-status"
            aria-hidden="true"
          >
            {duoNow ? 'دونوں حاضر ہیں 💛' : 'یونیک حاضر ہے'}
          </span>
        </div>
      </div>

    <div
      className={`floor-scene${anyWorking ? '' : ' floor-resting'}`}
      data-testid="office-floor"
      ref={wrapRef}
      role="group"
      aria-label="دفتر کا فرش — ایجنٹ اپنے زونز میں"
    >
      {/* Back wall: windows with the city outside + planter hedge.
          (The «Unique AI» sign now stands in the org strip above
          the floor — see the top of this render.) */}
      <div className="floor-wall" aria-hidden="true">
        <span className="floor-window"><span className="floor-skyline" /></span>
        <span className="floor-window floor-window-mid"><span className="floor-skyline" /></span>
        <span className="floor-window"><span className="floor-skyline" /></span>
        <span className="floor-hedge" />
      </div>

      {/* Zones: rugs, plaques, desks and props (paint order). */}
      {FLOOR_ZONES.map((zone) => (
        <FloorZoneView
          key={zone.key}
          zone={zone}
          working={zone.key !== 'hosts' && stateByKey.get(zone.key)?.status === 'working'}
          duo={zone.key === 'hosts' && persona === 'uniqa'}
          boardCount={boardCount}
          kioskGlow={kioskGlow}
        />
      ))}

      {/* Desk furniture OVER the seated characters: the desk front
          bar (hides the sitter's legs) AND — user, 2026-10-23 23:41
          «ان کے سامنے کمپیوٹر رکھو» — a COMPUTER MONITOR directly
          in front of each seated character, standing on the desk's
          front half (its base at chair + 2.9 units) so the screen
          covers his CHEST while his face stays visible above it:
          unmistakably «he is working at his computer». The monitor
          belongs to the DESK: it stays (dim idle glow) when he
          walks away, and brightens while he REALLY works. Hosts get
          one each (boss + manager seat). */}
      {FLOOR_ZONES.filter((z) => z.desk).map((zone) => {
        const barZ = 10 + Math.round(zone.desk!.y + 3);
        if (zone.key === 'hosts') {
          return (
            <span key="bar-hosts">
              <span className="floor-deskbar" style={{ left: pctX(zone.desk!.x), top: pctY(zone.desk!.y + 2.7), zIndex: barZ }} aria-hidden="true" />
              <FloorPC pcKey="unique" x={HOST_SEATS.unique.x} y={HOST_SEATS.unique.y + 2.9} z={barZ + 1} on />
              <FloorPC pcKey="uniqa" x={HOST_SEATS.uniqa.x} y={HOST_SEATS.uniqa.y + 2.9} z={barZ + 1} on={persona === 'uniqa'} />
            </span>
          );
        }
        return (
          <span key={`bar-${zone.key}`}>
            <span className="floor-deskbar" style={{ left: pctX(zone.desk!.x), top: pctY(zone.desk!.y + 2.7), zIndex: barZ }} aria-hidden="true" />
            <FloorPC
              pcKey={zone.key}
              x={zone.desk!.x}
              y={(zone.chair?.y ?? zone.desk!.y + 1.2) + 2.9}
              z={barZ + 1}
              on={stateByKey.get(zone.key)?.status === 'working'}
            />
          </span>
        );
      })}

      {/* Characters: hosts first (boss + manager), then the team. */}
      {renderChar('unique', 'یونیک', 'باس')}
      {persona === 'uniqa'
        ? renderChar('uniqa', 'یونیکا', 'مینیجر')
        : (
          <span
            className="floor-empty-chair"
            style={{ left: pctX(HOST_SEATS.uniqa.x), top: pctY(HOST_SEATS.uniqa.y), zIndex: 10 + Math.round(HOST_SEATS.uniqa.y) }}
            data-testid="office-uniqa-seat"
            aria-hidden="true"
          >
            {/* The empty chair carries NO text (cleanup round):
                a name stack here has no collision-free slot at
                panel scale — it lands in the monitors' band —
                and her name already stands in the org strip
                («مینیجر: یونیکا»). The dashed chair alone marks
                her seat; when she is summoned her full labeled
                character takes it. */}
            <span className="floor-empty-chair-icon">🪑</span>
          </span>
        )}
      {AGENT_DEFS.map((d) => renderChar(d.key, d.person, null))}

      {/* NO org line at the bottom edge any more (user, 2026-10-24
          00:34): the hierarchy lives in the org strip ABOVE the
          floor — the bottom walkway stays clean floor. */}
    </div>
    </div>
  );
}

/** A desk computer: bezel + softly glowing screen + stand, drawn
 *  in the furniture layer (over the sitter's legs, under his torso)
 *  so it sits ON the desk right in front of its character. `on` =
 *  its person is really working there (screen bright); otherwise a
 *  dim idle glow — the screen never pretends work. */
function FloorPC({ pcKey, x, y, z, on }: { pcKey: string; x: number; y: number; z: number; on: boolean }) {
  return (
    <span
      className={`floor-pc${on ? ' floor-pc-on' : ''}`}
      style={{ left: pctX(x), top: pctY(y), zIndex: z }}
      data-testid={`floor-pc-${pcKey}`}
      data-on={on ? 'true' : 'false'}
      aria-hidden="true"
    >
      <span className="floor-pc-screen"><span className="cabin-screen-lines" /></span>
      <span className="floor-pc-stand" />
    </span>
  );
}

/** One zone of the floor: rug, plaque, desk + props. Purely
 *  presentational — characters live in their own layer above. */
function FloorZoneView({
  zone, working, duo, boardCount, kioskGlow,
}: {
  zone: FloorZone;
  working: boolean;
  duo: boolean;
  boardCount: number;
  kioskGlow: boolean;
}) {
  const { rect } = zone;
  const style = {
    left: pctX(rect.x), top: pctY(rect.y),
    width: pctX(rect.w), height: pctY(rect.h),
    '--neon': zone.key === 'hosts' ? (duo ? '#fde047' : '#7dd3fc') : ZONE_NEON,
  } as React.CSSProperties;
  const local = (p: FloorPoint) => ({
    left: `${((p.x - rect.x) / rect.w) * 100}%`,
    top: `${((p.y - rect.y) / rect.h) * 100}%`,
  });
  const isHosts = zone.key === 'hosts';
  return (
    <div
      className={[
        'floor-zone',
        `floor-zone-${zone.key}`,
        working ? 'floor-zone-working' : '',
        isHosts ? 'floor-zone-hosts' : '',
        duo ? 'floor-zone-duo' : '',
      ].join(' ')}
      style={style}
      data-testid={isHosts ? 'office-hosts-cabin' : `floor-zone-${zone.key}`}
      data-handoff-anchor={isHosts ? 'hub' : undefined}
    >
      <span className="floor-zone-label">{zone.label}</span>

      {/* No monitors in the zone layer anymore: each desk's
          computer stands IN FRONT of its character in the scene's
          furniture layer (see FloorPC) — the user's 23:41 order. */}

      {isHosts && (
        /* The desk mic (his standing spec) stands ON the desk,
           centred between the two monitors — measured clear of
           the «میزبان» plaque below and of both name labels
           above (cleanup round, 2026-10-24; geometry audited in
           cdp-verify-floor). The presence line («یونیک حاضر ہے» /
           «دونوں حاضر ہیں») moved OUT of this narrow zone into
           the org strip above the floor. */
        <span className="floor-hosts-mic" style={local({ x: 12.75, y: 21.2 })} aria-hidden="true">🎙️</span>
      )}

      {zone.key === 'media' && <span className="floor-media-screen" aria-hidden="true"><span className="cabin-screen-lines" /></span>}
      {zone.key === 'builder' && (
        <span className="floor-racks" aria-hidden="true">
          <span className="floor-rack"><i /><i /><i /></span>
          <span className="floor-rack"><i /><i /><i /></span>
          <span className="floor-rack"><i /><i /><i /></span>
        </span>
      )}
      {zone.key === 'quran-namaz' && <span className="floor-quran-rug" data-testid="floor-mosque" aria-hidden="true">🕌</span>}
      {zone.key === 'meeting' && (
        <span className="floor-meeting-table" aria-hidden="true">
          <i className="fmt-chair fmt-c1" /><i className="fmt-chair fmt-c2" /><i className="fmt-chair fmt-c3" />
          <i className="fmt-chair fmt-c4" /><i className="fmt-chair fmt-c5" /><i className="fmt-chair fmt-c6" />
          <span className="fmt-surface" />
        </span>
      )}
      {zone.key === 'plaza' && (
        <>
          <span className="floor-sofa" aria-hidden="true">🛋️</span>
          <span
            className={`floor-kiosk${kioskGlow ? ' floor-kiosk-glow' : ''}`}
            style={local(BOARD_KIOSK)}
            data-testid="floor-board-kiosk"
            data-handoff-anchor="board"
            aria-hidden="true"
          >
            <span className="floor-kiosk-title">📋 آج کا بورڈ</span>
            <span className="floor-kiosk-count">{boardCount > 0 ? `${boardCount} کام مکمل` : 'ابھی خالی'}</span>
          </span>
        </>
      )}
      {zone.key === 'coffee' && (
        /* The coffee corner rebuilt as a real little café set
           (user, 2026-10-24 00:42): a round table with its cup,
           chairs arranged AROUND the table — the old emoji
           cluster sat ON the «کافی» writing («چائے کے ساتھ پودا
           بھی کھایا جائے، واہ») — the set now stands in the
           zone's upper middle and the plaque stays untouched. */
        <span className="floor-coffee-set" data-testid="floor-coffee-set" aria-hidden="true">
          <i className="fcs-chair fcs-chair-a" />
          <span className="fcs-table"><span className="fcs-cup">☕</span></span>
          <i className="fcs-chair fcs-chair-b" />
        </span>
      )}
      {/* NO per-zone plant any more (declutter law, 2026-10-24):
          the 🪴 sat in the plaques' corner in zone after zone.
          Plants live on the sign and the wall hedge only. */}
    </div>
  );
}
