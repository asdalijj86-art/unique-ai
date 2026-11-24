/**
 * WorldPanel — the LEFT column of the front (2026-11-25, from the
 * Stonic front screenshot the user sent: Stonic AI v3.1.24).
 *
 *   YOUR WORLD — a globe, "Three things for you today", news cards,
 *   and the weather where you are ("Around you").
 *
 * Own Unique brand and layout; nothing copies Stonic's code, name or
 * exact design. Everything here is REAL data or an honest empty state:
 *   - Three things: the app's real worldPicks (latest learning, today's
 *     completed work, latest note, today's message count).
 *   - News: real Google News headlines via the app's own /api/news
 *     endpoint; on failure it says so plainly and links Google News.
 *   - Weather: real Open-Meteo (free, no key) — the browser's location
 *     when allowed, otherwise Muscat; on failure it says so plainly.
 *   - When Awareness is OFF, the three things need it ON (Stonic's own
 *     rule: news under Your world appears "when Awareness is on") — so
 *     the panel shows the unawareness state and a button to turn it on.
 *     The AI never looks at the screen or camera on its own when off.
 */

import { useEffect, useState } from 'react';
import type { WorldPick } from './VisualHub';

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

/** Stylized globe — our own drawing (wireframe Earth, violet/blue),
 *  not a copied asset and not a real map. */
function Globe() {
  return (
    <svg viewBox="0 0 120 120" role="img" aria-label="دنیا کا نقشہ — زمین" className="uworld-globe-svg">
      <defs>
        <radialGradient id="uworld-globe-grad" cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#7dd3fc" />
          <stop offset="45%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#1e1b4b" />
        </radialGradient>
      </defs>
      <circle cx="60" cy="60" r="54" fill="url(#uworld-globe-grad)" />
      <g fill="none" stroke="rgba(234, 249, 255, 0.55)" strokeWidth="1">
        <ellipse cx="60" cy="60" rx="54" ry="22" />
        <ellipse cx="60" cy="60" rx="54" ry="42" />
        <ellipse cx="60" cy="60" rx="22" ry="54" />
        <ellipse cx="60" cy="60" rx="42" ry="54" />
        <line x1="6" y1="60" x2="114" y2="60" />
      </g>
      <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(167, 139, 250, 0.7)" strokeWidth="1.5" />
      <circle cx="76" cy="48" r="3.5" fill="#f9a8d4" className="uworld-globe-you" />
      <circle cx="76" cy="48" r="7" fill="none" stroke="#f9a8d4" strokeWidth="1" opacity="0.6" />
    </svg>
  );
}

export default function WorldPanel({
  awarenessEnabled,
  picks,
  onEnableAwareness,
}: {
  /** Awareness switch state — the three things need it ON. */
  awarenessEnabled: boolean;
  /** Real picks from the app (learnings, today's work, notes). */
  picks: WorldPick[];
  /** Turn Awareness on (title-bar switch does the same). */
  onEnableAwareness: () => void;
}) {
  const [news, setNews] = useState<NewsItem[] | null>(null);
  const [wx, setWx] = useState<Wx | 'loading' | 'unavailable'>('loading');

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  // Real headlines from the app's own /api/news endpoint.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/news')
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

  // Real weather (Open-Meteo, free, no key): the browser's location
  // when allowed, otherwise Muscat. Never invented.
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
    };
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => load(pos.coords.latitude, pos.coords.longitude, 'آپ کے علاقے'),
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

  return (
    <div className="uworld-col" data-testid="world-panel">
      <section className="uworld" dir="rtl" aria-label="تمہاری دنیا">
        <div className="uworld-head">
          <span className="uworld-title">🌍 تمہاری دنیا</span>
          <span className="uworld-title-en">YOUR WORLD</span>
        </div>
        <p className="uworld-date">{today}</p>
        <div className="uworld-globe">
          <Globe />
        </div>

        <div className="uworld-sec">✨ آج آپ کے لیے تین چیزیں</div>
        {!awarenessEnabled ? (
          <div className="uworld-off" data-testid="world-unawareness">
            <p className="uworld-note">
              🙈 آگاہی بند ہے — تین چیزیں دیکھنے کے لیے Awareness آن کریں۔ آگاہی بند ہو تو یونیکا
              خود کچھ نہیں دیکھتی اور صرف آپ کے بلانے پر بولتی ہے۔
            </p>
            <button type="button" className="uworld-btn" onClick={onEnableAwareness} data-testid="button-world-enable-awareness">
              👁️ Awareness آن کریں
            </button>
          </div>
        ) : picks.length === 0 ? (
          <p className="uworld-empty">
            ابھی یہاں کچھ نہیں — جیسے ہی آپ مجھے کچھ سکھائیں گے، کوئی کام مکمل ہوگا یا کوئی یادداشت
            بنے گی، وہ یہاں آ جائے گی۔
          </p>
        ) : (
          <ul className="uworld-picks">
            {picks.map((p, i) => (
              <li key={i} className="uworld-pick">
                <span className="uworld-pick-title">{p.title}</span>
                <span className="uworld-pick-detail">{p.detail}</span>
                <span className="uworld-pick-source">{p.source} سے</span>
              </li>
            ))}
          </ul>
        )}

        <div className="uworld-sec">📰 خبریں</div>
        {news === null ? (
          <p className="uworld-note">خبریں آ رہی ہیں…</p>
        ) : news.length === 0 ? (
          <>
            <p className="uworld-note">لائیو خبریں ابھی نہیں مل سکیں — کوئی جعلی سرخی نہیں دکھائی جا رہی۔</p>
            <button
              type="button"
              className="uworld-btn"
              onClick={() => window.open('https://news.google.com', '_blank', 'noopener')}
              data-testid="button-world-news"
            >
              📰 Google News کھولیں
            </button>
          </>
        ) : (
          <ul className="uworld-news">
            {news.map((n, i) => (
              <li key={i} className="uworld-news-item">
                <a href={n.link} target="_blank" rel="noopener noreferrer" dir="auto" className="uworld-news-title">
                  {n.title}
                </a>
                <span className="uworld-news-src">{n.source}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="uworld-sec">🌤️ آپ کے آس پاس — موسم</div>
        {wx === 'loading' ? (
          <p className="uworld-note">موسم آ رہا ہے…</p>
        ) : wx === 'unavailable' ? (
          <p className="uworld-note">موسم دستیاب نہیں — انٹرنیٹ چیک کریں۔</p>
        ) : (
          <p className="uworld-wx">
            🌡️ {wx.temp}° — {wx.label} · {wx.place}
          </p>
        )}
      </section>
    </div>
  );
}
