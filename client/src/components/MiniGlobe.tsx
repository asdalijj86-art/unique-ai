/**
 * MiniGlobe — the SMALL world map on the front (2026-11-25, user's
 * words: a small world map on one side of the front, ROTATABLE by
 * hand with the mouse, like a globe). The big YOUR WORLD strip stays
 * hidden; this is the visible one.
 *
 * Own drawing, no tiles, no network, no copied asset: a coarse
 * land bitmap (continents as lon/lat boxes, rasterised once) drawn
 * as dots on an orthographic globe. Drag spins it; a tap (no drag)
 * or the button below opens the full World Monitor. Muscat gets a
 * small gold dot — home. Auto-spins slowly when nobody touches it.
 */
import { useEffect, useRef } from 'react';

/** Continents as [lonMin, lonMax, latMin, latMax] boxes — coarse
 *  on purpose: at 200px the dots read as a globe, not a map. */
const LAND_BOXES: [number, number, number, number][] = [
  // North America
  [-168, -140, 60, 71], // Alaska / Yukon
  [-140, -55, 50, 70], // Canada
  [-125, -67, 30, 49], // USA
  [-117, -86, 15, 30], // Mexico
  [-92, -77, 8, 16], // Central America
  [-58, -20, 60, 83], // Greenland
  // South America
  [-78, -52, 0, 11], // north coast
  [-70, -35, -10, 1], // Amazon basin
  [-55, -35, -20, -5], // Brazil east
  [-72, -55, -35, -10], // Andes / south-central
  [-70, -57, -55, -35], // Patagonia / Argentina
  // Europe
  [5, 30, 58, 70], // Scandinavia
  [-5, 2, 50, 58], // UK
  [-10, 30, 43, 55], // W/C Europe
  [-9, 3, 36, 43], // Iberia
  [8, 28, 36, 45], // Italy / Greece / Balkans
  [20, 40, 45, 55], // E Europe
  // Africa
  [-17, 35, 15, 32], // Sahara / Sahel
  [-17, 10, 5, 15], // West Africa
  [8, 30, -5, 12], // Congo basin
  [30, 42, -10, 12], // East Africa
  [12, 35, -35, -10], // Southern Africa
  [43, 50, -25, -12], // Madagascar
  // Middle East
  [35, 58, 12, 30], // Arabia
  [26, 63, 30, 42], // Turkey / Iran
  // Asia
  [30, 180, 50, 70], // Russia / Siberia
  [50, 75, 35, 50], // Central Asia
  [68, 88, 8, 30], // India
  [75, 88, 28, 35], // N India / Nepal
  [95, 105, 8, 25], // SE Asia
  [80, 122, 22, 42], // China
  [95, 141, -10, 5], // Indonesia / New Guinea
  [130, 142, 31, 45], // Japan
  [126, 130, 35, 42], // Korea
  // Oceania
  [113, 153, -39, -11], // Australia
  [166, 178, -47, -34], // New Zealand
  // Antarctica (polar cap)
  [-180, 180, -90, -70],
];

/** Rasterise the boxes once into lon/lat land points (degrees). */
const LAND_POINTS: [number, number][] = (() => {
  const pts: [number, number][] = [];
  const COLS = 96;
  const ROWS = 48;
  for (let r = 0; r < ROWS; r++) {
    const lat = 90 - (r + 0.5) * (180 / ROWS);
    for (let c = 0; c < COLS; c++) {
      const lon = -180 + (c + 0.5) * (360 / COLS);
      for (const [lo0, lo1, la0, la1] of LAND_BOXES) {
        if (lon >= lo0 && lon <= lo1 && lat >= la0 && lat <= la1) {
          pts.push([lon, lat]);
          break;
        }
      }
    }
  }
  return pts;
})();

const MUSCAT: [number, number] = [58.4, 23.6];

export default function MiniGlobe({
  onOpenMonitor,
  size = 200,
}: {
  /** Open the full-screen World Monitor. */
  onOpenMonitor: () => void;
  size?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Rotation in degrees: lon = spin, lat = tilt (clamped).
  const rotRef = useRef({ lon: 58, lat: 16 });
  const dragRef = useRef<{
    x: number;
    y: number;
    lon: number;
    lat: number;
    moved: boolean;
    t: number;
  } | null>(null);
  const lastTouchRef = useRef(0);
  const openRef = useRef(onOpenMonitor);
  openRef.current = onOpenMonitor;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = 2;
    const W = size * dpr;
    const H = size * dpr;
    const R = (size / 2 - 4) * dpr;
    const cx = W / 2;
    const cy = H / 2;
    const D2R = Math.PI / 180;

    let raf = 0;
    const draw = () => {
      // Slow auto-spin when nobody has touched it for a while.
      if (Date.now() - lastTouchRef.current > 2500 && !dragRef.current) {
        rotRef.current.lon = (rotRef.current.lon + 0.08) % 360;
      }
      const lon0 = rotRef.current.lon * D2R;
      const lat0 = rotRef.current.lat * D2R;
      const sinLat0 = Math.sin(lat0);
      const cosLat0 = Math.cos(lat0);

      ctx.clearRect(0, 0, W, H);

      // Ocean disc.
      const grad = ctx.createRadialGradient(
        cx - R * 0.35, cy - R * 0.4, R * 0.1,
        cx, cy, R,
      );
      grad.addColorStop(0, '#155e75');
      grad.addColorStop(0.55, '#0e7490');
      grad.addColorStop(1, '#1e1b4b');
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Land dots (orthographic projection).
      for (const [lonDeg, latDeg] of LAND_POINTS) {
        const lam = lonDeg * D2R - lon0;
        const phi = latDeg * D2R;
        const cosPhi = Math.cos(phi);
        const z = Math.sin(phi) * sinLat0 + cosPhi * cosLat0 * Math.cos(lam);
        if (z <= 0.04) continue;
        const x = cx + R * cosPhi * Math.sin(lam);
        const y = cy - R * (cosLat0 * Math.sin(phi) - sinLat0 * cosPhi * Math.cos(lam));
        const a = 0.35 + 0.65 * z;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1, 2.1 * z) * dpr * 0.62, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(165, 243, 252, ${a.toFixed(2)})`;
        ctx.fill();
      }

      // Muscat — home, a small gold dot.
      {
        const lam = MUSCAT[0] * D2R - lon0;
        const phi = MUSCAT[1] * D2R;
        const cosPhi = Math.cos(phi);
        const z = Math.sin(phi) * sinLat0 + cosPhi * cosLat0 * Math.cos(lam);
        if (z > 0.04) {
          const x = cx + R * cosPhi * Math.sin(lam);
          const y = cy - R * (cosLat0 * Math.sin(phi) - sinLat0 * cosPhi * Math.cos(lam));
          ctx.beginPath();
          ctx.arc(x, y, 3.4 * dpr * 0.62, 0, Math.PI * 2);
          ctx.fillStyle = '#fbbf24';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(x, y, 6 * dpr * 0.62, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(251, 191, 36, 0.6)';
          ctx.lineWidth = 1 * dpr * 0.62;
          ctx.stroke();
        }
      }

      // Rim glow.
      ctx.beginPath();
      ctx.arc(cx, cy, R - 1, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(103, 232, 249, 0.55)';
      ctx.lineWidth = 1.4 * dpr * 0.62;
      ctx.stroke();

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  return (
    <div className="uminiglobe" dir="rtl">
      <canvas
        ref={canvasRef}
        width={size * 2}
        height={size * 2}
        style={{ width: size, height: size }}
        className="uminiglobe-canvas"
        role="img"
        aria-label="دنیا کا نقشہ — ہاتھ سے گھمائیں، کھولنے کے لیے دبائیں"
        title="دنیا — گھمائیں، کھولنے کے لیے دبائیں"
        data-testid="mini-globe"
        onPointerDown={(e) => {
          (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
          dragRef.current = {
            x: e.clientX,
            y: e.clientY,
            lon: rotRef.current.lon,
            lat: rotRef.current.lat,
            moved: false,
            t: Date.now(),
          };
          lastTouchRef.current = Date.now();
        }}
        onPointerMove={(e) => {
          const d = dragRef.current;
          if (!d) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
          rotRef.current.lon = d.lon + dx * 0.45;
          rotRef.current.lat = Math.max(-60, Math.min(60, d.lat - dy * 0.35));
          lastTouchRef.current = Date.now();
        }}
        onPointerUp={(e) => {
          const d = dragRef.current;
          dragRef.current = null;
          lastTouchRef.current = Date.now();
          // A tap (no drag) opens the full World Monitor.
          if (d && !d.moved && Date.now() - d.t < 400) {
            e.currentTarget.releasePointerCapture(e.pointerId);
            openRef.current();
          }
        }}
        onPointerCancel={() => {
          dragRef.current = null;
          lastTouchRef.current = Date.now();
        }}
      />
      <button
        type="button"
        className="uminiglobe-open"
        onClick={onOpenMonitor}
        data-testid="button-open-world-monitor-mini"
      >
        🗺️ ورلڈ مانیٹر
      </button>
      <span className="uminiglobe-caption">دنیا کو ہاتھ سے گھمائیں — کھولنے کے لیے دبائیں</span>
    </div>
  );
}
