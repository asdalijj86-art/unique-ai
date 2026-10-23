/**
 * AgentTeam — the helper-agent layer's visible face.
 *
 * Three pieces, all fed by ONE source of real state (the strip's
 * AgentTaskState[] + احمد's live build + the task board):
 *  - AgentTeamStrip: live cards shown while one message runs SEVERAL
 *    real tool actions in parallel — one card per agent, flipping
 *    from «کام کر رہا ہے…» to «ہو گیا ✓» / «ناکام» when the server's
 *    actions come back. Rendered only for genuine multi-action
 *    replies; never decorative.
 *  - AgentOfficePanel: the OFFICE ON THE MAIN SCREEN (user decision,
 *    2026-10-23: «دفتر مین اسکرین پر ہی سامنے رہے — ایک طرف چیٹ،
 *    دوسری طرف کیبن روشن ہوتے ہوئے»). A persistent column beside the
 *    chat: the seven cabins + Uniqa's corner + آج کا بورڈ, visible on
 *    load, lighting up with the same real work. On phones it becomes
 *    a full-width section below the status panel.
 *  - AgentTeamScene: the same office as a large overlay (the 🤖 rail
 *    button / the panel's ⤢ button) — the close-up view.
 *
 * OfficeSceneContent is the single shared body of the two office
 * views (Master Plan Phase 4 — his six approved مناظر, 2026-10-23):
 * the seven agents in cabins. A cabin is LIT only when that agent
 * holds a REAL live task state — the very same AgentTaskState[] the
 * strip renders, plus احمد's live build — never fake activity.
 * Tapping a cabin zooms to that agent (current task + today's
 * completed work from the task board). When nobody works, the office
 * rests (warm light, tea, evening). When 2+ work together, light
 * lines link their cabins. At the head of the floor sits the joint
 * hosts' cabin — باس یونیک at his desk, and یونیکا's مینیجر seat
 * beside him, occupied only while she is the present persona. The
 * wall board lists today's
 * real completions. Each cabin is lived in by the agent's robot-boy
 * (CabinRobot) at his desk — an occupied cabin, not an empty black
 * screen. CSS/SVG only — no image assets — so it stays smooth on a
 * low-end Chromebook.
 *
 * فائل ہینڈ آف (user refinement, 2026-10-23): a 📄 visibly passes
 * between cabins on REAL transitions only — planned purely from
 * snapshot diffs by lib/office-handoff (dispatch from Unique's hub
 * when work starts, cabin→cabin when agents activate in sequence,
 * cabin→board when a completion is pinned). Idle = no motion.
 *
 * روبوٹ لڑکے (user spec, 2026-10-23 21:43): every cabin is lived in
 * by a small robot-BOY (components/CabinRobot) — he breathes and
 * blinks at rest, paces + types while his agent REALLY works, hops
 * twice when it lands, and a clone of him CARRIES the 📄 on every
 * flight above. Same real state, no theatre.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { AGENT_DEFS, agentLabel, type AgentTaskState } from '@/lib/agent-team';
import { CabinRobot, robotSVG, robotTintFor } from './CabinRobot';
import { formatBoardTime, type BoardEntry } from '@/lib/task-board';
import { planFlights, type Flight, type OfficeSnapshot } from '@/lib/office-handoff';
import type { Persona } from '@/lib/persona';

export function AgentTeamStrip({ tasks, onClose }: { tasks: AgentTaskState[]; onClose: () => void }) {
  if (!tasks.length) return null;
  const anyWorking = tasks.some((t) => t.status === 'working');
  return (
    <div className="agent-team-strip" dir="rtl" data-testid="panel-agent-team" role="region" aria-label="ایجنٹ ٹیم">
      <div className="agent-team-head">
        <span className="agent-team-title">🤖 ایجنٹ ٹیم {anyWorking ? '— کام جاری ہے' : ''}</span>
        <button type="button" className="tool-results-close" onClick={onClose} aria-label="بند کریں">
          ✕
        </button>
      </div>
      <div className="agent-team-cards">
        {tasks.map((task) => (
          <div key={task.key} className={`agent-card agent-card-${task.status}`} data-testid={`agent-card-${task.key}`}>
            <span className="agent-card-icon">{task.icon}</span>
            <span className="agent-card-name">{task.label}</span>
            <span className="agent-card-status">
              {task.status === 'working' && 'کام کر رہا ہے…'}
              {task.status === 'done' && 'ہو گیا ✓'}
              {task.status === 'failed' && 'ناکام'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export type BuildLiveState = { title: string; startedAt: number } | null;

/** The real state every office view renders from — ONE source, so
 *  the panel, the overlay scene and the strip can never disagree. */
export type OfficeStateProps = {
  /** The strip's live state — the SINGLE source of agent activity. */
  tasks: AgentTaskState[] | null;
  /** Who is present (Phase 2) — seats Uniqa in the hosts' cabin. */
  persona: Persona;
  /** Today's REAL completions (lib/task-board) — board + close-ups. */
  boardEntries: BoardEntry[];
  /** احمد's in-flight build (its card polls the real job). A build
   *  older than 15 minutes whose card is gone no longer lights him —
   *  the scene must not claim work it cannot see. */
  buildLive: BuildLiveState;
};

export function OfficeSceneContent({ tasks, persona, boardEntries, buildLive, compact = false }: OfficeStateProps & { compact?: boolean }) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const prevSnapshotRef = useRef<OfficeSnapshot | null>(null);
  const flightRunRef = useRef(0);

  const stateByKey = new Map<string, AgentTaskState>();
  for (const t of tasks || []) stateByKey.set(t.key, t);
  // احمد's live build is real work even though builds never join the
  // parallel strip — fold it into the same state map (a live build
  // wins over a stale strip card for him).
  const buildFresh = !!buildLive && Date.now() - buildLive.startedAt < 15 * 60 * 1000;
  if (buildFresh && buildLive) {
    stateByKey.set('builder', {
      key: 'builder',
      icon: '🛠️',
      label: agentLabel(AGENT_DEFS.find((d) => d.key === 'builder')!),
      status: 'working',
      detail: `بنا رہا ہے: ${buildLive.title}`,
    });
  }

  const workingDefs = AGENT_DEFS.filter((d) => stateByKey.get(d.key)?.status === 'working');
  const anyWorking = workingDefs.length > 0;
  const teamMode = workingDefs.length >= 2;
  const selected = selectedKey ? AGENT_DEFS.find((d) => d.key === selectedKey) : undefined;
  const selectedState = selected ? stateByKey.get(selected.key) : undefined;
  const selectedDone = selected ? boardEntries.filter((e) => e.agentKey === selected.key) : [];
  const boardRecent = [...boardEntries].slice(-8).reverse();

  // ---- فائل ہینڈ آف: flights planned from REAL snapshot diffs ----
  // Working keys in ACTIVATION order (strip order; احمد last when a
  // build lights him) so «previous working cabin» means the agent who
  // most recently held the file.
  const workingOrder: string[] = [];
  for (const t of tasks || []) {
    if (t.status === 'working' && !workingOrder.includes(t.key)) workingOrder.push(t.key);
  }
  if (buildFresh && !workingOrder.includes('builder')) workingOrder.push('builder');
  const snapshot: OfficeSnapshot = {
    working: workingOrder,
    board: boardEntries.map((e) => ({ agentKey: e.agentKey, at: e.at })),
  };
  const snapshotSig = `${workingOrder.join(',')}#${boardEntries.length}#${boardEntries.length ? boardEntries[boardEntries.length - 1].at : ''}`;

  useEffect(() => {
    const prev = prevSnapshotRef.current;
    prevSnapshotRef.current = snapshot;
    if (!prev) return; // first sight of the office: never perform past activity
    const flights = planFlights(prev, snapshot);
    if (!flights.length) return;
    // Reduced motion: the robots stay still and flights become a
    // gentle fade at the destination (handled inside flyFileOnce).
    const reducedMotion = typeof window !== 'undefined'
      && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const run = ++flightRunRef.current;
    void (async () => {
      for (const flight of flights) {
        if (flightRunRef.current !== run) return;
        await flyFileOnce(wrapRef.current, layerRef.current, flight, reducedMotion);
      }
    })();
    // The signature fully captures the snapshot's flight-relevant
    // content; the snapshot object itself is rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshotSig]);

  return (
    <div className="office-content" ref={wrapRef}>
      {/* ⑥ آج کا بورڈ — the office wall board: today's REAL
          completions, pinned with their times. */}
      <div className="office-board" data-testid="office-board">
        <div className="office-board-title">📋 آج کا بورڈ — مکمل شدہ کام</div>
        {boardRecent.length === 0 ? (
          <div className="tool-small-note">آج ابھی کوئی کام مکمل نہیں ہوا — پہلا کام مکمل ہوتے ہی یہاں لگ جائے گا۔</div>
        ) : (
          <ul className="office-board-list">
            {boardRecent.map((entry, i) => (
              <li key={`${entry.at}-${i}`} className="office-board-row">
                <span className="office-board-time" dir="ltr">{formatBoardTime(entry.at)}</span>
                <span className="office-board-agent">{entry.icon} {entry.person}</span>
                <span className="office-board-label">{entry.label}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ④ ٹیم ورک — when 2+ agents REALLY work at once, a line of
          light links their cabins (and the connector bar below). */}
      {teamMode && (
        <div className="office-team-link" data-testid="office-team-link" aria-hidden="true">
          {workingDefs.map((d, i) => (
            <span key={d.key} className="office-team-link-node">
              {i > 0 && <span className="office-team-link-line" />}
              <span className="office-team-link-dot">{d.icon}</span>
            </span>
          ))}
          <span className="office-team-link-caption">🤝 ٹیم مل کر کام کر رہی ہے</span>
        </div>
      )}

      {/* ① مرکزی آفس + ③ آرام + ⑤ یونیکا کا کونا */}
      <div
        className={`office-floor${anyWorking ? '' : ' office-resting'}${teamMode ? ' office-teamwork' : ''}`}
        data-testid="office-floor"
      >
        {/* داخلی بورڈ — the entrance sign over the office floor
            (user's reference image, 2026-10-23 — with OUR brand:
            «Unique AI», not the picture's "Hello AI"). */}
        <div className="office-sign" aria-hidden="true">
          <span className="office-sign-plant">🪴</span>
          <span className="office-sign-text">
            <span className="office-sign-brand" dir="ltr">Unique AI</span>
            <span className="office-sign-sub">آفس اسسٹنٹ — ایجنٹ ٹیم</span>
          </span>
          <span className="office-sign-plant">🪴</span>
        </div>
        {/* تنظیمی لکیر — the org chart in one line (user, 2026-10-23
            21:56): یونیک سب کا باس, یونیکا سات ایجنٹوں کی مینیجر. */}
        <div className="office-orgline" aria-hidden="true">
          👑 باس: یونیک <span className="office-orgline-sep">•</span> 💛 مینیجر: یونیکا <span className="office-orgline-sep">•</span> 🤖 ٹیم: 7 ایجنٹ
        </div>
        {!anyWorking && (
          <div className="office-rest-details" aria-hidden="true">
            <span className="office-window">🌆</span>
            <span className="office-rest-caption">☕ دفتر آرام کر رہا ہے — حکم دیں، ٹیم جاگ جائے گی</span>
          </div>
        )}
        {/* میزبان کیبن — the JOINT hosts' cabin at the head of the
            floor (user spec, 2026-10-23 21:55): Unique and Uniqa
            seated side by side at ONE desk, a microphone in front
            of them and a computer on the desk. This cabin IS the
            dispatch hub — every file flight starts from here.
            Presence honesty: Uniqa's robot sits here ONLY while
            she is the present persona (her golden-corner rule,
            moved into this cabin); otherwise her seat is empty
            and Unique hosts alone. */}
        <div
          className={`office-hosts${persona === 'uniqa' ? ' office-hosts-duo' : ''}`}
          data-testid="office-hosts-cabin"
          data-handoff-anchor="hub"
          aria-label={persona === 'uniqa' ? 'میزبان کیبن — یونیک اور یونیکا دونوں حاضر ہیں' : 'میزبان کیبن — یونیک حاضر ہے، یونیکا بلانے پر آتی ہے'}
        >
          <span className="cabin-plaque">
            <span className="cabin-neon-disc" aria-hidden="true">🎙️</span>
            <span className="cabin-plaque-text">
              <span className="cabin-plate">یونیک + یونیکا</span>
              <span className="cabin-duty">میزبان — مرکزی کیبن</span>
            </span>
          </span>
          <span className="hosts-stage" aria-hidden="true">
            <span className="hosts-seat hosts-seat-unique">
              <CabinRobot tint={robotTintFor('hub')} />
              <span className="hosts-role hosts-role-boss">باس — یونیک</span>
            </span>
            <span className="hosts-seat hosts-seat-uniqa" data-testid="office-uniqa-seat">
              {persona === 'uniqa'
                ? <CabinRobot tint={robotTintFor('uniqa')} />
                : <span className="hosts-seat-empty" />}
              <span className="hosts-role hosts-role-manager">مینیجر — یونیکا</span>
            </span>
            <span className="hosts-desk">
              <span className="hosts-desk-row">
                <span className="hosts-monitor"><span className="cabin-screen-lines" /></span>
                <span className="hosts-mic">🎙️</span>
              </span>
              <span className="hosts-deskbar" />
            </span>
          </span>
          <span className="cabin-status">
            {persona === 'uniqa' ? 'دونوں حاضر ہیں 💛' : 'یونیک حاضر ہے'}
          </span>
          <span className="cabin-plant" aria-hidden="true">🪴</span>
        </div>
        <div className="office-cabins">
          {AGENT_DEFS.map((def) => {
            const state = stateByKey.get(def.key);
            const status = state?.status || 'idle';
            return (
              <button
                key={def.key}
                type="button"
                style={{ '--neon': robotTintFor(def.key) } as CSSProperties}
                className={`office-cabin office-cabin-${status}${selectedKey === def.key ? ' office-cabin-selected' : ''}`}
                onClick={() => setSelectedKey(selectedKey === def.key ? null : def.key)}
                data-testid={`office-cabin-${def.key}`}
                aria-pressed={selectedKey === def.key}
                aria-label={`${agentLabel(def)} — ${status === 'working' ? 'کام کر رہا ہے' : status === 'done' ? 'کام مکمل' : 'فارغ'}`}
              >
                {/* تختی — the neon plaque ABOVE the cabin (user's
                    reference image, 2026-10-23): a glowing icon disc
                    over the door, with his NAME and DUTY written on
                    the board — «ہر کیبن کے اوپر ان کا نام ہو اور ان
                    کا کام کا شعبہ لکھا ہو». */}
                <span className="cabin-plaque">
                  <span className="cabin-neon-disc" aria-hidden="true">{def.icon}</span>
                  <span className="cabin-plaque-text">
                    <span className="cabin-plate">{def.person}</span>
                    <span className="cabin-duty">{def.duty}</span>
                  </span>
                </span>
                <span className="cabin-robot-stage" aria-hidden="true">
                  <CabinRobot tint={robotTintFor(def.key)} />
                  {status === 'working' && <span className="cabin-avatar-ping" />}
                </span>
                <span className="cabin-deskline" aria-hidden="true">
                  <span className="cabin-monitors">
                    <span className="cabin-screen"><span className="cabin-screen-lines" /></span>
                    <span className="cabin-screen"><span className="cabin-screen-lines" /></span>
                  </span>
                  <span className="cabin-desk" />
                </span>
                <span className="cabin-plant" aria-hidden="true">🪴</span>
                <span className="cabin-status">
                  {status === 'working' && 'کام کر رہا ہے…'}
                  {status === 'done' && 'ہو گیا ✓'}
                  {status === 'failed' && 'ناکام'}
                  {status === 'idle' && 'فارغ'}
                </span>
                {!anyWorking && <span className="cabin-tea" aria-hidden="true">☕</span>}
              </button>
            );
          })}
          {/* ⑤ یونیکا no longer keeps a separate corner: she sits
              in the joint hosts' cabin above (her مینیجر seat),
              present only while summoned — see office-hosts. */}
        </div>
      </div>

      {/* ② قریبی منظر — the tapped agent, up close: what he is on
          right now + his today's completed work (same board store). */}
      {selected && (
        <div className="office-closeup" data-testid="office-closeup">
          <div className="office-closeup-head">
            <span className="agent-card-icon">{selected.icon}</span>
            <span className="agent-card-name">{agentLabel(selected)}</span>
            <button type="button" className="tool-results-close" onClick={() => setSelectedKey(null)} aria-label="قریبی منظر بند کریں">
              ✕
            </button>
          </div>
          <div className="tool-small-note">{selected.blurb}</div>
          <div className="office-closeup-now">
            {selectedState?.status === 'working' && <>⏳ <strong>ابھی:</strong> {selectedState.detail || 'کام کر رہا ہے…'}</>}
            {selectedState?.status === 'done' && <>✅ <strong>ابھی:</strong> آخری کام مکمل ہو گیا{selectedState.detail ? ` — «${selectedState.detail}»` : ''}</>}
            {selectedState?.status === 'failed' && <>⚠️ <strong>ابھی:</strong> آخری کام مکمل نہیں ہو سکا</>}
            {!selectedState && <>💤 <strong>ابھی:</strong> فارغ ہے — کوئی کام نہیں چل رہا</>}
          </div>
          <div className="office-closeup-done-title">آج کے مکمل کام ({selectedDone.length})</div>
          {selectedDone.length === 0 ? (
            <div className="tool-small-note">آج ابھی اس ایجنٹ کا کوئی کام مکمل نہیں ہوا۔</div>
          ) : (
            <ul className="office-board-list">
              {[...selectedDone].reverse().map((entry, i) => (
                <li key={`${entry.at}-${i}`} className="office-board-row">
                  <span className="office-board-time" dir="ltr">{formatBoardTime(entry.at)}</span>
                  <span className="office-board-label">{entry.label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!compact && (
        <div className="tool-small-note">
          کیبن صرف تب روشن ہوتا ہے جب وہ ایجنٹ اصل میں کام کر رہا ہو — یہ سین اسی اصل حالت کو دکھاتا ہے جو چیٹ کے کارڈز میں چل رہی ہوتی ہے۔
        </div>
      )}

      {/* The file-flight layer: chips are created imperatively by
          flyFileOnce for planned REAL transitions only. */}
      <div className="office-fly-layer" ref={layerRef} aria-hidden="true" />
    </div>
  );
}

/** Animate ONE handoff inside the office: a little robot-BOY
 *  (the sender's own tint; Unique's sky boy for hub dispatches)
 *  CARRIES the 📄 from a cabin/hub to a cabin/board, and the
 *  receiver answers with a small bounce. Coordinates come from the
 *  elements' real rects; a missing endpoint (view not mounted)
 *  simply skips the flight. Reduced motion: no travel — the
 *  traveler just fades in at the destination and away. */
async function flyFileOnce(
  wrap: HTMLDivElement | null,
  layer: HTMLDivElement | null,
  flight: Flight,
  reducedMotion = false,
): Promise<void> {
  if (!wrap || !layer) return;
  const fromEl = flight.from === 'hub'
    ? wrap.querySelector('[data-handoff-anchor="hub"]')
    : wrap.querySelector(`[data-testid="office-cabin-${flight.from}"]`);
  const toEl = flight.to === 'board'
    ? wrap.querySelector('[data-testid="office-board"]')
    : wrap.querySelector(`[data-testid="office-cabin-${flight.to}"]`);
  if (!fromEl || !toEl) return;
  const wrapRect = wrap.getBoundingClientRect();
  const center = (el: Element) => {
    const r = el.getBoundingClientRect();
    return { x: r.left - wrapRect.left + r.width / 2, y: r.top - wrapRect.top + r.height / 2 };
  };
  const a = center(fromEl);
  const b = center(toEl);
  const mid = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - 34 };
  const chip = document.createElement('div');
  chip.className = 'office-fly-file office-fly-robot';
  chip.setAttribute('data-testid', 'office-fly-file');
  chip.dataset.from = String(flight.from);
  chip.dataset.to = String(flight.to);
  chip.dataset.kind = flight.kind;
  // The traveler IS the sender's robot boy, file in his hands.
  const tint = robotTintFor(flight.from === 'hub' ? 'hub' : String(flight.from));
  chip.innerHTML = `${robotSVG(tint)}<span class="office-fly-doc" aria-hidden="true">📄</span>`;
  layer.appendChild(chip);
  const T = (p: { x: number; y: number }, s: number) =>
    `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) scale(${s})`;
  try {
    const anim = reducedMotion
      ? chip.animate(
        [
          { transform: T(b, 0.9), opacity: 0 },
          { transform: T(b, 0.9), opacity: 1, offset: 0.35 },
          { transform: T(b, 0.9), opacity: 1, offset: 0.7 },
          { transform: T(b, 0.9), opacity: 0 },
        ],
        { duration: 700, easing: 'ease-in-out' },
      )
      : chip.animate(
        [
          { transform: T(a, 0.6), opacity: 0 },
          { transform: T(a, 0.85), opacity: 1, offset: 0.18 },
          { transform: T(mid, 1.12), opacity: 1, offset: 0.55 },
          { transform: T(b, 0.9), opacity: 1, offset: 0.85 },
          { transform: T(b, 0.55), opacity: 0 },
        ],
        { duration: 880, easing: 'ease-in-out' },
      );
    await anim.finished;
  } catch {
    // animation cancelled (view closed mid-flight) — the chip is
    // removed below either way.
  }
  chip.remove();
  // وصولی — the receiver's little bounce: the cabin's robot hops;
  // for a delivery the board itself glows once. Pure presentation
  // of a handoff that really just happened.
  const receiveClass = flight.to === 'board' ? 'office-board-receive' : 'cabin-receive';
  toEl.classList.add(receiveClass);
  window.setTimeout(() => toEl.classList.remove(receiveClass), 750);
}

/**
 * The office ON THE MAIN SCREEN — a persistent column beside the
 * chat (user decision, 2026-10-23). Same real state, same shared
 * body as the overlay scene; the ⤢ button opens the big view.
 */
export function AgentOfficePanel(props: OfficeStateProps & { onExpand: () => void }) {
  const { onExpand, ...state } = props;
  const anyWorking =
    (state.tasks || []).some((t) => t.status === 'working') ||
    (!!state.buildLive && Date.now() - state.buildLive.startedAt < 15 * 60 * 1000);
  return (
    <aside className="office-panel office-panel-main" dir="rtl" data-testid="panel-office-main" aria-label="ڈیولپمنٹ آفس — ایجنٹ ٹیم">
      <div className="office-panel-head">
        <span className="office-panel-title">🏢 ڈیولپمنٹ آفس</span>
        <span className={`office-panel-live${anyWorking ? ' working' : ''}`}>
          {anyWorking ? 'ٹیم کام کر رہی ہے' : 'ٹیم موجود ہے'}
        </span>
        <button
          type="button"
          className="office-panel-expand"
          onClick={onExpand}
          aria-label="دفتر کا بڑا منظر کھولیں"
          data-testid="button-office-expand"
        >
          ⤢
        </button>
      </div>
      <div className="office-panel-body">
        <OfficeSceneContent {...state} compact />
      </div>
    </aside>
  );
}

/** The office as a large overlay — the close-up view of the same
 *  shared body (🤖 rail button / the panel's ⤢ button). */
export function AgentTeamScene({
  tasks,
  persona,
  boardEntries,
  buildLive,
  onClose,
}: OfficeStateProps & { onClose: () => void }) {
  return (
    <div className="tool-results office-scene" dir="rtl" data-testid="panel-agent-team-scene" role="region" aria-label="ایجنٹ ٹیم — دفتر">
      <div className="tool-results-head">
        <span className="tool-results-title">🏢 ڈیولپمنٹ آفس — ایجنٹ ٹیم</span>
        <button type="button" className="tool-results-close" onClick={onClose} aria-label="بند کریں">
          ✕
        </button>
      </div>
      <div className="tool-results-body">
        <OfficeSceneContent tasks={tasks} persona={persona} boardEntries={boardEntries} buildLive={buildLive} />
      </div>
    </div>
  );
}
