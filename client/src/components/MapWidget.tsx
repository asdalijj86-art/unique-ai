// MapWidget — interactive world map with location search.
// Uses Leaflet + OpenStreetMap tiles (free, no API key) and Nominatim for geocoding.
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Search, Loader2, MapPin } from 'lucide-react';

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
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1&accept-language=ur`,
        { headers: { Accept: 'application/json' } }
      );
      const data = await res.json();
      if (!data || data.length === 0) {
        setError('یہ جگہ نہیں ملی۔ کوئی اور نام لکھ کر دیکھیں۔');
        return;
      }
      const place = data[0];
      const lat = parseFloat(place.lat);
      const lon = parseFloat(place.lon);
      const map = mapInstance.current;
      if (!map) return;
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
      map.flyTo([lat, lon], 15, { duration: 1.5 });
      setFoundName(place.display_name);
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
          placeholder="شہر، گاؤں، پتہ لکھیں…"
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
