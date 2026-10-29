// VideoJobIndicator — the ALWAYS-VISIBLE work sign (2026-10-29).
//
// The user asked: whenever any work is engaged, some sign must be
// visible in front showing that work is happening, so false
// reassurance is impossible. This bar sits under the top bar on the
// main chat view and is driven ONLY by the Video Maker's real job
// store (localStorage, unique-ai-video-maker-job) — never by a chat
// reply, never by a guess:
// - building/rendering → a prominent animated bar: job title, stage,
//   and scene X/Y, updated every second from the store.
// - done → a green "video ready" line (download lives in the maker).
// - failed → a red line with the real failure reason, no link.
// - no job → a small muted line: no job is running. It NEVER shows
//   a fake "working" sign when idle.
// The app/game builder job is NOT shown here: its job lives only in
// the server's memory and in its own polling card, not in a shared
// store this bar could read honestly — plumbing it in would need a
// persisted builder-job store first (see the final report note).

import { useEffect, useState } from 'react';
import { loadVideoMakerJob, type VideoJobState } from '@/lib/video-maker';

function readJob(): VideoJobState | null {
  try {
    return loadVideoMakerJob(window.localStorage);
  } catch {
    return null;
  }
}

export default function VideoJobIndicator() {
  const [job, setJob] = useState<VideoJobState | null>(() => readJob());

  useEffect(() => {
    const refresh = () => setJob(readJob());
    refresh();
    const timer = window.setInterval(refresh, 1000);
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key.includes('video-maker')) refresh();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const active = job && (job.status === 'building' || job.status === 'rendering');
  const base: React.CSSProperties = {
    margin: '8px 12px 0', padding: '10px 14px', borderRadius: 12, fontSize: 13.5, lineHeight: 1.8, direction: 'rtl',
  };
  if (!job) {
    return (
      <div dir="rtl" data-testid="job-indicator-idle" style={{ ...base, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: '#9ca3af' }}>
        ● کوئی کام نہیں چل رہا
      </div>
    );
  }
  if (active) {
    return (
      <div dir="rtl" data-testid="job-indicator-working" style={{ ...base, background: 'rgba(37,99,235,0.25)', border: '1px solid rgba(96,165,250,0.6)', color: '#dbeafe', fontWeight: 700 }}>
        ⏳ ویڈیو بن رہی ہے — «{job.title}» — {job.stage} (سین {job.sceneIndex + 1} از {job.sceneTotal})
      </div>
    );
  }
  if (job.status === 'done') {
    return (
      <div dir="rtl" data-testid="job-indicator-done" style={{ ...base, background: 'rgba(22,163,74,0.2)', border: '1px solid rgba(74,222,128,0.5)', color: '#bbf7d0' }}>
        ✅ ویڈیو بن چکی ہے — «{job.title}» — ڈاؤن لوڈ ویڈیو میکر میں ہے
      </div>
    );
  }
  return (
    <div dir="rtl" data-testid="job-indicator-failed" style={{ ...base, background: 'rgba(220,38,38,0.2)', border: '1px solid rgba(248,113,113,0.5)', color: '#fecaca' }}>
      ❌ ویڈیو نہیں بن سکی{job.error ? ` — وجہ: ${job.error}` : ''} — کوئی جھوٹا لنک نہیں دیا جا رہا
    </div>
  );
}
