/**
 * office-handoff — the office's file-passing planner (user refinement,
 * 2026-10-23: «ایجنٹ سکرین کے اوپر کام کرتے نظر آئیں، ایک دوسرے سے
 * فائلیں لیتے نظر آئیں»).
 *
 * A 📄 flies between cabins ONLY on REAL state transitions — the same
 * transitions the office already renders from (AgentTaskState[] +
 * buildLive + the task board). Nothing here invents motion: given two
 * consecutive snapshots of the office's real state, it decides which
 * file flights those transitions honestly imply:
 *
 *  - dispatch: work STARTS and no agent was working before → the file
 *    leaves the centre (Unique, the «hub») for the newly working cabin.
 *  - handoff: an agent becomes working while another agent was already
 *    working (a single request activating agents in sequence, a build
 *    starting mid-search, …) → the file passes from the previous
 *    working cabin to the newly working one. Several simultaneous
 *    starters chain: hub → A → B.
 *  - deliver: a completion is pinned on آج کا بورڈ for an agent who
 *    was working in the previous snapshot (a build احمد watched reach
 *    «done», a search دانیال actually returned, …) → the file flies
 *    from that cabin up to the board.
 *
 * Failed work pins nothing on the board, so it produces no flight.
 * The first snapshot after mount produces none either — the office
 * never performs activity that did not just happen.
 *
 * Pure and DOM-free so the decision logic is unit-testable
 * (scripts/test-office-handoff.mjs); the scene component only
 * executes the plan.
 */

export type FlightKind = 'dispatch' | 'handoff' | 'deliver';

/** 'hub' = Unique at the centre; 'board' = آج کا بورڈ; anything else
 *  is an agent key from lib/agent-team's AGENT_DEFS. */
export type FlightPoint = 'hub' | 'board' | (string & {});

export interface Flight {
  from: FlightPoint;
  to: FlightPoint;
  kind: FlightKind;
}

export interface OfficeSnapshot {
  /** Keys of agents whose cabin is LIT as working, in activation
   *  order (the strip's order; احمد appended when a live build lights
   *  him). 'done'/'failed' cards are NOT working. */
  working: string[];
  /** Today's board pins, oldest → newest (only their identity
   *  matters here: which agent, completed when). */
  board: { agentKey: string; at: string }[];
}

const MAX_FLIGHTS_PER_TRANSITION = 4;

export function planFlights(prev: OfficeSnapshot | null, next: OfficeSnapshot): Flight[] {
  if (!prev) return [];
  const flights: Flight[] = [];

  // ---- starts: dispatch from the hub, or hand off from the agent
  // who was working before ----
  const prevWorking = new Set(prev.working);
  const newlyWorking = next.working.filter((k) => !prevWorking.has(k));
  if (newlyWorking.length) {
    let from: FlightPoint = prev.working.length
      ? prev.working[prev.working.length - 1]
      : 'hub';
    for (const key of newlyWorking) {
      flights.push({ from, to: key, kind: from === 'hub' ? 'dispatch' : 'handoff' });
      from = key;
    }
  }

  // ---- completions: a fresh board pin for an agent who WAS working
  // sends his file up to the board ----
  const prevPins = new Set(prev.board.map((e) => `${e.agentKey}@${e.at}`));
  const freshPins = next.board.filter((e) => !prevPins.has(`${e.agentKey}@${e.at}`));
  if (freshPins.length) {
    const wasWorking = new Set(prev.working);
    for (const pin of freshPins) {
      if (wasWorking.has(pin.agentKey)) {
        flights.push({ from: pin.agentKey, to: 'board', kind: 'deliver' });
      }
    }
  }

  return flights.slice(0, MAX_FLIGHTS_PER_TRANSITION);
}
