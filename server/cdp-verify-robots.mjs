/**
 * SUPERSEDED (Round 4, 2026-10-23) — cdp-verify-robots.mjs verified the round-2/3
 * cabin office. The user rejected the cabin grid («ایسا کیبن نہیں
 * تھا بنانا») and the office is now ONE living floor scene built
 * to his reference video (components/FloorScene). Every check this
 * file made — presence honesty, real working state, file handoffs,
 * board deliveries, hosts duo, mobile — is covered, in floor form,
 * by server/cdp-verify-floor.mjs — which since the 2026-10-24
 * visual round proves CARTOON HUMANS (robots retired per the
 * user's «یہ روبوٹ نہیں»), computers in front of every character,
 * one brand color family and one shared office uniform. This
 * pointer simply runs it so old invocations keep verifying the
 * CURRENT office.
 */
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const res = spawnSync('node', [join(here, 'cdp-verify-floor.mjs')], { stdio: 'inherit' });
process.exit(res.status ?? 1);
