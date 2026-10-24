import { useEffect, useRef, useState } from 'react';
import type { ChatAction } from '@/lib/api';

// ---------------------------------------------------------------------------
// ToolResults — renders professional toolbox action payloads in Urdu.
// Timer and notes are executed client-side here.
// ---------------------------------------------------------------------------

type Note = { id: string; text: string; createdAt: string };

const NOTES_KEY = 'unique-ai-notes';

function loadNotes(): Note[] {
  try {
    const raw = localStorage.getItem(NOTES_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveNotes(notes: Note[]) {
  try {
    localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
  } catch {
    // storage unavailable — notes just won't persist
  }
}

function formatCountdown(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function TimerView({ seconds, label, onDone }: { seconds: number; label: string; onDone: () => void }) {
  const [left, setLeft] = useState(seconds);
  const doneRef = useRef(false);
  useEffect(() => {
    setLeft(seconds);
    doneRef.current = false;
  }, [seconds]);
  useEffect(() => {
    if (left <= 0) {
      if (!doneRef.current) {
        doneRef.current = true;
        // Beep via WebAudio.
        try {
          const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          const ctx = new Ctx();
          [0, 0.25, 0.5].forEach((delay) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 880;
            osc.start(ctx.currentTime + delay);
            osc.stop(ctx.currentTime + delay + 0.2);
          });
        } catch {
          // audio unavailable
        }
        onDone();
      }
      return;
    }
    const t = setTimeout(() => setLeft((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [left, onDone]);
  const pct = seconds > 0 ? Math.round(((seconds - left) / seconds) * 100) : 100;
  return (
    <div dir="rtl" data-testid="tool-timer">
      <div className="tool-timer-label">⏰ ٹائمر: {label}</div>
      <div className="tool-timer-digits" data-testid="text-timer-countdown">
        {left <= 0 ? 'ختم!' : formatCountdown(left)}
      </div>
      <div className="tool-progress">
        <div className="tool-progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function NotesView({ initialText, mode }: { initialText?: string; mode: 'save' | 'list' }) {
  const [notes, setNotes] = useState<Note[]>(() => loadNotes());
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (mode === 'save' && initialText && !saved) {
      const note: Note = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        text: initialText,
        createdAt: new Date().toISOString(),
      };
      const next = [note, ...loadNotes()];
      saveNotes(next);
      setNotes(next);
      setSaved(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  const removeNote = (id: string) => {
    const next = notes.filter((n) => n.id !== id);
    saveNotes(next);
    setNotes(next);
  };
  if (notes.length === 0) {
    return <div dir="rtl" className="tool-empty">ابھی کوئی نوٹ نہیں ہے۔</div>;
  }
  return (
    <div dir="rtl" data-testid="tool-notes">
      {notes.map((n) => (
        <div key={n.id} className="tool-note">
          <div className="tool-note-text">{n.text}</div>
          <button
            type="button"
            className="tool-note-delete"
            onClick={() => removeNote(n.id)}
            aria-label="نوٹ حذف کریں"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

// A document a tool generated (CV / invoice / assignment) that the
// user asked to download in chat. The button builds the REAL PDF in
// the browser from the stored document HTML (lib/doc-pdf) — this card
// is what replaced the old "میرے پاس permission نہیں ہے" dead end.
function DocDownloadView({ title, filename, html }: { title: string; filename: string; html: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function go() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const { downloadDocumentPdf } = await import('@/lib/doc-pdf');
      await downloadDocumentPdf(html, filename);
      setDone(true);
    } catch {
      setError('PDF بنانے میں مسئلہ ہوا — دوبارہ کوشش کریں، یا ٹول کھول کر وہاں سے ڈاؤن لوڈ کریں۔');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="doc-download-card">
      <div className="tool-text-block">📄 {title}</div>
      <button type="button" className="tool-action-button" onClick={go} disabled={busy} data-testid="button-doc-download">
        {busy ? 'PDF بن رہا ہے…' : '📥 PDF ڈاؤن لوڈ کریں'}
      </button>
      {done && <div className="tool-small-note">✅ ڈاؤن لوڈ شروع ہو گیا — فائل آپ کے آلے میں محفوظ ہو جائے گی۔</div>}
      {error && <div className="tool-error">{error}</div>}
    </div>
  );
}

// A brain-builder job (Phase 3 — احمد's workshop): the user ordered a
// game / app / website / small AI by voice or chat, and the server is
// building it in the background. This card polls the job's REAL status
// (GET /api/build/status/:id) — it never claims progress it hasn't
// seen. When the job finishes, validated server-side, the card shows
// «کھولیں» (the /apps/:id link) + «ڈاؤن لوڈ» (the file itself) and
// tells the parent ONCE so it can speak «آپ کی چیز ریڈی ہو گئی ہے» —
// but only for a build this card actually watched finish; a card
// opened later (from a status question) stays quiet because the chat
// reply itself already said it. A failed job shows the honest failure.
// Storage honesty is printed on the card: the link lives only while
// the server runs, the download is forever.
type BuildJobStatus = {
  id: string;
  title: string;
  kind: string;
  status: 'building' | 'repairing' | 'done' | 'failed';
  url?: string;
  downloadUrl?: string;
  error?: string;
};

function BuildAppView({ jobId, title, onReady, onFailed, onSettled }: { jobId: string; title: string; onReady?: (title: string) => void; onFailed?: (title: string) => void; onSettled?: (title: string) => void }) {
  const [job, setJob] = useState<BuildJobStatus | null>(null);
  const [gone, setGone] = useState(false);
  const sawBuildingRef = useRef(false);
  const readyFiredRef = useRef(false);
  const failedFiredRef = useRef(false);
  const settledFiredRef = useRef(false);
  // Tell the parent ONCE that this watched build is over without a
  // product (failed, or the job vanished in a server restart) — the
  // office scene lights احمد only while a build truly runs, so it
  // must hear about endings that are not «done» too.
  useEffect(() => {
    if ((gone || job?.status === 'failed') && !failedFiredRef.current) {
      failedFiredRef.current = true;
      onFailed?.(title);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gone, job?.status]);
  // Settled = the job reached ANY terminal state (done/failed/gone),
  // including a card mounted after the job had already finished (a
  // build-status replay): the parent's live-build light must go out.
  useEffect(() => {
    const terminal = gone || job?.status === 'done' || job?.status === 'failed';
    if (terminal && !settledFiredRef.current) {
      settledFiredRef.current = true;
      onSettled?.(title);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gone, job?.status]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const res = await fetch(`/api/build/status/${encodeURIComponent(jobId)}`);
        if (cancelled) return;
        if (res.status === 404) {
          setGone(true);
          return;
        }
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as BuildJobStatus;
        if (cancelled) return;
        setJob(data);
        if (data.status === 'building' || data.status === 'repairing') {
          sawBuildingRef.current = true;
          timer = setTimeout(poll, 3000);
        } else if (data.status === 'done' && sawBuildingRef.current && !readyFiredRef.current) {
          readyFiredRef.current = true;
          onReady?.(data.title || title);
        }
      } catch {
        // A transient poll failure says nothing about the job — keep
        // polling quietly rather than declaring a false failure.
        if (!cancelled) timer = setTimeout(poll, 4000);
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  if (gone) {
    return (
      <div data-testid="build-app-card">
        <div className="tool-text-block">🛠️ احمد — بلڈر ایجنٹ</div>
        <div className="tool-error">یہ تعمیر نہیں مل سکی — شاید سرور ری اسٹارٹ ہو گیا ہے۔ چیٹ میں دوبارہ کہہ دیں، احمد پھر بنا دے گا۔</div>
      </div>
    );
  }

  const status = job?.status;
  return (
    <div data-testid="build-app-card">
      <div className="tool-text-block">🛠️ احمد — بلڈر ایجنٹ</div>
      <div className="tool-text-block">«{job?.title || title}»</div>
      {(status === undefined || status === 'building') && (
        <div className="tool-small-note" data-testid="build-app-status">⏳ احمد بنا رہا ہے…</div>
      )}
      {status === 'repairing' && (
        <div className="tool-small-note" data-testid="build-app-status">🔧 آخری جانچ میں کمی رہ گئی تھی — احمد ٹھیک کر رہا ہے…</div>
      )}
      {status === 'failed' && (
        <div data-testid="build-app-status">
          <div className="tool-error">معذرت، یہ چیز نہیں بن سکی۔ دوبارہ کہہ کر دیکھیں — اکثر دوسری بار بن جاتی ہے۔</div>
        </div>
      )}
      {status === 'done' && job && (
        <div data-testid="build-app-status">
          <div className="tool-text-block">✅ آپ کی چیز ریڈی ہو گئی ہے</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a href={job.url} target="_blank" rel="noopener noreferrer" className="tool-action-button" data-testid="button-build-open">
              🌐 کھولیں
            </a>
            <a href={job.downloadUrl} download className="tool-action-button" data-testid="button-build-download">
              📥 ڈاؤن لوڈ
            </a>
          </div>
          <div className="tool-small-note">لنک سرور چلنے تک رہے گا — فائل ڈاؤن لوڈ کر کے ہمیشہ کے لیے رکھ لیں۔</div>
        </div>
      )}
    </div>
  );
}

export default function ToolResults({
  action,
  onClose,
  onTimerDone,
  onBuildReady,
  onBuildFailed,
  onBuildSettled,
}: {
  action: ChatAction;
  onClose: () => void;
  onTimerDone: () => void;
  onBuildReady?: (title: string) => void;
  onBuildFailed?: (title: string) => void;
  onBuildSettled?: (title: string) => void;
}) {
  return (
    <div className="tool-results" dir="rtl" data-testid="panel-tool-results" role="region" aria-label="ٹول کا نتیجہ">
      <div className="tool-results-head">
        <span className="tool-results-title">
          {action.type === 'open_link' && '🌐 ویب سائٹ'}
          {action.type === 'search_results' && '🔍 تلاش کے نتائج'}
          {action.type === 'weather' && '🌤️ موسم'}
          {action.type === 'youtube_results' && '▶️ یوٹیوب ویڈیوز'}
          {action.type === 'news_results' && '📰 تازہ خبریں'}
          {action.type === 'social_news_results' && '📱 سوشل میڈیا لائیو خبریں'}
          {action.type === 'calc_result' && '🧮 کیلکولیٹر'}
          {action.type === 'currency_result' && '💱 کرنسی'}
          {action.type === 'set_timer' && '⏰ ٹائمر'}
          {(action.type === 'save_note' || action.type === 'list_notes') && '📝 نوٹس'}
          {action.type === 'prayer_times' && '🕌 نماز کے اوقات'}
          {action.type === 'translate_result' && '🌐 ترجمہ'}
          {action.type === 'unit_convert' && '📏 اکائی تبدیلی'}
          {action.type === 'qr_code' && '⬛ QR کوڈ'}
          {action.type === 'video_ideas' && '💡 ویڈیو آئیڈیاز'}
          {action.type === 'world_clock' && '🕐 عالمی وقت'}
          {action.type === 'page_summary' && '📄 صفحے کا خلاصہ'}
          {action.type === 'doc_download' && '📄 دستاویز ڈاؤن لوڈ'}
          {action.type === 'build_app' && '🛠️ بلڈر — احمد'}
        </span>
        <button type="button" className="tool-results-close" onClick={onClose} aria-label="بند کریں">
          ✕
        </button>
      </div>
      <div className="tool-results-body">
        {action.type === 'open_link' && (
          <div>
            {/* Tappable label, never a raw URL in chat text: the tap is
                a real user gesture, so target=_blank always opens —
                unlike the programmatic window.open the popup blocker
                used to kill. */}
            <a href={action.url} target="_blank" rel="noopener noreferrer" className="tool-link-card">
              <div className="tool-link-title">🌐 {action.displayName} کھولیں</div>
              <div className="tool-link-snippet">کھولنے کے لیے یہاں دبائیں</div>
            </a>
          </div>
        )}

        {action.type === 'search_results' && (
          <div>
            {action.results.map((r, i) => (
              <a key={i} href={r.url} target="_blank" rel="noopener noreferrer" className="tool-link-card">
                <div className="tool-link-title">{r.title}</div>
                {r.snippet && <div className="tool-link-snippet">{r.snippet}</div>}
              </a>
            ))}
          </div>
        )}

        {action.type === 'weather' && (
          <div className="tool-weather-card">
            <div className="tool-weather-city">{action.city}</div>
            <div className="tool-weather-temp">{action.tempC}°C</div>
            <div className="tool-weather-desc">{action.conditionUr}</div>
            <div className="tool-weather-meta">
              <span>نمی: {action.humidity}%</span>
              <span>ہوا: {action.windKmph} کلومیٹر/گھنٹہ</span>
            </div>
          </div>
        )}

        {action.type === 'youtube_results' && (
          <div className="tool-video-grid">
            {action.videos.map((v, i) => (
              <a key={i} href={v.url} target="_blank" rel="noopener noreferrer" className="tool-video-card">
                <img src={v.thumbnail} alt="" loading="lazy" className="tool-video-thumb" />
                <div className="tool-video-title">{v.title}</div>
                {v.author && <div className="tool-video-author">{v.author}</div>}
              </a>
            ))}
          </div>
        )}

        {(action.type === 'news_results' || action.type === 'social_news_results') && (
          <div>
            {action.headlines.map((h, i) => (
              <a key={i} href={h.url} target="_blank" rel="noopener noreferrer" className="tool-link-card">
                <div className="tool-link-title">{h.title}</div>
                {h.snippet && <div className="tool-link-snippet">{h.snippet}</div>}
              </a>
            ))}
          </div>
        )}

        {action.type === 'calc_result' && (
          <div className="tool-big-result" dir="ltr" data-testid="text-calc-result">
            {action.expression} = <strong>{action.result}</strong>
          </div>
        )}

        {action.type === 'currency_result' && (
          <div className="tool-big-result" dir="ltr" data-testid="text-currency-result">
            {action.amount} {action.from} = <strong>{action.result} {action.to}</strong>
            <div className="tool-small-note">ریٹ: 1 {action.from} = {action.rate} {action.to}</div>
          </div>
        )}

        {action.type === 'set_timer' && (
          <TimerView seconds={action.seconds} label={action.label} onDone={onTimerDone} />
        )}

        {action.type === 'save_note' && <NotesView mode="save" initialText={action.text} />}
        {action.type === 'list_notes' && <NotesView mode="list" />}

        {action.type === 'prayer_times' && (
          <div className="tool-prayer-card">
            <div className="tool-prayer-city">{action.city}</div>
            {action.hijri && <div className="tool-small-note">{action.hijri}</div>}
            <div className="tool-prayer-grid">
              {[
                ['فجر', action.times.Fajr],
                ['طلوع', action.times.Sunrise],
                ['ظہر', action.times.Dhuhr],
                ['عصر', action.times.Asr],
                ['مغرب', action.times.Maghrib],
                ['عشاء', action.times.Isha],
              ].map(([name, time]) => (
                <div key={name} className="tool-prayer-row">
                  <span>{name}</span>
                  <strong dir="ltr">{time}</strong>
                </div>
              ))}
            </div>
          </div>
        )}

        {action.type === 'translate_result' && (
          <div>
            <div className="tool-label">اصل:</div>
            <div className="tool-text-block">{action.original}</div>
            <div className="tool-label">ترجمہ:</div>
            <div className="tool-text-block tool-translated" data-testid="text-translation">
              {action.translated}
            </div>
          </div>
        )}

        {action.type === 'unit_convert' && (
          <div className="tool-big-result" dir="ltr" data-testid="text-unit-result">
            {action.amount} {action.fromUr} = <strong>{action.result} {action.toUr}</strong>
          </div>
        )}

        {action.type === 'qr_code' && (
          <div className="tool-qr-wrap">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(action.data)}`}
              alt="QR کوڈ"
              className="tool-qr-img"
              data-testid="img-qr-code"
            />
            <div className="tool-small-note">{action.data}</div>
          </div>
        )}

        {action.type === 'video_ideas' && (
          <div className="tool-text-block tool-ideas" data-testid="text-video-ideas" style={{ whiteSpace: 'pre-wrap' }}>
            {action.ideas}
          </div>
        )}

        {action.type === 'world_clock' && (
          <div className="tool-clock-card">
            <div className="tool-clock-city">{action.city}</div>
            <div className="tool-clock-time" dir="ltr" data-testid="text-world-time">{action.time}</div>
            <div className="tool-small-note">{action.date}</div>
          </div>
        )}

        {action.type === 'page_summary' && (
          <div>
            <a href={action.url} target="_blank" rel="noopener noreferrer" className="tool-link-card">
              <div className="tool-link-title">{action.title}</div>
            </a>
            <div className="tool-text-block" data-testid="text-page-summary" style={{ whiteSpace: 'pre-wrap' }}>
              {action.summary}
            </div>
          </div>
        )}

        {action.type === 'doc_download' && (
          <DocDownloadView title={action.title} filename={action.filename} html={action.html} />
        )}

        {action.type === 'build_app' && (
          <BuildAppView jobId={action.jobId} title={action.title} onReady={onBuildReady} onFailed={onBuildFailed} onSettled={onBuildSettled} />
        )}
      </div>
    </div>
  );
}
