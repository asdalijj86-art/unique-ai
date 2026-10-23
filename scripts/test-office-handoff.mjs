/**
 * test-office-handoff.mjs — Office on the main screen (user refinement,
 * 2026-10-23): the 📄 file-passing planner (lib/office-handoff) proves
 * it derives flights ONLY from real office-state transitions:
 *
 *  1. first snapshot / idle → idle: NO flights (never fake motion,
 *     never performs past activity on mount);
 *  2. work starts cold → dispatch from the hub (یونیک) to the cabin;
 *     several starters chain hub → A → B;
 *  3. an agent starts while another is already working → handoff
 *     from the previous working cabin (incl. احمد's build starting
 *     mid-search);
 *  4. a completion pinned on آج کا بورڈ for an agent who WAS working
 *     → deliver flight cabin → board (incl. the builder completing);
 *  5. failed work / pins for agents who were not working → nothing;
 *  6. the same snapshot twice → nothing (idempotent);
 *  7. flight count is capped per transition.
 *
 * Run: node scripts/test-office-handoff.mjs   (from the repo root)
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(join(tmpdir(), 'handoff-'));
const entry = join(outDir, 'entry.ts');
writeFileSync(entry, `export * from ${JSON.stringify(join(repoRoot, 'client/src/lib/office-handoff.ts'))};`);
const bundled = join(outDir, 'handoff-lib.mjs');
execSync(
  `${join(repoRoot, 'client/node_modules/.bin/esbuild')} ${entry} --bundle --format=esm --outfile=${bundled}`,
  { stdio: 'pipe' },
);
const { planFlights } = await import(pathToFileURL(bundled).href);

let passed = 0;
let failed = 0;
function check(label, actual, want) {
  const ok = JSON.stringify(actual) === JSON.stringify(want);
  if (ok) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}\n      got:  ${JSON.stringify(actual)}\n      want: ${JSON.stringify(want)}`); }
}

const snap = (working, board = []) => ({ working, board });
const pin = (agentKey, at) => ({ agentKey, at });
const F = (from, to, kind) => ({ from, to, kind });

console.log('\n── 1) No fake motion ──────────────────────────────────────');
check('first snapshot after mount (agents already working) → none',
  planFlights(null, snap(['talash'])), []);
check('idle → idle → none', planFlights(snap([]), snap([])), []);
check('same snapshot twice → none',
  planFlights(snap(['talash'], [pin('talash', 't1')]), snap(['talash'], [pin('talash', 't1')])), []);

console.log('\n── 2) Dispatch from the hub ───────────────────────────────');
check('cold start, one agent → hub → cabin (dispatch)',
  planFlights(snap([]), snap(['khabar-mausam'])),
  [F('hub', 'khabar-mausam', 'dispatch')]);
check('cold start, two agents → chain hub → A → B',
  planFlights(snap([]), snap(['talash', 'khabar-mausam'])),
  [F('hub', 'talash', 'dispatch'), F('talash', 'khabar-mausam', 'handoff')]);
check('cold start, build only → hub → احمد',
  planFlights(snap([]), snap(['builder'])),
  [F('hub', 'builder', 'dispatch')]);

console.log('\n── 3) Handoff between cabins ──────────────────────────────');
check('second agent starts while first still works → A → B',
  planFlights(snap(['talash']), snap(['talash', 'hisab-kitab'])),
  [F('talash', 'hisab-kitab', 'handoff')]);
check('build starts mid-search → حسن → احمد',
  planFlights(snap(['khabar-mausam']), snap(['khabar-mausam', 'builder'])),
  [F('khabar-mausam', 'builder', 'handoff')]);
check('agent starts after previous finished (none working between) → hub dispatch',
  planFlights(snap([]), snap(['likhai'])),
  [F('hub', 'likhai', 'dispatch')]);

console.log('\n── 4) Deliver to آج کا بورڈ ───────────────────────────────');
check('search completes + pinned → دانیال → board',
  planFlights(snap(['talash']), snap([], [pin('talash', 't1')])),
  [F('talash', 'board', 'deliver')]);
check('builder completes + pinned → احمد → board',
  planFlights(snap(['builder']), snap([], [pin('builder', 't9')])),
  [F('builder', 'board', 'deliver')]);
check('two completions pinned together → two deliver flights',
  planFlights(snap(['talash', 'khabar-mausam']), snap([], [pin('talash', 't1'), pin('khabar-mausam', 't1')])),
  [F('talash', 'board', 'deliver'), F('khabar-mausam', 'board', 'deliver')]);

console.log('\n── 5) Honest silence ──────────────────────────────────────');
check('work failed, nothing pinned → none',
  planFlights(snap(['talash']), snap([])), []);
check('pin for an agent who was NOT working → none',
  planFlights(snap([]), snap([], [pin('media', 't1')])), []);
check('pin arrives while a DIFFERENT agent works → no deliver, no dispatch',
  planFlights(snap(['hisab-kitab']), snap(['hisab-kitab'], [pin('talash', 't1')])), []);

console.log('\n── 6) Cap ─────────────────────────────────────────────────');
check('five simultaneous starters → capped at 4 flights',
  planFlights(snap([]), snap(['talash', 'khabar-mausam', 'hisab-kitab', 'likhai', 'media'])).length, 4);

console.log(`\n${failed === 0 ? '✅ ALL PASS' : '❌ FAILURES'} — ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
