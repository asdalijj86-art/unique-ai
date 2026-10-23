/**
 * AgentTeam — the helper-agent layer's visible face.
 *
 * Two pieces, both on the MAIN CHAT screen (the user decided the
 * toolbox grid is going away — the team does NOT live in the tools
 * grid):
 *  - AgentTeamStrip: live cards shown while one message runs SEVERAL
 *    real tool actions in parallel — one card per agent, flipping
 *    from «کام کر رہا ہے…» to «ہو گیا ✓» / «ناکام» when the server's
 *    actions come back. Rendered only for genuine multi-action
 *    replies; never decorative.
 *  - AgentTeamScene: the OFFICE (Master Plan Phase 4 — his six
 *    approved مناظر, 2026-10-23): the seven agents in cabins with
 *    desks and computers. A cabin is LIT only when that agent holds a
 *    REAL live task state — the very same AgentTaskState[] the strip
 *    renders, plus احمد's live build — never fake activity. Tapping
 *    a cabin zooms to that agent (current task + today's completed
 *    work from the task board). When nobody works, the office rests
 *    (warm light, tea, evening). When 2+ work together, light lines
 *    link their cabins. Uniqa has her own golden corner, lit only
 *    while she is the present persona. The wall board lists today's
 *    real completions. CSS/SVG only — no image assets — so it stays
 *    smooth on a low-end Chromebook.
 */
import { useState } from 'react';
import { AGENT_DEFS, agentLabel, type AgentTaskState } from '@/lib/agent-team';
import { formatBoardTime, type BoardEntry } from '@/lib/task-board';
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

export function AgentTeamScene({
  tasks,
  persona,
  boardEntries,
  buildLive,
  onClose,
}: {
  /** The strip's live state — the SINGLE source of agent activity,
   *  shared with the strip so the two can never disagree. */
  tasks: AgentTaskState[] | null;
  /** Who is present (Phase 2) — lights Uniqa's corner. */
  persona: Persona;
  /** Today's REAL completions (lib/task-board) — board + close-ups. */
  boardEntries: BoardEntry[];
  /** احمد's in-flight build (its card polls the real job). A build
   *  older than 15 minutes whose card is gone no longer lights him —
   *  the scene must not claim work it cannot see. */
  buildLive: BuildLiveState;
  onClose: () => void;
}) {
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
  const selected = selectedKey ? AGENT_DEFS.find((d) => d.key === selectedKey) : undefined;
  const selectedState = selected ? stateByKey.get(selected.key) : undefined;
  const selectedDone = selected ? boardEntries.filter((e) => e.agentKey === selected.key) : [];
  const boardRecent = [...boardEntries].slice(-8).reverse();

  return (
    <div className="tool-results office-scene" dir="rtl" data-testid="panel-agent-team-scene" role="region" aria-label="ایجنٹ ٹیم — دفتر">
      <div className="tool-results-head">
        <span className="tool-results-title">🏢 ڈیولپمنٹ آفس — ایجنٹ ٹیم</span>
        <button type="button" className="tool-results-close" onClick={onClose} aria-label="بند کریں">
          ✕
        </button>
      </div>
      <div className="tool-results-body">
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
          {!anyWorking && (
            <div className="office-rest-details" aria-hidden="true">
              <span className="office-window">🌆</span>
              <span className="office-rest-caption">☕ دفتر آرام کر رہا ہے — حکم دیں، ٹیم جاگ جائے گی</span>
            </div>
          )}
          <div className="office-cabins">
            {AGENT_DEFS.map((def) => {
              const state = stateByKey.get(def.key);
              const status = state?.status || 'idle';
              return (
                <button
                  key={def.key}
                  type="button"
                  className={`office-cabin office-cabin-${status}${selectedKey === def.key ? ' office-cabin-selected' : ''}`}
                  onClick={() => setSelectedKey(selectedKey === def.key ? null : def.key)}
                  data-testid={`office-cabin-${def.key}`}
                  aria-pressed={selectedKey === def.key}
                  aria-label={`${agentLabel(def)} — ${status === 'working' ? 'کام کر رہا ہے' : status === 'done' ? 'کام مکمل' : 'فارغ'}`}
                >
                  <span className="cabin-screen" aria-hidden="true">
                    <span className="cabin-screen-lines" />
                  </span>
                  <span className="cabin-figure" aria-hidden="true">{def.icon}</span>
                  <span className="cabin-desk" aria-hidden="true" />
                  <span className="cabin-plate">{def.person}</span>
                  <span className="cabin-duty">{def.duty}</span>
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
            {/* ⑤ یونیکا کا کونا — her own soft golden corner; lit
                ONLY while she is the present persona. */}
            <div
              className={`office-cabin office-uniqa${persona === 'uniqa' ? ' office-uniqa-lit' : ''}`}
              data-testid="office-uniqa-corner"
              aria-label={persona === 'uniqa' ? 'یونیکا حاضر ہے' : 'یونیکا کا کونا — وہ بلانے پر آتی ہے'}
            >
              <span className="cabin-screen" aria-hidden="true"><span className="cabin-screen-lines" /></span>
              <span className="cabin-figure" aria-hidden="true">💛</span>
              <span className="cabin-desk" aria-hidden="true" />
              <span className="cabin-plate">یونیکا</span>
              <span className="cabin-duty">ساتھی</span>
              <span className="cabin-status">
                {persona === 'uniqa' ? 'حاضر ہے 💛' : 'بلانے پر آئے گی'}
              </span>
            </div>
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

        <div className="tool-small-note">
          کیبن صرف تب روشن ہوتا ہے جب وہ ایجنٹ اصل میں کام کر رہا ہو — یہ سین اسی اصل حالت کو دکھاتا ہے جو چیٹ کے کارڈز میں چل رہی ہوتی ہے۔
        </div>
      </div>
    </div>
  );
}
