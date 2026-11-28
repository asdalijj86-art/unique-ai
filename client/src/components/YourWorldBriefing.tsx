/**
 * YourWorldBriefing — "YOUR WORLD" DAILY BRIEFING (Phase 2, Stonic:
 * "once a day, Stonic reads what it remembers about you, searches
 * the web for the things you care about, and leaves you three short
 * picks with a summary").
 *
 * Three picks, once a day, from real inputs only (latest learning,
 * today's work / latest note, top live news headline). Cached by
 * date — it does not change during the day. Collapsed by default so
 * the front stays compact at 1366×768.
 */

import { useEffect, useMemo, useState } from 'react';
import { secureAppStorage } from '@/lib/secure-app-storage';
import {
  briefingDateKey,
  briefingSummary,
  buildDailyBriefing,
  loadBriefing,
  saveBriefing,
} from '@/lib/your-world';

export default function YourWorldBriefing({
  latestLearning,
  latestNote,
  todayWork,
  topNews,
}: {
  latestLearning: string | null;
  latestNote: string | null;
  todayWork: { title: string; detail: string } | null;
  topNews: { title: string; link: string } | null;
}) {
  const [open, setOpen] = useState(false);
  const [briefing, setBriefing] = useState(() => loadBriefing(secureAppStorage));

  // Build once per day, from whatever real inputs exist right now.
  // If the news has not loaded yet, the briefing builds without it
  // and rebuilds (same day) once news arrives — still once per day
  // per news state, never invented.
  const inputsKey = useMemo(
    () => [latestLearning ?? '', latestNote ?? '', todayWork?.title ?? '', topNews?.title ?? ''].join('|'),
    [latestLearning, latestNote, todayWork?.title, topNews?.title],
  );

  useEffect(() => {
    const today = briefingDateKey();
    const cached = loadBriefing(secureAppStorage);
    if (cached && cached.date === today) {
      setBriefing(cached);
      return;
    }
    const picks = buildDailyBriefing({ latestLearning, latestNote, todayWork, topNews });
    const next = { date: today, picks };
    saveBriefing(secureAppStorage, next);
    setBriefing(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputsKey]);

  const summary = briefingSummary(briefing);
  const picks = briefing?.picks ?? [];

  return (
    <div className="uworld-briefing" data-testid="your-world-briefing" dir="rtl">
      <button
        type="button"
        className="uworld-briefing-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid="button-briefing-toggle"
      >
        <span className="uworld-briefing-title">🌍 آج کی دنیا — 3 چیزیں</span>
        <span className="uworld-briefing-toggle">{open ? '▲' : '▼'}</span>
      </button>
      {!open && <p className="uworld-briefing-summary">{summary}</p>}
      {open && (
        picks.length === 0 ? (
          <p className="uworld-briefing-empty">
            آج کے لیے ابھی تین چیزیں تیار نہیں — جیسے ہی آپ مجھے کچھ سکھائیں گے یا کوئی خبر آئے گی، وہ یہاں آ جائے گی۔ کچھ بھی بناوٹی نہیں لکھا جاتا۔
          </p>
        ) : (
          <ul className="uworld-briefing-list">
            {picks.map((p, i) => (
              <li key={i} className="uworld-briefing-item">
                <strong>{i + 1}. {p.title}:</strong> {p.detail}
                {p.source === 'news' && topNews ? (
                  <a href={topNews.link} target="_blank" rel="noopener noreferrer" className="uworld-briefing-link"> — خبر کھولیں ↗</a>
                ) : null}
              </li>
            ))}
          </ul>
        )
      )}
      {open && <p className="uworld-briefing-src">آپ کی اپنی یادوں اور لائیو خبروں سے — روز ایک بار۔</p>}
    </div>
  );
}
