/**
 * VisualHub — the full-screen composition element Stonic calls its
 * "VISUAL INTELLIGENCE HUB" (2026-11-24, user's full-screen order).
 * OUR hub, own brand and layout, four tabs:
 *
 *   بصری مرکز — draws ONLY from real conversation. When the latest
 *     assistant reply actually contains numbered/bulleted steps, it
 *     renders them as a flow diagram (nodes + connectors) with the
 *     time it was drawn. Otherwise it shows the honest ready state
 *     ("تیار ہے — کچھ پوچھیں") and suggestion chips that send REAL
 *     prompts to chat — the reply's steps then draw themselves here.
 *   تمہاری دنیا — "Your World": 3 picks drawn from REAL local data
 *     (latest learning, today's completed work, latest note, today's
 *     message count). No web news — the client has no news feed —
 *     so it says plainly where each pick came from, and an empty
 *     state when there is nothing yet.
 *   اشارے — the hand-gesture switch (the real app setting). Honest
 *     note: gestures use the camera only when turned on; Awareness
 *     never uses the camera.
 *   سرگرمی — the session activity log: real events only (message
 *     sent, reply spoken, studio opened, persona changed, Awareness
 *     fired), newest first.
 *
 * Nothing here is decoration or fake text: every line comes from
 * real data, and every empty state says so.
 */

import { useState } from 'react';

export type WorldPick = { title: string; detail: string; source: string };
export type ActivityEvent = { at: number; text: string };

type HubTab = 'hub' | 'world' | 'gesture' | 'activity';

/** Steps = numbered or bulleted lines in the reply. Max 6 nodes. */
function parseSteps(text: string): string[] {
  const steps: string[] = [];
  for (const raw of text.split(/\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(?:\d{1,2}[.)]|[•\-*])\s+(.+)$/);
    if (m && m[1] && m[1].length > 3) steps.push(m[1].trim());
    if (steps.length >= 6) break;
  }
  return steps;
}

function formatTime(at: number): string {
  try {
    return new Date(at).toLocaleTimeString('ur-PK', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

/** Suggestion chips send REAL prompts to chat; the reply's steps
 *  then draw themselves in the hub. Own prompts, not Stonic's. */
const SUGGESTIONS: { label: string; prompt: string }[] = [
  { label: '🕌 وضو کے مراحل', prompt: 'وضو کے مراحل قدم بہ قدم بتائیں' },
  { label: '🌙 چاند گرہن کیسے ہوتا ہے؟', prompt: 'چاند گرہن کیسے ہوتا ہے؟ قدم بہ قدم سمجھائیں' },
  { label: '💧 پانی کا چکر', prompt: 'پانی کا چکر (water cycle) قدم بہ قدم سمجھائیں' },
  { label: '🕌 نمازوں کی ترتیب', prompt: 'آج کی پانچ نمازوں کی ترتیب اور ان کے وقت بتائیں' },
];

const TABS: { key: HubTab; label: string }[] = [
  { key: 'hub', label: '🎨 بصری مرکز' },
  { key: 'world', label: '🌍 تمہاری دنیا' },
  { key: 'gesture', label: '✋ اشارے' },
  { key: 'activity', label: '📋 سرگرمی' },
];

export default function VisualHub({
  latestAssistantText,
  latestAt,
  onSendPrompt,
  gesturesOn,
  onToggleGestures,
  worldPicks,
  activity,
}: {
  latestAssistantText: string | null;
  latestAt: number | null;
  onSendPrompt: (text: string) => void;
  gesturesOn: boolean;
  onToggleGestures: () => void;
  worldPicks: WorldPick[];
  activity: ActivityEvent[];
}) {
  const [tab, setTab] = useState<HubTab>('hub');
  const steps = latestAssistantText ? parseSteps(latestAssistantText) : [];

  return (
    <section className="uhub" data-testid="visual-hub" dir="rtl" aria-label="بصری مرکز">
      <div className="uhub-tabs" role="tablist" aria-label="بصری مرکز کے ٹیب">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            aria-pressed={tab === t.key}
            className={`uhub-tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
            data-testid={`uhub-tab-${t.key}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'hub' && (
        <div className="uhub-body">
          {steps.length >= 2 ? (
            <>
              <p className="uhub-status">
                🎨 ڈرائنگ تیار ہے — آخری جواب کے مراحل سے بنائی گئی
                {latestAt ? ` (${formatTime(latestAt)})` : ''}
              </p>
              <div className="uhub-flow" dir="rtl">
                {steps.map((s, i) => (
                  <div key={i} className="uhub-flow-row">
                    <span className="uhub-flow-num" aria-hidden="true">{i + 1}</span>
                    <span className="uhub-flow-text">{s}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="uhub-status">✨ بصری مرکز تیار ہے — کچھ پوچھیں، میں بول کر سمجھاتے ہوئے یہاں ڈایاگرام بنا دوں گی</p>
              <div className="uhub-chips">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    className="uhub-chip"
                    onClick={() => onSendPrompt(s.prompt)}
                    data-testid={`uhub-suggestion-${s.label}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <p className="uhub-hint">جب میرا جواب قدم بہ قدم ہوگا، اس کے مراحل یہاں خودبخود ڈایاگرام بن جائیں گے۔</p>
            </>
          )}
        </div>
      )}

      {tab === 'world' && (
        <div className="uhub-body">
          <p className="uhub-status">🌍 تمہاری دنیا — آپ کی اپنی باتوں سے، آج کے لیے تین چنی ہوئی باتیں</p>
          {worldPicks.length === 0 ? (
            <p className="uhub-empty">
              ابھی یہاں کچھ نہیں — جیسے ہی آپ مجھے کچھ سکھائیں گے، کوئی کام مکمل ہوگا یا کوئی یادداشت بنے گی، وہ یہاں آ جائے گی۔
            </p>
          ) : (
            <ul className="uhub-picks">
              {worldPicks.map((p, i) => (
                <li key={i} className="uhub-pick">
                  <span className="uhub-pick-title">{p.title}</span>
                  <span className="uhub-pick-detail">{p.detail}</span>
                  <span className="uhub-pick-source">{p.source} سے</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'gesture' && (
        <div className="uhub-body">
          <p className="uhub-status">
            ✋ ہاتھ کے اشارے: {gesturesOn ? 'آن ہیں' : 'بند ہیں'}
          </p>
          <button
            type="button"
            className="uhub-toggle"
            onClick={onToggleGestures}
            aria-pressed={gesturesOn}
            data-testid="uhub-toggle-gestures"
          >
            {gesturesOn ? 'اشارے بند کریں' : 'اشارے آن کریں'}
          </button>
          <p className="uhub-hint">
            اشارے کیمرہ استعمال کرتے ہیں — صرف جب آپ آن کریں۔ Awareness کبھی کیمرہ استعمال نہیں کرتا۔
          </p>
        </div>
      )}

      {tab === 'activity' && (
        <div className="uhub-body">
          <p className="uhub-status">📋 اس سیشن کی سرگرمی — صرف اصلی واقعات</p>
          {activity.length === 0 ? (
            <p className="uhub-empty">ابھی کوئی سرگرمی نہیں — جیسے ہی کچھ ہوگا، یہاں لکھا جائے گا۔</p>
          ) : (
            <ul className="uhub-activity">
              {activity.slice(0, 20).map((e, i) => (
                <li key={i} className="uhub-activity-item">
                  <span className="uhub-activity-time">{formatTime(e.at)}</span>
                  <span className="uhub-activity-text">{e.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
