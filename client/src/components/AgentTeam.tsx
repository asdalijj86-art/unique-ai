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
 *    2026-10-23: «دفتر مین اسکرین پر ہی سامنے رہے»). A persistent
 *    column beside the chat holding the living floor + آج کا بورڈ,
 *    visible on load, lighting up with the same real work. On
 *    phones it becomes a full-width section below the chat.
 *  - AgentTeamScene: the same office as a large overlay (the 🤖 rail
 *    button / the panel's ⤢ button) — the close-up view.
 *
 * OfficeSceneContent is the single shared body of the two office
 * views: the board + the team-link bar + the FLOOR (components/
 * FloorScene — Round 4, built to the user's reference video after
 * he rejected the round-3 cabin grid). A zone lights and its agent
 * types at his desk ONLY when that agent holds a REAL live task
 * state — the very same AgentTaskState[] the strip renders, plus
 * احمد's live build — never fake activity. Tapping a character
 * zooms to him (current task + today's completed work from the
 * task board). When nobody works, the office rests (warm light,
 * tea). When 2+ work together, the team bar links them.
 *
 * فائل ہینڈ آف (user refinement, 2026-10-23): on REAL transitions
 * only — planned purely from snapshot diffs by lib/office-handoff
 * (dispatch when work starts, agent→agent as they activate in
 * sequence, agent→board when a completion is pinned) — the
 * sender's own character physically WALKS the 📄 across the floor
 * (lib/floor-layout waypoints). Idle = nobody carries anything.
 *
 * کردار (user specs, 2026-10-23): the robot-BOYS (components/
 * CabinRobot) live on the floor with floating name labels — باس
 * یونیک and مینیجر یونیکا seated together at the hosts' desk
 * (her seat empty unless she is the summoned persona), the seven
 * agents at theirs. They breathe + blink at rest, stroll inside
 * their own zone when free, type at the desk while REALLY
 * working, and hop when work lands. Same real state, no theatre.
 */
import { useState } from 'react';
import { AGENT_DEFS, agentLabel, type AgentTaskState } from '@/lib/agent-team';
import { FloorScene } from './FloorScene';
import { formatBoardTime, type BoardEntry } from '@/lib/task-board';
import type { OfficeSnapshot } from '@/lib/office-handoff';
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
  // Floor characters are selectable too: 'unique' / 'uniqa' open
  // the hosts' close-up; agent keys open the agent's close-up.
  const selectedHost = selectedKey === 'unique' ? 'unique' : selectedKey === 'uniqa' ? 'uniqa' : null;
  const selected = selectedKey && !selectedHost ? AGENT_DEFS.find((d) => d.key === selectedKey) : undefined;
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

  return (
    <div className="office-content">
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

      {/* ① زندہ فرش + ③ آرام — Round 4: the cabin grid is GONE.
          One illustrated floor (components/FloorScene) built to
          the user's reference video: labeled zones, the robot
          boys at their desks, strolling in their zones when free,
          and physically WALKING the 📄 across the floor on real
          handoffs (flights still planned by lib/office-handoff
          from real snapshot diffs — the scene just walks them). */}
      {!anyWorking && (
        <div className="office-rest-row" aria-hidden="true">
          <span className="office-rest-caption">☕ دفتر آرام کر رہا ہے — حکم دیں، ٹیم جاگ جائے گی</span>
        </div>
      )}
      <FloorScene
        tasks={tasks}
        persona={persona}
        boardEntries={boardEntries}
        buildLive={buildLive}
        stateByKey={stateByKey}
        snapshot={snapshot}
        snapshotSig={snapshotSig}
        compact={compact}
        selectedKey={selectedKey}
        onSelect={setSelectedKey}
      />

      {/* ② قریبی منظر — the tapped character, up close. Hosts
          first: باس یونیک / مینیجر یونیکا, then the agent view
          below (his current task + today's work, same board). */}
      {selectedHost && (
        <div className="office-closeup" data-testid="office-closeup">
          <div className="office-closeup-head">
            <span className="agent-card-icon">{selectedHost === 'unique' ? '👑' : '💛'}</span>
            <span className="agent-card-name">
              {selectedHost === 'unique' ? 'یونیک — باس' : 'یونیکا — مینیجر'}
            </span>
            <button type="button" className="tool-results-close" onClick={() => setSelectedKey(null)} aria-label="قریبی منظر بند کریں">
              ✕
            </button>
          </div>
          <div className="tool-small-note">
            {selectedHost === 'unique'
              ? 'پورے دفتر کا باس — ہر حکم یہیں سے ٹیم تک جاتا ہے؛ فائل لے کر خود ایجنٹ کے پاس جاتا ہے۔'
              : 'سات ایجنٹوں کی مینیجر — صرف نام لے کر بلانے پر حاضر ہوتی ہے؛ اس وقت ' + (persona === 'uniqa' ? 'حاضر ہے 💛' : 'موجود نہیں — «یونیکا» کہہ کر بلائیں۔')}
          </div>
          <div className="office-closeup-done-title">آج کے مکمل کام — پوری ٹیم ({boardEntries.length})</div>
          {boardEntries.length === 0 ? (
            <div className="tool-small-note">آج ابھی کوئی کام مکمل نہیں ہوا۔</div>
          ) : (
            <ul className="office-board-list">
              {[...boardEntries].slice(-5).reverse().map((entry, i) => (
                <li key={`${entry.at}-${i}`} className="office-board-row">
                  <span className="office-board-time" dir="ltr">{formatBoardTime(entry.at)}</span>
                  <span className="office-board-agent">{entry.icon} {entry.person}</span>
                  <span className="office-board-label">{entry.label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
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
          ایجنٹ صرف تب اپنے ڈیسک پر کام کرتا نظر آتا ہے جب وہ اصل میں کام کر رہا ہو — یہ فرش اسی اصل حالت کو دکھاتا ہے جو چیٹ کے کارڈز میں چل رہی ہوتی ہے۔
        </div>
      )}
    </div>
  );
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
