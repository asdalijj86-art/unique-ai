/**
 * agent-steps.ts — the COMPUTER AGENT, in-app form (Phase 2, Stonic
 * v3.0.1: "Stonic can now take the screen and do the work itself —
 * open apps, click, type and carry a task through, step by step",
 * with a live overlay showing the step it is on and a Stop button).
 *
 * HONEST SCOPE: a web page cannot open apps, click or type outside
 * itself — that is why this is the agent's OWN work view, not a
 * separate Chrome window. What IS real here: the tasked agent's work
 * runs step by step IN ITS OWN PANEL, each step is shown as it
 * starts and finishes, a Stop button (and Esc) stops it, risky steps
 * ask first, and the agent can narrate what it is doing. The steps
 * are derived from the agent's real task — never invented work.
 */

export type AgentStepStatus = 'pending' | 'active' | 'done' | 'failed';

export interface AgentStep {
  id: string;
  label: string;
  status: AgentStepStatus;
  /** A step that deletes/changes something important — asks first. */
  risky?: boolean;
}

const RISKY_RE = /(حذف|ڈیلیٹ|مٹا|مٹاؤ|delete|remove|بند کر دو سب|close all)/i;

export function isRiskyStepLabel(label: string): boolean {
  return RISKY_RE.test(String(label || ''));
}

/** Steps for a live-search task (the work view's real job). */
export function buildSearchSteps(taskText: string): AgentStep[] {
  const task = String(taskText || '').trim().slice(0, 80) || 'تلاش';
  return [
    { id: 'start', label: `کام شروع: ${task}`, status: 'active' },
    { id: 'search', label: 'تلاش ہو رہی ہے…', status: 'pending' },
    { id: 'read', label: 'نتائج پڑھے جا رہے ہیں…', status: 'pending' },
    { id: 'report', label: 'رپورٹ چیٹ میں آ رہی ہے…', status: 'pending' },
  ];
}

/** Steps for a general agent task (no live search). */
export function buildGeneralSteps(taskText: string): AgentStep[] {
  const task = String(taskText || '').trim().slice(0, 80) || 'کام';
  return [
    { id: 'start', label: `کام شروع: ${task}`, status: 'active' },
    { id: 'work', label: 'کام ہو رہا ہے…', status: 'pending' },
    { id: 'report', label: 'رپورٹ چیٹ میں آ رہی ہے…', status: 'pending' },
  ];
}

/** Pure advance: mark steps up to `doneCount` done, the next active. */
export function advanceSteps(steps: AgentStep[], doneCount: number): AgentStep[] {
  return steps.map((s, i) => ({
    ...s,
    status: i < doneCount ? 'done' : i === doneCount ? 'active' : 'pending',
  }));
}

export function failStep(steps: AgentStep[], id: string): AgentStep[] {
  return steps.map((s) => (s.id === id ? { ...s, status: 'failed' } : s));
}

export function allStepsDone(steps: AgentStep[]): boolean {
  return steps.length > 0 && steps.every((s) => s.status === 'done');
}

/** One short spoken line per step, for the narration toggle. */
export function narrateLineFor(step: AgentStep): string {
  if (step.id === 'start') return step.label;
  if (step.id === 'search') return 'میں تلاش کر رہا ہوں…';
  if (step.id === 'read') return 'نتائج پڑھ رہا ہوں…';
  if (step.id === 'work') return 'کام ہو رہا ہے…';
  if (step.id === 'report') return 'رپورٹ تیار ہو رہی ہے…';
  return step.label;
}
