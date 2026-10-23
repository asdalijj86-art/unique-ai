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
 * a central plaza where آج کا بورڈ hangs on a kiosk. The robot-boy
 * characters (CabinRobot figures) LIVE on this floor: each has a
 * floating name label, sits at his desk, strolls inside his own
 * zone when free — and when real work moves, he physically WALKS
 * it across the floor.
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
 */
import { useEffect, useRef, useState } from 'react';
import { AGENT_DEFS, type AgentTaskState } from '@/lib/agent-team';
import { CabinRobot, robotTintFor } from './CabinRobot';
import type { BoardEntry } from '@/lib/task-board';
import { planFlights, type Flight, type OfficeSnapshot } from '@/lib/office-handoff';
import {
  FLOOR_H, FLOOR_W, FLOOR_ZONES, HOST_SEATS, BOARD_FRONT, BOARD_KIOSK,
  WALK_SPEEDS, routePath, strollPoint, zoneByKey, type FloorPoint, type FloorZone,
} from '@/lib/floor-layout';
import type { Persona } from '@/lib/persona';

type CharKey = string; // 'unique' | 'uniqa' | agent key

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
    tint: string,
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
          '--neon': tint,
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
          <CabinRobot tint={tint} />
          {status === 'working' && <span className="floor-char-ring" aria-hidden="true" />}
          {isCarrying && <span className="floor-char-doc" aria-hidden="true">📄</span>}
        </span>
      </button>
    );
  };

  return (
    <div
      className={`floor-scene${anyWorking ? '' : ' floor-resting'}${compact ? ' floor-compact' : ''}`}
      data-testid="office-floor"
      ref={wrapRef}
      role="group"
      aria-label="دفتر کا فرش — ایجنٹ اپنے زونز میں"
    >
      {/* Back wall: windows with the city outside + planter hedge,
          and the «Unique AI» entrance sign (our brand — the
          reference picture's board, corrected per the user). */}
      <div className="floor-wall" aria-hidden="true">
        <span className="floor-window"><span className="floor-skyline" /></span>
        <span className="floor-window floor-window-mid"><span className="floor-skyline" /></span>
        <span className="floor-window"><span className="floor-skyline" /></span>
        <span className="floor-hedge" />
      </div>
      <div className="office-sign floor-sign" aria-hidden="true">
        <span className="office-sign-plant">🪴</span>
        <span className="office-sign-text">
          <span className="office-sign-brand" dir="ltr">Unique AI</span>
          <span className="office-sign-sub">آفس اسسٹنٹ — ایجنٹ ٹیم</span>
        </span>
        <span className="office-sign-plant">🪴</span>
      </div>

      {/* Zones: rugs, plaques, desks and props (paint order). */}
      {FLOOR_ZONES.map((zone) => (
        <FloorZoneView
          key={zone.key}
          zone={zone}
          working={zone.key !== 'hosts' && stateByKey.get(zone.key)?.status === 'working'}
          duo={zone.key === 'hosts' && persona === 'uniqa'}
          persona={persona}
          boardCount={boardCount}
          kioskGlow={kioskGlow}
        />
      ))}

      {/* Desk front bars OVER the seated characters (the seated
          illusion: the desk hides the sitter's legs). */}
      {FLOOR_ZONES.filter((z) => z.desk).map((zone) => (
        <span
          key={`bar-${zone.key}`}
          className="floor-deskbar"
          style={{
            left: pctX(zone.desk!.x),
            top: pctY(zone.desk!.y + 2.7),
            zIndex: 10 + Math.round(zone.desk!.y + 3),
          }}
          aria-hidden="true"
        />
      ))}

      {/* Characters: hosts first (boss + manager), then the team. */}
      {renderChar('unique', 'یونیک', 'باس', robotTintFor('hub'))}
      {persona === 'uniqa'
        ? renderChar('uniqa', 'یونیکا', 'مینیجر', robotTintFor('uniqa'))
        : (
          <span
            className="floor-empty-chair"
            style={{ left: pctX(HOST_SEATS.uniqa.x), top: pctY(HOST_SEATS.uniqa.y), zIndex: 10 + Math.round(HOST_SEATS.uniqa.y) }}
            data-testid="office-uniqa-seat"
            aria-hidden="true"
          >
            <span className="floor-empty-chair-icon">🪑</span>
            <span className="floor-char-label floor-char-label-ghost">
              <span className="floor-char-name">یونیکا</span>
              <span className="floor-char-role">مینیجر</span>
            </span>
          </span>
        )}
      {AGENT_DEFS.map((d) => renderChar(d.key, d.person, null, robotTintFor(d.key)))}

      {/* Org line inlaid in the bottom walkway (user, 2026-10-23
          21:56): یونیک سب کا باس, یونیکا سات ایجنٹوں کی مینیجر. */}
      <div className="office-orgline floor-orgline" aria-hidden="true">
        👑 باس: یونیک <span className="office-orgline-sep">•</span> 💛 مینیجر: یونیکا <span className="office-orgline-sep">•</span> 🤖 ٹیم: 7 ایجنٹ
      </div>
    </div>
  );
}

/** One zone of the floor: rug, plaque, desk + props. Purely
 *  presentational — characters live in their own layer above. */
function FloorZoneView({
  zone, working, duo, persona, boardCount, kioskGlow,
}: {
  zone: FloorZone;
  working: boolean;
  duo: boolean;
  persona: Persona;
  boardCount: number;
  kioskGlow: boolean;
}) {
  const { rect } = zone;
  const style = {
    left: pctX(rect.x), top: pctY(rect.y),
    width: pctX(rect.w), height: pctY(rect.h),
    '--neon': zone.key === 'hosts' ? (duo ? '#fde047' : '#7dd3fc') : robotTintFor(zone.key),
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

      {zone.desk && (
        <span className="floor-desk" style={local(zone.desk)} aria-hidden="true">
          <span className="floor-monitors">
            <span className="floor-screen"><span className="cabin-screen-lines" /></span>
            <span className="floor-screen"><span className="cabin-screen-lines" /></span>
          </span>
        </span>
      )}

      {isHosts && (
        <>
          <span className="floor-hosts-mic" style={local({ x: 12.75, y: 22.6 })} aria-hidden="true">🎙️</span>
          <span className="floor-hosts-status" aria-hidden="true">
            {persona === 'uniqa' ? 'دونوں حاضر ہیں 💛' : 'یونیک حاضر ہے'}
          </span>
        </>
      )}

      {zone.key === 'media' && <span className="floor-media-screen" aria-hidden="true"><span className="cabin-screen-lines" /></span>}
      {zone.key === 'builder' && (
        <span className="floor-racks" aria-hidden="true">
          <span className="floor-rack"><i /><i /><i /></span>
          <span className="floor-rack"><i /><i /><i /></span>
          <span className="floor-rack"><i /><i /><i /></span>
        </span>
      )}
      {zone.key === 'quran-namaz' && <span className="floor-quran-rug" aria-hidden="true">🕌</span>}
      {zone.key === 'meeting' && (
        <span className="floor-meeting-table" aria-hidden="true">
          <i className="fmt-chair fmt-c1" /><i className="fmt-chair fmt-c2" /><i className="fmt-chair fmt-c3" />
          <i className="fmt-chair fmt-c4" /><i className="fmt-chair fmt-c5" /><i className="fmt-chair fmt-c6" />
          <span className="fmt-surface">🌿</span>
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
      {zone.key === 'coffee' && <span className="floor-coffee" aria-hidden="true">☕ 🪑🪑</span>}
      <span className="floor-zone-plant" aria-hidden="true">🪴</span>
    </div>
  );
}
