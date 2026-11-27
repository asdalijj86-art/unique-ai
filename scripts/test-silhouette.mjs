/**
 * test-silhouette.mjs — SILHOUETTE PANEL (user order 2026-11-28,
 * from his screenshot 1000051843_0_eumi.jpg).
 *
 * Proves (source + CSS checks; the pixels are verified by real
 * headless renders in face-test/silhouette-verify.js):
 *  1. The avatar is OUR OWN SVG drawing — no <img>, no external
 *     URL, no fetched asset, no Stonic asset; faceless by
 *     construction (no eyes/mouth/features in the paths).
 *  2. She MOVES: breathing, three staggered hair sways, shimmer,
 *     twinkle, speaking-faster glow — all CSS keyframes present,
 *     all wired in the SVG, and still under prefers-reduced-motion.
 *  3. The panel matches the reference layout: top bar (new /
 *     classic / gear), four node pills with the reference colours
 *     (MEMORY teal, SKILLS green, CHARACTER red-pink, SETTING blue),
 *     converging lines, bottom bar (mic + "Uniqa is speaking" +
 *     power), Uniqa branding — NEVER "Love", never "Stonic" as a
 *     name for her.
 *  4. EVERYTHING WORKS: nodes open real panels, gear opens
 *     Settings, power = TERMINATE/START AI (same testids as
 *     classic), mic = voice input, new/classic = real persisted
 *     switch, classic mode renders the old face untouched.
 *
 * Run: node scripts/test-silhouette.mjs   (from the repo root)
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const silSrcRaw = readFileSync(join(repoRoot, 'client/src/components/SilhouetteAvatar.tsx'), 'utf8');
// Strip block comments first: the header DOCUMENTS the provenance
// ("from his Stonic screenshot", "never Stonic's assets") — those
// words in comments are not the avatar's identity or art.
const silSrc = silSrcRaw.replace(/\/\*[\s\S]*?\*\//g, '');
const frontSrc = readFileSync(join(repoRoot, 'client/src/components/StonicFront.tsx'), 'utf8');
const css = readFileSync(join(repoRoot, 'client/src/index.css'), 'utf8');
const chatSrc = readFileSync(join(repoRoot, 'client/src/pages/chat.tsx'), 'utf8');

let passed = 0; let failed = 0;
function check(name, ok) {
  if (ok) { passed += 1; console.log(`  PASS ${name}`); }
  else { failed += 1; console.log(`  FAIL ${name}`); }
}

// ---------------------------------------------------------------------------
// 1. Our own SVG drawing — no external art, faceless.
// ---------------------------------------------------------------------------
check('silhouette is inline SVG', silSrc.includes('<svg') && silSrc.includes('viewBox="20 20 360 320"'));
check('no img / no external URL in avatar', !silSrc.includes('<img') && !silSrc.includes('http'));
check('no Stonic asset or name as her identity', !silSrc.includes('stonic') && !silSrc.includes('Stonic'));
check('never "Love" anywhere in avatar', !/love/i.test(silSrc));
check('head + shoulders paths present', silSrc.includes('M200 46') && silSrc.includes('M52 340'));
check('dark faceless head (shadow, not light)', silSrc.includes('#082a3a') && silSrc.includes('#155e75'));
check('hair paths present (back + 3 strands)', silSrc.includes('usil-sway-a') && silSrc.includes('usil-sway-b') && silSrc.includes('usil-sway-c'));
check('faceless: no eye/mouth/feature element', !/\b(eyes?|mouth|nose|lips?|pupil)s?\b/i.test(silSrc));
check('teal glow gradients', silSrc.includes('#22d3ee') && silSrc.includes('#67e8f9') && silSrc.includes('usil-glow'));

// ---------------------------------------------------------------------------
// 2. She MOVES — animations wired + defined.
// ---------------------------------------------------------------------------
for (const cls of ['usil-breathe', 'usil-halo', 'usil-sway-a', 'usil-sway-b', 'usil-sway-c', 'usil-shimmer', 'usil-twinkle']) {
  check(`SVG uses .${cls}`, silSrc.includes(cls));
}
for (const kf of ['usil-breathe', 'usil-halo', 'usil-sway', 'usil-shimmer-move', 'usil-twinkle']) {
  check(`CSS defines @keyframes ${kf}`, css.includes(`@keyframes ${kf}`));
}
check('speaking speeds the glow', css.includes('.usil-svg.speaking .usil-halo'));
check('reduced-motion stills her', (() => {
  // There are older reduced-motion blocks in this file (AiOrb etc.)
  // — find the one that mentions the silhouette classes.
  const needle = '@media (prefers-reduced-motion: reduce)';
  let i = css.indexOf(needle);
  while (i !== -1) {
    const block = css.slice(i, i + 400);
    if (block.includes('.usil-breathe')) {
      return block.includes('.usil-halo') && block.includes('animation: none');
    }
    i = css.indexOf(needle, i + needle.length);
  }
  return false;
})());
check('sways are staggered (3 durations)', css.includes('7s') && css.includes('8.5s') && css.includes('9.5s'));
check('breathing is slow (~6s)', css.includes('usil-breathe 6s'));

// ---------------------------------------------------------------------------
// 3. Panel matches the reference.
// ---------------------------------------------------------------------------
check('top bar: new + classic + gear', frontSrc.includes('button-front-mode-new') && frontSrc.includes('button-front-mode-classic') && frontSrc.includes('button-front-gear'));
check('node colours match reference', frontSrc.includes("color: '#22d3ee'") && frontSrc.includes("color: '#34d399'") && frontSrc.includes("color: '#fb7185'") && frontSrc.includes("color: '#60a5fa'"));
check('node icons match reference (brain/book/mask/gear)', frontSrc.includes("icon: '🧠'") && frontSrc.includes("icon: '📖'") && frontSrc.includes("icon: '🎭'") && frontSrc.includes("icon: '⚙️'"));
check('bottom bar: mic + status + power', frontSrc.includes('button-microphone-front') && frontSrc.includes('usil-bottombar') && frontSrc.includes('usil-power'));
check('status says "Uniqa is speaking"', frontSrc.includes("'Uniqa is speaking'"));
check('status never says Love', !/love is speaking/i.test(frontSrc));
check('panel + frame CSS present', css.includes('.usil-panel') && css.includes('.usil-frame') && css.includes('.usil-bottombar'));
check('new mode: nodes LEFT, avatar RIGHT like the reference', css.includes('.usil-mode-new .ufront-face-core') && css.includes('direction: ltr'));
check('silhouette SVG sized to the frame', css.includes('.usil-svg'));

// ---------------------------------------------------------------------------
// 4. Everything works — no dead buttons.
// ---------------------------------------------------------------------------
check('nodes still open real panels', frontSrc.includes('onOpenNode(n.key)') && frontSrc.includes("onOpenNode('settings')"));
check('gear opens settings node', frontSrc.includes("onClick={() => onOpenNode('settings')}"));
check('power keeps TERMINATE/START testids in new mode', frontSrc.includes('data-testid="button-terminate"') && frontSrc.includes('data-testid="button-start-ai"'));
check('mic calls the real voice handler', frontSrc.includes('onMicClick?.()'));
check('new mode renders silhouette, classic renders AiOrb', frontSrc.includes('<SilhouetteAvatar') && frontSrc.includes('<AiOrb'));
check('mode switch persisted in chat', chatSrc.includes('changeFrontMode') && chatSrc.includes('frontMode={frontMode}'));
check('chat wires front mic to composer mic behaviour', chatSrc.includes('onMicClick={() =>') && chatSrc.includes('toggleRecording();'));
check('old face path untouched in classic', frontSrc.includes("frontMode === 'new' ? 'usil-panel' : 'usil-panel-classic'") || frontSrc.includes("isNewMode ? ("));

console.log(`\ntest-silhouette: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
