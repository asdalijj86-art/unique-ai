// MapWidget — interactive world map with location search.
// Uses Leaflet + OpenStreetMap tiles (free, no API key) and Nominatim for geocoding.
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Search, Loader2, MapPin } from 'lucide-react';

const GEO_CACHE_KEY = 'unique-ai-geo-cache';
const GEO_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

function getGeoCache(): Record<string, { lat: number; lon: number; name: string; ts: number }> {
  try {
    return JSON.parse(localStorage.getItem(GEO_CACHE_KEY) || '{}');
  } catch {
    return {};
  }
}

function setGeoCache(query: string, lat: number, lon: number, name: string) {
  try {
    const cache = getGeoCache();
    cache[query.toLowerCase().trim()] = { lat, lon, name, ts: Date.now() };
    // Keep cache small: drop oldest beyond 100 entries
    const keys = Object.keys(cache);
    if (keys.length > 100) {
      keys.sort((a, b) => cache[a].ts - cache[b].ts);
      for (let i = 0; i < keys.length - 100; i++) delete cache[keys[i]];
    }
    localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // storage full or unavailable — skip caching
  }
}

function getCachedGeo(query: string): { lat: number; lon: number; name: string } | null {
  const entry = getGeoCache()[query.toLowerCase().trim()];
  if (entry && Date.now() - entry.ts < GEO_CACHE_TTL) {
    return { lat: entry.lat, lon: entry.lon, name: entry.name };
  }
  return null;
}

export default function MapWidget() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [foundName, setFoundName] = useState('');

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    const map = L.map(mapRef.current, {
      center: [30.3753, 69.3451], // Pakistan center
      zoom: 5,
      zoomControl: true,
      attributionControl: true,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    mapInstance.current = map;
    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, []);

  async function search() {
    const q = query.trim();
    if (!q || searching) return;
    setSearching(true);
    setError('');
    setFoundName('');

    // Detect coordinates: "31.5, 74.3" or "31.5 74.3" → reverse geocode
    const coordMatch = q.match(/^(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)$/);
    try {
      const map = mapInstance.current;
      if (!map) return;
      let lat: number, lon: number, displayName: string;

      // 1) Instant: check local cache first (no network at all)
      const cached = !coordMatch ? getCachedGeo(q) : null;
      if (cached) {
        lat = cached.lat;
        lon = cached.lon;
        displayName = cached.name;
      } else if (coordMatch) {
        lat = parseFloat(coordMatch[1]);
        lon = parseFloat(coordMatch[2]);
        if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
          setError('غلط coordinates ہیں۔');
          return;
        }
        // Reverse geocode for the full address
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=ur`,
          { headers: { Accept: 'application/json' } }
        );
        const data = await res.json();
        displayName = data.display_name || `${lat}, ${lon}`;
      } else {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1&accept-language=ur&addressdetails=1`,
          { headers: { Accept: 'application/json' } }
        );
        const data = await res.json();
        if (!data || data.length === 0) {
          setError('یہ جگہ نہیں ملی۔ کوئی اور نام لکھ کر دیکھیں۔');
          return;
        }
        const place = data[0];
        lat = parseFloat(place.lat);
        lon = parseFloat(place.lon);
        displayName = place.display_name;
        // Cache for instant repeat searches
        setGeoCache(q, lat, lon, displayName);
      }

      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      const icon = L.divIcon({
        className: 'unique-map-pin',
        html: '<div style="font-size:32px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.5))">📍</div>',
        iconSize: [32, 32],
        iconAnchor: [16, 32],
      });
      markerRef.current = L.marker([lat, lon], { icon }).addTo(map);
      map.flyTo([lat, lon], 16, { duration: 0.8 });
      setFoundName(displayName);
    } catch {
      setError('تلاش میں مسئلہ ہوا۔ انٹرنیٹ چیک کریں۔');
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="map-widget" dir="rtl">
      <div className="map-widget-head">
        <MapPin size={16} />
        <span>🗺️ دنیا کا نقشہ</span>
      </div>
      <div className="map-search-row">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
          placeholder="شہر، پتہ، یا coordinates (31.5, 74.3)…"
          className="tool-input map-search-input"
          dir="auto"
        />
        <button type="button" className="tool-action-button" onClick={search} disabled={searching || !query.trim()}>
          {searching ? <Loader2 size={14} className="spin" /> : <Search size={14} />}
        </button>
      </div>
      {error && <div className="tool-error">{error}</div>}
      {foundName && <div className="tool-small-note map-found">📍 {foundName}</div>}
      <div ref={mapRef} className="map-container" />
      <div className="tool-small-note">زوم کریں — جگہ بالکل صاف نظر آئے گی 🔍</div>
    </div>
  );
}
