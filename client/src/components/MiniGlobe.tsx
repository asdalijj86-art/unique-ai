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
 *
 * 2026-11-25, user's orders: the globe must ZOOM (mouse wheel,
 * pinch-style buttons, double-click) and when he types a city name
 * that city must come to the FRONT of the map, zoomed in, with its
 * name shown. The city list is built in (no network, no geocoder):
 * if a name is not in the list the box says so plainly.
 */
import { useEffect, useRef, useState } from 'react';

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

/** Cities the search knows, built in — [English name, Urdu name, lon, lat].
 *  No network lookup: a name outside this list is reported as not
 *  found, plainly. Home (Muscat) is first and always marked gold. */
const CITIES: { name: string; ur: string; lon: number; lat: number }[] = [
  { name: 'Muscat', ur: 'مسقط', lon: 58.4, lat: 23.6 },
  { name: 'Karachi', ur: 'کراچی', lon: 67.0, lat: 24.86 },
  { name: 'Lahore', ur: 'لاہور', lon: 74.36, lat: 31.52 },
  { name: 'Islamabad', ur: 'اسلام آباد', lon: 73.05, lat: 33.68 },
  { name: 'Rawalpindi', ur: 'راولپنڈی', lon: 73.05, lat: 33.6 },
  { name: 'Peshawar', ur: 'پشاور', lon: 71.58, lat: 34.01 },
  { name: 'Quetta', ur: 'کوئٹہ', lon: 66.99, lat: 30.18 },
  { name: 'Multan', ur: 'ملتان', lon: 71.44, lat: 30.16 },
  { name: 'Faisalabad', ur: 'فیصل آباد', lon: 73.08, lat: 31.42 },
  { name: 'Hyderabad', ur: 'حیدرآباد', lon: 68.36, lat: 25.4 },
  { name: 'Dubai', ur: 'دبئی', lon: 55.27, lat: 25.2 },
  { name: 'Abu Dhabi', ur: 'ابوظہبی', lon: 54.37, lat: 24.45 },
  { name: 'Doha', ur: 'دوحہ', lon: 51.53, lat: 25.29 },
  { name: 'Riyadh', ur: 'ریاض', lon: 46.68, lat: 24.71 },
  { name: 'Jeddah', ur: 'جدہ', lon: 39.17, lat: 21.49 },
  { name: 'Mecca', ur: 'مکہ', lon: 39.82, lat: 21.39 },
  { name: 'Medina', ur: 'مدینہ', lon: 39.61, lat: 24.47 },
  { name: 'Cairo', ur: 'قاہرہ', lon: 31.24, lat: 30.06 },
  { name: 'Istanbul', ur: 'استنبول', lon: 28.98, lat: 41.01 },
  { name: 'Ankara', ur: 'انقرہ', lon: 32.86, lat: 39.93 },
  { name: 'Tehran', ur: 'تہران', lon: 51.39, lat: 35.69 },
  { name: 'Baghdad', ur: 'بغداد', lon: 44.37, lat: 33.31 },
  { name: 'London', ur: 'لندن', lon: -0.13, lat: 51.51 },
  { name: 'Paris', ur: 'پیرس', lon: 2.35, lat: 48.86 },
  { name: 'Berlin', ur: 'برلن', lon: 13.4, lat: 52.52 },
  { name: 'Madrid', ur: 'میڈرڈ', lon: -3.7, lat: 40.42 },
  { name: 'Rome', ur: 'روم', lon: 12.5, lat: 41.9 },
  { name: 'Moscow', ur: 'ماسکو', lon: 37.62, lat: 55.76 },
  { name: 'New York', ur: 'نیویارک', lon: -74.01, lat: 40.71 },
  { name: 'Los Angeles', ur: 'لاس اینجلس', lon: -118.24, lat: 34.05 },
  { name: 'Toronto', ur: 'ٹورنٹو', lon: -79.38, lat: 43.65 },
  { name: 'Mexico City', ur: 'میکسیکو سٹی', lon: -99.13, lat: 19.43 },
  { name: 'São Paulo', ur: 'ساؤ پالو', lon: -46.63, lat: -23.55 },
  { name: 'Buenos Aires', ur: 'بیونس آئرس', lon: -58.38, lat: -34.6 },
  { name: 'Delhi', ur: 'دہلی', lon: 77.21, lat: 28.61 },
  { name: 'Mumbai', ur: 'ممبئی', lon: 72.88, lat: 19.08 },
  { name: 'Dhaka', ur: 'ڈھاکہ', lon: 90.41, lat: 23.81 },
  { name: 'Kathmandu', ur: 'کٹھمنڈو', lon: 85.32, lat: 27.72 },
  { name: 'Bangkok', ur: 'بینکاک', lon: 100.5, lat: 13.76 },
  { name: 'Jakarta', ur: 'جکارتہ', lon: 106.85, lat: -6.21 },
  { name: 'Kuala Lumpur', ur: 'کوالالمپور', lon: 101.69, lat: 3.14 },
  { name: 'Singapore', ur: 'سنگاپور', lon: 103.82, lat: 1.35 },
  { name: 'Beijing', ur: 'بیجنگ', lon: 116.41, lat: 39.9 },
  { name: 'Shanghai', ur: 'شنگھائی', lon: 121.47, lat: 31.23 },
  { name: 'Tokyo', ur: 'ٹوکیو', lon: 139.69, lat: 35.68 },
  { name: 'Seoul', ur: 'سیول', lon: 126.98, lat: 37.57 },
  { name: 'Sydney', ur: 'سڈنی', lon: 151.21, lat: -33.87 },
  { name: 'Melbourne', ur: 'میلبورن', lon: 144.96, lat: -37.81 },
  { name: 'Auckland', ur: 'آکلینڈ', lon: 174.76, lat: -36.85 },
  { name: 'Cape Town', ur: 'کیپ ٹاؤن', lon: 18.42, lat: -33.93 },
  { name: 'Lagos', ur: 'لیگوس', lon: 3.38, lat: 6.52 },
  { name: 'Nairobi', ur: 'نیروبی', lon: 36.82, lat: -1.29 },
];

const ZOOM_MIN = 1;
const ZOOM_MAX = 2.8;
const clampZoom = (z: number) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));

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

  // Zoom + city focus. The draw loop reads the refs; the state
  // drives the buttons and the message line.
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const [query, setQuery] = useState('');
  const [focus, setFocus] = useState<{ name: string; ur: string; lon: number; lat: number } | null>(null);
  const focusRef = useRef<typeof focus>(null);
  const [foundMsg, setFoundMsg] = useState('');
  const [miss, setMiss] = useState(false);
  const animRef = useRef<{
    fromLon: number;
    fromLat: number;
    toLon: number;
    toLat: number;
    start: number;
    dur: number;
  } | null>(null);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  useEffect(() => {
    focusRef.current = focus;
  }, [focus]);

  /** Fly the globe so (lon, lat) sits front and centre. */
  const flyTo = (lon: number, lat: number) => {
    const from = rotRef.current;
    let dLon = lon - from.lon;
    // Shortest way around (wrap at ±180).
    while (dLon > 180) dLon -= 360;
    while (dLon < -180) dLon += 360;
    animRef.current = {
      fromLon: from.lon,
      fromLat: from.lat,
      toLon: from.lon + dLon,
      toLat: Math.max(-60, Math.min(60, lat)),
      start: performance.now(),
      dur: 900,
    };
    lastTouchRef.current = Date.now();
  };

  const searchCity = (q: string) => {
    const needle = q.trim().toLowerCase();
    if (!needle) return;
    const hit =
      CITIES.find((c) => c.name.toLowerCase() === needle || c.ur === q.trim()) ??
      CITIES.find((c) => c.name.toLowerCase().includes(needle) || c.ur.includes(q.trim()));
    if (!hit) {
      setMiss(true);
      setFoundMsg(`«${q.trim()}» فہرست میں نہیں ملا — کوئی اور شہر لکھ کر دیکھیں۔`);
      return;
    }
    setMiss(false);
    setFocus(hit);
    setFoundMsg(`${hit.name} · ${hit.ur} — سامنے آ گیا`);
    setZoom(2.2);
    flyTo(hit.lon, hit.lat);
  };

  const resetView = () => {
    setFocus(null);
    setFoundMsg('');
    setMiss(false);
    setQuery('');
    setZoom(1);
    flyTo(58, 16);
  };

  // Wheel zoom (native listener: React's wheel is passive, so
  // preventDefault would not stop the page scroll).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      lastTouchRef.current = Date.now();
      const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
      setZoom((z) => clampZoom(z * factor));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = 2;
    const W = size * dpr;
    const H = size * dpr;
    const baseR = (size / 2 - 4) * dpr;
    const cx = W / 2;
    const cy = H / 2;
    const D2R = Math.PI / 180;

    const project = (lonDeg: number, latDeg: number, R: number) => {
      const lon0 = rotRef.current.lon * D2R;
      const lat0 = rotRef.current.lat * D2R;
      const sinLat0 = Math.sin(lat0);
      const cosLat0 = Math.cos(lat0);
      const lam = lonDeg * D2R - lon0;
      const phi = latDeg * D2R;
      const cosPhi = Math.cos(phi);
      const z = Math.sin(phi) * sinLat0 + cosPhi * cosLat0 * Math.cos(lam);
      const x = cx + R * cosPhi * Math.sin(lam);
      const y = cy - R * (cosLat0 * Math.sin(phi) - sinLat0 * cosPhi * Math.cos(lam));
      return { x, y, z };
    };

    let raf = 0;
    const draw = () => {
      // Fly-to animation, if one is running.
      const anim = animRef.current;
      if (anim) {
        const t = Math.min(1, (performance.now() - anim.start) / anim.dur);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        rotRef.current.lon = anim.fromLon + (anim.toLon - anim.fromLon) * e;
        rotRef.current.lat = anim.fromLat + (anim.toLat - anim.fromLat) * e;
        if (t >= 1) animRef.current = null;
      } else if (Date.now() - lastTouchRef.current > 2500 && !dragRef.current && zoomRef.current <= 1.01) {
        // Slow auto-spin when idle — only at full-globe zoom, so a
        // zoomed-in city never drifts away on its own.
        rotRef.current.lon = (rotRef.current.lon + 0.08) % 360;
      }
      const R = baseR * zoomRef.current;

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
        const { x, y, z } = project(lonDeg, latDeg, R);
        if (z <= 0.04) continue;
        const a = 0.35 + 0.65 * z;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1, 2.1 * z) * dpr * 0.62, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(165, 243, 252, ${a.toFixed(2)})`;
        ctx.fill();
      }

      // Muscat — home, a small gold dot.
      {
        const { x, y, z } = project(MUSCAT[0], MUSCAT[1], R);
        if (z > 0.04) {
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

      // Focused city — cyan marker + its name written beside it,
      // so the city he typed is seen in front on the map.
      const f = focusRef.current;
      if (f) {
        const { x, y, z } = project(f.lon, f.lat, R);
        if (z > 0.04) {
          ctx.beginPath();
          ctx.arc(x, y, 4.2 * dpr * 0.62, 0, Math.PI * 2);
          ctx.fillStyle = '#22d3ee';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(x, y, 8 * dpr * 0.62, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(34, 211, 238, 0.8)';
          ctx.lineWidth = 1.4 * dpr * 0.62;
          ctx.stroke();
          const label = `${f.name} · ${f.ur}`;
          ctx.font = `600 ${11 * dpr * 0.62}px system-ui, sans-serif`;
          const tw = ctx.measureText(label).width;
          const pad = 5 * dpr * 0.62;
          const lx = Math.min(Math.max(x + 10 * dpr * 0.62, pad), W - tw - pad * 2);
          const ly = Math.max(y - 10 * dpr * 0.62, 12 * dpr * 0.62);
          ctx.fillStyle = 'rgba(2, 6, 16, 0.82)';
          ctx.fillRect(lx - pad, ly - 9 * dpr * 0.62, tw + pad * 2, 18 * dpr * 0.62);
          ctx.fillStyle = '#e0f2fe';
          ctx.fillText(label, lx, ly + 4 * dpr * 0.62);
        }
      }

      // Rim glow (only visible at full-globe zoom).
      if (zoomRef.current <= 1.01) {
        ctx.beginPath();
        ctx.arc(cx, cy, R - 1, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(103, 232, 249, 0.55)';
        ctx.lineWidth = 1.4 * dpr * 0.62;
        ctx.stroke();
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  return (
    <div className="uminiglobe" dir="rtl">
      <form
        className="uminiglobe-search"
        onSubmit={(e) => {
          e.preventDefault();
          searchCity(query);
        }}
      >
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setMiss(false);
          }}
          placeholder="شہر لکھیں… مسقط، کراچی، مکہ"
          aria-label="شہر تلاش کریں"
          data-testid="input-globe-city"
        />
        <button type="submit" data-testid="button-globe-search">🔎 دکھائیں</button>
      </form>
      <canvas
        ref={canvasRef}
        width={size * 2}
        height={size * 2}
        style={{ width: size, height: size }}
        className="uminiglobe-canvas"
        role="img"
        aria-label="دنیا کا نقشہ — ہاتھ سے گھمائیں، پہیے سے زوم کریں، کھولنے کے لیے دبائیں"
        title="دنیا — گھمائیں، زوم کریں، کھولنے کے لیے دبائیں"
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
      <div className="uminiglobe-zoom" dir="ltr">
        <button type="button" onClick={() => setZoom((z) => clampZoom(z / 1.3))} disabled={zoom <= ZOOM_MIN} aria-label="زوم کم کریں" data-testid="button-globe-zoom-out">−</button>
        <button type="button" onClick={() => setZoom((z) => clampZoom(z * 1.3))} disabled={zoom >= ZOOM_MAX} aria-label="زوم زیادہ کریں" data-testid="button-globe-zoom-in">＋</button>
        <button type="button" onClick={resetView} aria-label="مسقط والا منظر واپس لائیں" data-testid="button-globe-reset">⌂ مسقط</button>
        <span aria-hidden="true" style={{ fontSize: 11, color: '#7cc4e4' }}>×{zoom.toFixed(1)}</span>
      </div>
      <p className={`uminiglobe-found${miss ? ' miss' : ''}`} dir="rtl" data-testid="text-globe-found">
        {foundMsg || 'دنیا کو ہاتھ سے گھمائیں — پہیے سے زوم کریں'}
      </p>
      <button
        type="button"
        className="uminiglobe-open"
        onClick={onOpenMonitor}
        data-testid="button-open-world-monitor-mini"
      >
        🗺️ ورلڈ مانیٹر
      </button>
    </div>
  );
}
