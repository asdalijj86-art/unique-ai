// AlarmStrip — the SMALL alarm clock at the TOP of the front
// (user order 2026-11-26).
//
// Shows ONLY while an alarm is set (or ringing): the next alarm's
// time + purpose + a live countdown that ticks every second from
// the real clock. A ✕ cancels it. While ringing it shows the alarm
// itself until dismissed.
//
// HONEST LIMIT (shown on the strip, never hidden): the alarm fires
// ONLY while the laptop is on and this app is open — a closed
// laptop or closed tab cannot ring. No background service exists
// behind this strip, and the copy never claims otherwise.
//
// Renders nothing when there is no alarm and nothing is ringing
// (front-simple rule: nothing new is visible except while it is
// actually doing something).

import { useEffect, useState } from 'react';
import {
  ALARM_HONEST_LIMIT,
  formatAlarmTime,
  formatCountdown,
  nextAlarm,
  type Alarm,
} from '@/lib/alarm';

export default function AlarmStrip({
  alarms,
  firing,
  onCancel,
  onDismissFiring,
}: {
  alarms: Alarm[];
  /** The alarm currently ringing (until dismissed). */
  firing: Alarm | null;
  onCancel: (id: string) => void;
  onDismissFiring: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const next = nextAlarm(alarms, now);
  if (!firing && !next) return null;

  const base: React.CSSProperties = {
    margin: '8px 12px 0', padding: '10px 14px', borderRadius: 12, fontSize: 13.5, lineHeight: 1.8, direction: 'rtl',
  };
  const style = firing
    ? { ...base, background: 'rgba(220,38,38,0.25)', border: '1px solid rgba(248,113,113,0.6)', color: '#fecaca', fontWeight: 700 }
    : { ...base, background: 'rgba(8,145,178,0.2)', border: '1px solid rgba(34,211,238,0.5)', color: '#cffafe', fontWeight: 700 };

  return (
    <div dir="rtl" data-testid="alarm-strip" data-ringing={firing ? 'true' : 'false'} style={style}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ flex: 1, minWidth: 220 }} data-testid="alarm-strip-text">
          {firing ? (
            <>🔔 الارم بج رہا ہے — {firing.label} کا وقت ہو گیا ہے ({formatAlarmTime(firing.fireAt)})</>
          ) : next ? (
            <>⏰ الارم — {formatAlarmTime(next.fireAt)} ({next.label})</>
          ) : null}
        </span>
        {!firing && next && (
          <span data-testid="alarm-countdown" style={{ whiteSpace: 'nowrap', fontWeight: 700 }}>
            {formatCountdown(next.fireAt, now)}
          </span>
        )}
        <button
          type="button"
          onClick={() => (firing ? onDismissFiring() : next && onCancel(next.id))}
          aria-label={firing ? 'الارم بند کریں' : 'الارم کینسل کریں'}
          data-testid={firing ? 'alarm-dismiss' : 'alarm-cancel'}
          style={{ padding: '2px 10px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.25)', background: 'transparent', color: 'inherit', cursor: 'pointer' }}
        >
          ✕
        </button>
      </div>
      <div style={{ fontSize: 12, opacity: 0.85 }}>{ALARM_HONEST_LIMIT}</div>
    </div>
  );
}
