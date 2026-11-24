/**
 * WorldPanel — the SLIM TOP STRIP of the front (2026-11-25, layout
 * correction: the map goes on TOP, the agents below — not a left
 * column for the map. Order: slim map strip (YOUR WORLD) at the top,
 * the face/interface in the center, Agent Town below the face, chat
 * on one side).
 *
 * Compact, one strip: small globe hint + date + three things short +
 * weather one line + news capped short, and the button that opens
 * the full-screen World Monitor. Everything here is REAL data or an
 * honest empty state:
 *   - Three things: the app's real worldPicks (latest learning, today's
 *     completed work, latest note, today's message count).
 *   - News: real Google News headlines via the app's own /api/news
 *     endpoint; on failure it says so plainly and links Google News.
 *   - Weather: real Open-Meteo (free, no key) — the browser's location
 *     when allowed, otherwise Muscat; on failure it says so plainly.
 *   - When Awareness is OFF, the three things need it ON (Stonic's own
 *     rule) — the strip shows that plainly with a button to turn it on.
 *
 * Own Unique brand and layout; nothing copies Stonic's code, name or
 * exact design.
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

/** Small globe hint — our own drawing (wireframe Earth, violet/blue),
 *  not a copied asset and not a real map. The real map lives in the
 *  full-screen World Monitor. */
function GlobeMini() {
  return (
    <svg viewBox="0 0 120 120" role="img" aria-label="دنیا کا نقشہ — زمین" className="uworld-strip-globe">
      <defs>
        <radialGradient id="uworld-strip-globe-grad" cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#7dd3fc" />
          <stop offset="45%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#1e1b4b" />
        </radialGradient>
      </defs>
      <circle cx="60" cy="60" r="54" fill="url(#uworld-strip-globe-grad)" />
      <g fill="none" stroke="rgba(234, 249, 255, 0.55)" strokeWidth="1">
        <ellipse cx="60" cy="60" rx="54" ry="22" />
        <ellipse cx="60" cy="60" rx="22" ry="54" />
        <line x1="6" y1="60" x2="114" y2="60" />
      </g>
      <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(167, 139, 250, 0.7)" strokeWidth="1.5" />
      <circle cx="76" cy="48" r="3.5" fill="#22d3ee" />
    </svg>
  );
}

export default function WorldPanel({
  awarenessEnabled,
  picks,
  onEnableAwareness,
  onOpenMonitor,
}: {
  /** Awareness switch state — the three things need it ON. */
  awarenessEnabled: boolean;
  /** Real picks from the app (learnings, today's work, notes). */
  picks: WorldPick[];
  /** Turn Awareness on (title-bar switch does the same). */
  onEnableAwareness: () => void;
  /** Open the full-screen World Monitor. */
  onOpenMonitor: () => void;
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
    <div className="uworld-strip" data-testid="world-panel" dir="rtl">
      <div className="uworld-strip-brand">
        <GlobeMini />
        <div className="uworld-strip-titles">
          <span className="uworld-strip-title">🌍 تمہاری دنیا <span className="uworld-strip-title-en">YOUR WORLD</span></span>
          <span className="uworld-strip-date">{today}</span>
        </div>
      </div>

      <div className="uworld-strip-sep" aria-hidden="true" />

      <div className="uworld-strip-picks" aria-label="آج آپ کے لیے تین چیزیں">
        {!awarenessEnabled ? (
          <span className="uworld-strip-note" data-testid="world-unawareness">
            🙈 آگاہی بند ہے — تین چیزیں دیکھنے کے لیے Awareness آن کریں۔
            <button type="button" className="uworld-strip-mini-btn" onClick={onEnableAwareness} data-testid="button-world-enable-awareness">
              👁️ Awareness آن کریں
            </button>
          </span>
        ) : picks.length === 0 ? (
          <span className="uworld-strip-note">ابھی یہاں کچھ نہیں — جیسے ہی کچھ سیکھوں گی، وہ یہاں آ جائے گا۔</span>
        ) : (
          picks.slice(0, 3).map((p, i) => (
            <span key={i} className="uworld-strip-pick" title={`${p.title} — ${p.detail}`}>
              <strong>{p.title}</strong> {p.detail}
            </span>
          ))
        )}
      </div>

      <div className="uworld-strip-sep" aria-hidden="true" />

      <div className="uworld-strip-news" aria-label="خبریں">
        {news === null ? (
          <span className="uworld-strip-note">📰 خبریں آ رہی ہیں…</span>
        ) : news.length === 0 ? (
          <span className="uworld-strip-note">
            📰 لائیو خبریں ابھی نہیں مل سکیں — کوئی جعلی سرخی نہیں۔
          </span>
        ) : (
          news.slice(0, 2).map((n, i) => (
            <a key={i} href={n.link} target="_blank" rel="noopener noreferrer" dir="auto" className="uworld-strip-news-item" title={n.title}>
              📰 {n.title}
            </a>
          ))
        )}
      </div>

      <div className="uworld-strip-sep" aria-hidden="true" />

      <span className="uworld-strip-wx" aria-label="موسم">
        {wx === 'loading'
          ? '🌤️ موسم آ رہا ہے…'
          : wx === 'unavailable'
            ? '🌤️ موسم دستیاب نہیں'
            : `🌡️ ${wx.temp}° — ${wx.label} · ${wx.place}`}
      </span>

      <button
        type="button"
        className="uworld-strip-monitor-btn"
        onClick={onOpenMonitor}
        data-testid="button-open-world-monitor"
      >
        🗺️ ورلڈ مانیٹر
      </button>
    </div>
  );
}
