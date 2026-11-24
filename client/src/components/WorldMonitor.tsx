/**
 * WorldMonitor — the full-screen World Monitor (2026-11-25, the last
 * Stonic gap but one: Stonic has a full-screen map / layers / news /
 * CCTV view; this is Unique's own build of it).
 *
 * Everything here is REAL or an honest empty state — nothing is
 * faked, anywhere:
 *   - Map: real Leaflet + OpenStreetMap tiles, with a free Esri
 *     satellite layer (no key for either), following MapWidget's
 *     exact pattern (`import L from 'leaflet'` + leaflet.css).
 *   - News: real headlines from the app's own /api/news endpoint
 *     (same fetch as WorldPanel); on failure it says so plainly.
 *   - Weather: real Open-Meteo (free, no key) — the browser's
 *     location when allowed, otherwise Muscat (same as WorldPanel).
 *   - CCTV: there are NO real outside camera feeds, and none is
 *     invented — no fake feed, image or footage. The section shows
 *     the REAL camera MEDIA LINK status (this device's camera:
 *     live / ready / off, passed in as props) plus a plain Urdu
 *     note that no outside cameras are connected.
 *
 * Full-screen overlay over the front; a clear ✕ button closes it
 * back to the front. Fits a 1366x768 laptop: header ~48px, the map
 * takes the remaining height, the side column scrolls internally.
 */

import { useEffect, useRef, useState } from 'react';
import { authFetch } from '@/lib/auth';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { CameraCardStatus } from './FrontExtras';

type NewsItem = { title: string; link: string; source: string };

function wxLabel(code: number): string {
  if (code === 0) return 'صاف آسمان';
  if (code === 1) return 'زیادہ تر صاف';
  if (code === 2) return 'جزوی ابر آلود';
  if (code === 3) return 'ابر آلود';
  if (code === 45 || code === 48) return 'دھند';
  if (code >= 51 && code <= 57) return 'ہلکی بارش';
  if (code >= 61 && code <= 67) return 'بارش';
  if (code >= 71 && code <= 77) return 'برف باری';
  if (code >= 80 && code <= 82) return 'بارش کے چھینٹے';
  if (code === 95) return 'گرج چمک کے ساتھ بارش';
  return 'موسم';
}

type Wx = { temp: number; label: string; place: string };

const OSM_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const ESRI_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

export default function WorldMonitor({
  onClose,
  cameraStatus,
  cameraStatusMessage,
  cameraPermission,
}: {
  /** Close back to the front. */
  onClose: () => void;
  /** REAL status of this device's camera (MEDIA LINK) — the only
   *  camera truth this view may show. No outside feeds exist. */
  cameraStatus: CameraCardStatus;
  cameraStatusMessage: string;
  cameraPermission: boolean;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [layer, setLayer] = useState<'street' | 'satellite'>('street');
  const [showNews, setShowNews] = useState(true);
  const [showWeather, setShowWeather] = useState(true);
  const [news, setNews] = useState<NewsItem[] | null>(null);
  const [wx, setWx] = useState<Wx | 'loading' | 'unavailable'>('loading');
  const [myPlace, setMyPlace] = useState('مسقط');

  // --- Real map (Leaflet, MapWidget's pattern) -------------------------
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    const map = L.map(mapRef.current, {
      center: [23.59, 58.41], // Muscat — home until geolocation says otherwise
      zoom: 5,
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      dragging: true,
      minZoom: 2,
      maxZoom: 19,
      worldCopyJump: true,
    });
    tileLayerRef.current = L.tileLayer(OSM_URL, {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap &copy; Esri',
    }).addTo(map);
    markerRef.current = L.marker([23.59, 58.41]).addTo(map).bindPopup('مسقط');
    mapInstance.current = map;
    // The overlay mounts fresh: give Leaflet a beat to measure its
    // container, or tiles render at the wrong size.
    const t = window.setTimeout(() => map.invalidateSize(), 60);
    return () => {
      window.clearTimeout(t);
      map.remove();
      mapInstance.current = null;
      tileLayerRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Street / satellite switch — swaps the real tile layer, nothing else.
  function switchLayer(next: 'street' | 'satellite') {
    const map = mapInstance.current;
    if (!map || next === layer) return;
    setLayer(next);
    if (tileLayerRef.current) {
      tileLayerRef.current.remove();
      tileLayerRef.current = null;
    }
    tileLayerRef.current = L.tileLayer(next === 'street' ? OSM_URL : ESRI_URL, {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap &copy; Esri',
    }).addTo(map);
  }

  // --- Real news (same /api/news fetch as WorldPanel) ------------------
  useEffect(() => {
    let cancelled = false;
    authFetch('/api/news')
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((j: { items?: NewsItem[] }) => {
        if (!cancelled) setNews(Array.isArray(j.items) ? j.items : []);
      })
      .catch(() => {
        if (!cancelled) setNews([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // --- Real weather (same Open-Meteo pattern as WorldPanel) ------------
  // Geolocation also moves the map marker to the real place; denied
  // or unavailable keeps the honest Muscat fallback.
  useEffect(() => {
    let cancelled = false;
    const load = (lat: number, lon: number, place: string) => {
      fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`,
      )
        .then((r) => {
          if (!r.ok) throw new Error(`weather ${r.status}`);
          return r.json();
        })
        .then((j) => {
          if (cancelled) return;
          const cur = j?.current;
          if (typeof cur?.temperature_2m !== 'number' || typeof cur?.weather_code !== 'number') {
            setWx('unavailable');
            return;
          }
          setWx({ temp: Math.round(cur.temperature_2m), label: wxLabel(cur.weather_code), place });
        })
        .catch(() => {
          if (!cancelled) setWx('unavailable');
        });
      if (!cancelled) {
        setMyPlace(place);
        const map = mapInstance.current;
        if (map) {
          if (markerRef.current) {
            markerRef.current.remove();
            markerRef.current = null;
          }
          markerRef.current = L.marker([lat, lon]).addTo(map).bindPopup(place);
          map.flyTo([lat, lon], 10, { duration: 1 });
        }
      }
    };
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => load(pos.coords.latitude, pos.coords.longitude, 'آپ کی جگہ'),
        () => load(23.59, 58.41, 'مسقط'),
        { timeout: 5000 },
      );
    } else {
      load(23.59, 58.41, 'مسقط');
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const live = cameraStatus === 'looking' || cameraStatus === 'starting';

  return (
    <div className="uwmon" role="dialog" aria-label="ورلڈ مانیٹر" data-testid="world-monitor">
      <header className="uwmon-head" dir="rtl">
        <div className="uwmon-head-text">
          <span className="uwmon-title">🗺️ ورلڈ مانیٹر</span>
          <span className="uwmon-sub">نقشہ · خبریں · موسم · کیمرے — سب اصلی، کچھ جعلی نہیں</span>
        </div>
        <button
          type="button"
          className="uwmon-close"
          onClick={onClose}
          aria-label="ورلڈ مانیٹر بند کریں — فرنٹ پر واپس"
          data-testid="button-close-world-monitor"
        >
          ✕ بند کریں
        </button>
      </header>

      <div className="uwmon-body">
        <div className="uwmon-map-col">
          <div className="uwmon-layers" dir="rtl" role="group" aria-label="نقشے کی پرتیں">
            <button
              type="button"
              className={`uwmon-layer-btn${layer === 'street' ? ' active' : ''}`}
              onClick={() => switchLayer('street')}
              aria-pressed={layer === 'street'}
              data-testid="button-map-layer-street"
            >
              🗺️ سڑک
            </button>
            <button
              type="button"
              className={`uwmon-layer-btn${layer === 'satellite' ? ' active' : ''}`}
              onClick={() => switchLayer('satellite')}
              aria-pressed={layer === 'satellite'}
              data-testid="button-map-layer-satellite"
            >
              🛰️ سیٹلائٹ
            </button>
            <button
              type="button"
              className={`uwmon-layer-btn${showNews ? ' active' : ''}`}
              onClick={() => setShowNews((v) => !v)}
              aria-pressed={showNews}
              data-testid="button-toggle-monitor-news"
            >
              📰 خبریں {showNews ? 'آن' : 'بند'}
            </button>
            <button
              type="button"
              className={`uwmon-layer-btn${showWeather ? ' active' : ''}`}
              onClick={() => setShowWeather((v) => !v)}
              aria-pressed={showWeather}
              data-testid="button-toggle-monitor-weather"
            >
              🌤️ موسم {showWeather ? 'آن' : 'بند'}
            </button>
            <span className="uwmon-place">📍 {myPlace}</span>
          </div>
          <div ref={mapRef} className="uwmon-map" data-testid="world-monitor-map" />
          <p className="uwmon-map-note">نقشہ: OpenStreetMap / Esri سیٹلائٹ — مفت، بغیر کسی چابی کے۔ زوم اور گھمانا چلتا ہے۔</p>
        </div>

        <aside className="uwmon-side" dir="rtl">
          {showNews && (
            <section className="uwmon-card" aria-label="خبریں">
              <div className="uwmon-sec">📰 خبریں</div>
              {news === null ? (
                <p className="uwmon-note">خبریں آ رہی ہیں…</p>
              ) : news.length === 0 ? (
                <>
                  <p className="uwmon-note">لائیو خبریں ابھی نہیں مل سکیں — کوئی جعلی سرخی نہیں دکھائی جا رہی۔</p>
                  <button
                    type="button"
                    className="uwmon-btn"
                    onClick={() => window.open('https://news.google.com', '_blank', 'noopener')}
                    data-testid="button-monitor-news"
                  >
                    📰 Google News کھولیں
                  </button>
                </>
              ) : (
                <ul className="uwmon-news">
                  {news.slice(0, 6).map((n, i) => (
                    <li key={i} className="uwmon-news-item">
                      <a href={n.link} target="_blank" rel="noopener noreferrer" dir="auto" className="uwmon-news-title">
                        {n.title}
                      </a>
                      <span className="uwmon-news-src">{n.source}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {showWeather && (
            <section className="uwmon-card" aria-label="موسم">
              <div className="uwmon-sec">🌤️ موسم — {myPlace}</div>
              {wx === 'loading' ? (
                <p className="uwmon-note">موسم آ رہا ہے…</p>
              ) : wx === 'unavailable' ? (
                <p className="uwmon-note">موسم دستیاب نہیں — انٹرنیٹ چیک کریں۔</p>
              ) : (
                <p className="uwmon-wx">
                  🌡️ {wx.temp}° — {wx.label} · {wx.place}
                </p>
              )}
            </section>
          )}

          <section className="uwmon-card" aria-label="کیمرے">
            <div className="uwmon-sec">📷 کیمرے (CCTV)</div>
            <p className="uwmon-wx">
              اس ڈیوائس کا کیمرہ: <strong>{live ? 'LIVE' : cameraPermission ? 'تیار' : 'بند'}</strong>
              {cameraStatus === 'denied' && ' — اجازت نہیں ملی'}
              {cameraStatus === 'error' && cameraStatusMessage ? ` — ${cameraStatusMessage}` : ''}
            </p>
            <p className="uwmon-note">
              باہر کے کوئی کیمرے جڑے ہوئے نہیں ہیں — نہ کوئی لائیو فیڈ ہے، نہ کوئی تصویر یا فوٹیج۔
              یہاں کوئی جعلی کیمرہ نہیں دکھایا جا رہا۔ باہر کا کیمرہ جڑے گا تو وہیں یہاں آئے گا۔
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
