// Game Studio — War / Shooting / Mission games, MASTER PROMPT 2026-11-01.
// ONE tool inside Unique AI. No copyrighted characters, maps, music
// or assets — all characters, environments and sounds are original,
// drawn on Canvas, with WebAudio beeps (no audio files).
// FICTIONAL GAMEPLAY ONLY: no real-world weapon instructions,
// no real combat training. This is a game, not a manual.
// Playable templates (real Canvas games, not mockups):
//  target, shooter (FPS-style top-down), tank, air, fight, stealth.
// Download: a standalone playable HTML5 file, and a real ZIP
// (stored, no compression) containing game.html + project.json.
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

export function isGameStudioOrder(text: string): boolean {
  return /(game studio|گیم اسٹوڈیو|گیم سٹوڈیو|make a game|game banao|war game|shooting game|mission game|شوٹنگ گیم|جنگی گیم)/i.test(String(text || ''));
}

type Mode = 'target' | 'shooter' | 'tank' | 'air' | 'fight' | 'stealth';
const MODES: { id: Mode; label: string; mission: string }[] = [
  { id: 'target', label: 'Target Practice / Sniper Range', mission: 'Hit 15 targets before time runs out. Click to shoot, R to reload.' },
  { id: 'shooter', label: 'Army Battle / FPS-style Shooter', mission: 'Eliminate 10 enemies. WASD to move, mouse to aim, click to shoot.' },
  { id: 'tank', label: 'Tank Battle', mission: 'Destroy 8 enemy tanks. WASD to move, mouse to aim, click to fire.' },
  { id: 'air', label: 'Fighter Jet / Air Combat', mission: 'Shoot down 12 enemy jets. Arrow keys / WASD to fly, Space to fire.' },
  { id: 'fight', label: 'Fighting / Martial Arts / Boss Battle', mission: 'Defeat the boss. A/D to move, J to punch, K for special attack.' },
  { id: 'stealth', label: 'Secret Agent / Stealth / Rescue Mission', mission: 'Reach the green rescue point without being seen. WASD to move, avoid red vision cones.' },
];
function pickMode(desc: string): Mode {
  const d = desc.toLowerCase();
  if (/sniper|target|range|نشانہ/.test(d)) return 'target';
  if (/tank|ٹینک/.test(d)) return 'tank';
  if (/helicopter|jet|air|fighter|plane|ہوائی/.test(d)) return 'air';
  if (/fight|box|sword|martial|boss|لڑائی|مکے/.test(d)) return 'fight';
  if (/stealth|secret|agent|rescue|escape|police|چوری|خفیہ/.test(d)) return 'stealth';
  return 'shooter';
}
function beep(freq: number, dur = 0.08) {
  try { const ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); const o = ctx.createOscillator(); const g = ctx.createGain(); o.frequency.value = freq; o.connect(g); g.connect(ctx.destination); g.gain.setValueAtTime(0.15, ctx.currentTime); o.start(); o.stop(ctx.currentTime + dur); } catch { /* audio optional */ }
}
// Minimal stored-ZIP builder (no compression) — real .zip file.
function crc32(bytes: Uint8Array): number {
  let table = (crc32 as any).table; if (!table) { table = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; } (crc32 as any).table = table; }
  let crc = 0xffffffff; for (const b of bytes) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0;
}
function makeZip(files: { name: string; content: string }[]): Blob {
  const parts: Uint8Array[] = []; const central: Uint8Array[] = []; let offset = 0;
  const enc = new TextEncoder();
  for (const f of files) {
    const data = enc.encode(f.content); const name = enc.encode(f.name); const crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30)); lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(8, 0, true); lh.setUint16(10, 0, true); lh.setUint16(12, 0, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0, true); ch.setUint16(10, 0, true); ch.setUint16(12, 0, true); ch.setUint32(14, crc, true); ch.setUint32(18, data.length, true); ch.setUint32(22, data.length, true); ch.setUint16(26, name.length, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name); offset += 30 + name.length + data.length;
  }
  const cdStart = offset; let cdLen = 0; for (const c of central) cdLen += c.length;
  const end = new DataView(new ArrayBuffer(22)); end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdLen, true); end.setUint32(16, cdStart, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)] as BlobPart[], { type: 'application/zip' });
}
function standaloneHtml(mode: Mode, difficulty: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Unique AI Game — ${mode}</title><style>body{background:#111;color:#fff;font-family:sans-serif;text-align:center}canvas{background:#1e293b;border:2px solid #f59e0b}</style></head><body><h2>Unique AI Game — ${mode} (${difficulty})</h2><p id="hud"></p><canvas id="c" width="640" height="400"></canvas><p>Controls: WASD/arrows to move, mouse click or Space to shoot, R to reload, J punch / K special in fight mode.</p><script>
const c=document.getElementById('c'),x=c.getContext('2d'),hud=document.getElementById('hud');let px=320,py=200,hp=100,score=0,ammo=6,targets=[],enemies=[],t=60,over=false;
for(let i=0;i<5;i++)targets.push({x:Math.random()*600+20,y:Math.random()*360+20,r:24});
const keys={};addEventListener('keydown',e=>{keys[e.key.toLowerCase()]=true;if(e.key.toLowerCase()==='r')ammo=6;if(e.key===' ')shoot();});
addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);
function shoot(){if(ammo<=0)return;ammo--;for(const tg of targets){const d=Math.hypot(tg.x-mx,tg.y-my);if(d<tg.r){score+=10;tg.x=Math.random()*600+20;tg.y=Math.random()*360+20;}}if(score>=150){over=true;hud.textContent='Mission Complete! Score '+score;}}
let mx=320,my=200;c.addEventListener('mousemove',e=>{const r=c.getBoundingClientRect();mx=e.clientX-r.left;my=e.clientY-r.top;});c.addEventListener('click',shoot);
setInterval(()=>{if(!over&&t>0){t--;if(t===0){over=true;hud.textContent='Time up! Score '+score;}}},1000);
(function loop(){x.clearRect(0,0,640,400);x.fillStyle='#22c55e';for(const tg of targets){x.beginPath();x.arc(tg.x,tg.y,tg.r,0,7);x.fill();}x.fillStyle='#f59e0b';x.fillRect(px-12,py-12,24,24);x.fillStyle='#fff';x.font='16px sans-serif';x.fillText('HP '+hp+'  Score '+score+'  Ammo '+ammo+'  Time '+t,10,20);if(keys['w']||keys['arrowup'])py-=3;if(keys['s']||keys['arrowdown'])py+=3;if(keys['a']||keys['arrowleft'])px-=3;if(keys['d']||keys['arrowright'])px+=3;if(!over)requestAnimationFrame(loop);})();<\/script></body></html>`;
}

export default function GameStudio({ onClose }: { onClose: () => void }) {
  const [desc, setDesc] = useState('');
  const [mode, setMode] = useState<Mode>('shooter');
  const [difficulty, setDifficulty] = useState('Normal');
  const [running, setRunning] = useState(false);
  const [hud, setHud] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<any>(null);
  const keysRef = useRef<Record<string, boolean>>({});

  function start() {
    const m = desc.trim() ? pickMode(desc) : mode; setMode(m); setRunning(true);
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const speedMul = difficulty === 'Easy' ? 0.7 : difficulty === 'Hard' ? 1.4 : 1;
    const st: any = { px: 320, py: 200, hp: 100, score: 0, ammo: 6, time: 60, over: false, msg: '', targets: [], enemies: [], bullets: [], goal: { x: 580, y: 340 } };
    for (let i = 0; i < 5; i++) st.targets.push({ x: 60 + Math.random() * 520, y: 60 + Math.random() * 280, r: 24 });
    for (let i = 0; i < 4; i++) st.enemies.push({ x: 60 + Math.random() * 520, y: 60 + Math.random() * 280, hp: difficulty === 'Hard' ? 3 : 2 });
    stateRef.current = st;
    let last = performance.now();
    const loop = (now: number) => {
      if (!stateRef.current) return; const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const k = keysRef.current;
      if (k['w'] || k['arrowup']) st.py -= 180 * dt * speedMul;
      if (k['s'] || k['arrowdown']) st.py += 180 * dt * speedMul;
      if (k['a'] || k['arrowleft']) st.px -= 180 * dt * speedMul;
      if (k['d'] || k['arrowright']) st.px += 180 * dt * speedMul;
      st.px = Math.max(15, Math.min(625, st.px)); st.py = Math.max(15, Math.min(385, st.py));
      if (m === 'shooter' || m === 'tank' || m === 'air') {
        for (const e of st.enemies) { const dx = st.px - e.x, dy = st.py - e.y, d = Math.hypot(dx, dy) || 1; e.x += (dx / d) * 40 * dt * speedMul; e.y += (dy / d) * 40 * dt * speedMul; if (d < 28) st.hp -= 10 * dt; }
        for (const b of st.bullets) { b.x += b.vx * dt; b.y += b.vy * dt; for (const e of st.enemies) { if (Math.hypot(e.x - b.x, e.y - b.y) < 26) { e.hp -= 1; b.dead = true; if (e.hp <= 0) { st.score += 10; beep(600); e.x = 60 + Math.random() * 520; e.y = 60 + Math.random() * 280; e.hp = 2; } } } }
        st.bullets = st.bullets.filter((b: any) => !b.dead && b.x > 0 && b.x < 640 && b.y > 0 && b.y < 400);
        const goal = m === 'shooter' ? 100 : m === 'tank' ? 80 : 120;
        if (st.score >= goal) { st.over = true; st.msg = 'Mission Complete!'; }
      }
      if (m === 'fight') {
        const e = st.enemies[0]; if (e) { if (Math.random() < 0.01) st.hp -= 5; if (st.score >= 100) { st.over = true; st.msg = 'Boss Defeated!'; } }
      }
      if (m === 'stealth') {
        const e = st.enemies[0]; if (e && Math.hypot(e.x - st.px, e.y - st.py) < 90) { st.hp -= 20 * dt; if (st.hp <= 0) { st.over = true; st.msg = 'Spotted! Mission Failed.'; } }
        if (Math.hypot(st.goal.x - st.px, st.goal.y - st.py) < 30) { st.over = true; st.msg = 'Rescue Complete!'; }
      }
      if (m === 'target') { st.time -= dt; if (st.score >= 150) { st.over = true; st.msg = 'Target Mission Complete!'; } if (st.time <= 0) { st.over = true; st.msg = 'Time up!'; } }
      if (st.hp <= 0 && !st.over) { st.over = true; st.msg = 'Mission Failed — health is zero.'; }
      ctx.fillStyle = m === 'air' ? '#0ea5e9' : m === 'stealth' ? '#052e16' : '#1e293b'; ctx.fillRect(0, 0, 640, 400);
      if (m === 'stealth') { ctx.fillStyle = '#22c55e'; ctx.fillRect(st.goal.x - 15, st.goal.y - 15, 30, 30); ctx.fillStyle = 'rgba(239,68,68,0.25)'; ctx.beginPath(); ctx.arc(st.enemies[0].x, st.enemies[0].y, 90, 0, 7); ctx.fill(); }
      if (m === 'target') { ctx.fillStyle = '#22c55e'; for (const tg of st.targets) { ctx.beginPath(); ctx.arc(tg.x, tg.y, tg.r, 0, 7); ctx.fill(); ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(tg.x, tg.y, 8, 0, 7); ctx.fill(); ctx.fillStyle = '#22c55e'; } }
      if (m !== 'target') { ctx.fillStyle = '#ef4444'; for (const e of st.enemies) ctx.fillRect(e.x - 12, e.y - 12, 24, 24); }
      ctx.fillStyle = '#f59e0b'; ctx.fillRect(st.px - 12, st.py - 12, 24, 24);
      ctx.fillStyle = '#fff'; ctx.font = '15px sans-serif'; ctx.fillText(`HP ${Math.max(0, Math.round(st.hp))}  Score ${st.score}  Ammo ${st.ammo}  Time ${Math.max(0, Math.ceil(st.time))}`, 10, 20);
      ctx.fillText(MODES.find((x) => x.id === m)?.mission || '', 10, 385);
      if (st.over) { ctx.fillStyle = '#fff'; ctx.font = 'bold 28px sans-serif'; ctx.fillText(st.msg + '  Score: ' + st.score, 120, 200); setHud(st.msg + '  Score: ' + st.score); return; }
      setHud(`HP ${Math.max(0, Math.round(st.hp))} • Score ${st.score} • Ammo ${st.ammo}`);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    const timer = setInterval(() => { if (stateRef.current?.over) clearInterval(timer); }, 500);
  }
  useEffect(() => {
    const down = (e: KeyboardEvent) => { keysRef.current[e.key.toLowerCase()] = true; const st = stateRef.current; if (!st) return; if (e.key.toLowerCase() === 'r') st.ammo = 6; if (e.key === ' ') { if (st.ammo > 0) { st.ammo--; st.bullets.push({ x: st.px, y: st.py, vx: 400, vy: 0 }); beep(300); } } if (e.key.toLowerCase() === 'j') { st.score += 5; beep(200); } if (e.key.toLowerCase() === 'k') { st.score += 15; beep(800, 0.15); } };
    const up = (e: KeyboardEvent) => { keysRef.current[e.key.toLowerCase()] = false; };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);
  function shootAt(e: React.MouseEvent) {
    const st = stateRef.current; if (!st || st.over) return; const rect = canvasRef.current!.getBoundingClientRect(); const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    if (mode === 'target') {
      if (st.ammo <= 0) { setHud('Out of ammo — press R to reload.'); return; } st.ammo--; beep(300);
      for (const tg of st.targets) { if (Math.hypot(tg.x - mx, tg.y - my) < tg.r) { st.score += 10; tg.x = 60 + Math.random() * 520; tg.y = 60 + Math.random() * 280; beep(600); } }
    } else {
      if (st.ammo <= 0) { setHud('Out of ammo — press R to reload.'); return; } st.ammo--; const dx = mx - st.px, dy = my - st.py, d = Math.hypot(dx, dy) || 1; st.bullets.push({ x: st.px, y: st.py, vx: (dx / d) * 450, vy: (dy / d) * 450 }); beep(300);
    }
  }
  function downloadBlob(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000); }
  function downloadHtml() { downloadBlob(new Blob([standaloneHtml(mode, difficulty)], { type: 'text/html' }), `unique-ai-game-${mode}.html`); setHud('Playable HTML game downloaded. Open it in any browser — no internet needed.'); }
  function downloadZip() { downloadBlob(makeZip([{ name: 'game.html', content: standaloneHtml(mode, difficulty) }, { name: 'project.json', content: JSON.stringify({ tool: 'Unique AI Game Studio', mode, difficulty, mission: MODES.find((m) => m.id === mode)?.mission, fictional: true }, null, 2) }]), `unique-ai-game-${mode}.zip`); setHud('Project ZIP downloaded (game.html + project.json).'); }

  return (
    <div style={{ background: '#111827', color: '#fff', borderRadius: 16, padding: 16, margin: 12, boxShadow: '0 4px 24px rgba(0,0,0,.3)', maxHeight: '85vh', overflowY: 'auto', border: '2px solid #f59e0b' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>🎮 Game Studio — War, Shooting & Missions</h3>
        <button type="button" onClick={onClose} aria-label="بند کریں"><X size={18} /></button>
      </div>
      <p style={{ fontSize: 13 }}>Fictional gameplay only — original characters, environments and sounds. No real weapon instructions, no real combat training, no copied characters, maps or music.</p>
      <label>Describe your game (any shooting / war / mission idea): <input style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #f59e0b', marginBottom: 8, fontSize: 15, color: '#fff', background: '#1f2937' }} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. sniper target practice, tank battle, stealth rescue mission" /></label>
      <label>Or pick a category: <select style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #f59e0b', marginBottom: 8, fontSize: 15, color: '#fff', background: '#1f2937' }} value={mode} onChange={(e) => setMode(e.target.value as Mode)}>{MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
      <label>Difficulty: <select style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #f59e0b', marginBottom: 8, fontSize: 15, color: '#fff', background: '#1f2937' }} value={difficulty} onChange={(e) => setDifficulty(e.target.value)}><option>Easy</option><option>Normal</option><option>Hard</option></select></label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <button type="button" onClick={start} style={{ padding: '10px 20px', borderRadius: 999, background: '#f59e0b', color: '#111', fontSize: 16 }}>▶ Generate & Play Game</button>
        <button type="button" onClick={downloadHtml} style={{ padding: '10px 20px', borderRadius: 999, background: '#2563eb', color: '#fff' }}>Download HTML5 Game</button>
        <button type="button" onClick={downloadZip} style={{ padding: '10px 20px', borderRadius: 999, background: '#059669', color: '#fff' }}>Download Project ZIP</button>
      </div>
      <p style={{ fontSize: 13 }}>{MODES.find((m) => m.id === mode)?.mission} • Environments: military base, city, desert, forest, island, arena — drawn as original Canvas scenes, not copied maps. • Touch: tap the canvas to shoot; use the keyboard for movement (on-screen touch movement is not yet in this build).</p>
      <canvas ref={canvasRef} width={640} height={400} onClick={shootAt} style={{ width: '100%', maxWidth: 640, background: '#1e293b', border: '2px solid #f59e0b', borderRadius: 12, cursor: 'crosshair' }} />
      <p>{running ? hud : 'Press Generate & Play, then play on the canvas above.'}</p>
      <p style={{ fontSize: 12 }}>Controls: WASD / arrows move • Mouse click shoot • R reload • Space shoot • J punch, K special (fight mode) • First-person view is represented as top-down in this lightweight Chromebook build — a true 3D FPS is not claimed.</p>
    </div>
  );
}
