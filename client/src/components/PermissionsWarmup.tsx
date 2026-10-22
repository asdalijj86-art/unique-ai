/**
 * PermissionsWarmup — the «🔓 ساری اجازتیں آن کریں» action (Task 7).
 *
 * One tap walks the browser permissions this app actually uses (mic,
 * camera, location) and requests each missing one through its proper
 * API, so the browser remembers the grant for this site and tools
 * afterwards run without mid-task prompts. Per-item status comes from
 * the Permissions API where available; a denied item explains, in
 * plain Urdu, how to allow it in the browser.
 */
import { useEffect, useState } from 'react';
import { Unlock } from 'lucide-react';
import {
  CAPABILITY_LABELS,
  PERMISSION_STATE_LABELS,
  HOW_TO_ALLOW,
  queryAllPermissions,
  requestAllPermissions,
  requestPermission,
  type Capability,
  type PermissionState,
} from '@/lib/permissions';

const ORDER: Capability[] = ['microphone', 'camera', 'geolocation'];

export default function PermissionsWarmup() {
  const [states, setStates] = useState<Record<Capability, PermissionState> | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void queryAllPermissions().then((result) => { if (!cancelled) setStates(result); });
    return () => { cancelled = true; };
  }, []);

  async function warmAll() {
    setBusy(true);
    try {
      await requestAllPermissions((next) => setStates({ ...next }));
    } finally {
      setBusy(false);
    }
  }

  async function warmOne(capability: Capability) {
    setBusy(true);
    try {
      const state = await requestPermission(capability);
      setStates((current) => (current ? { ...current, [capability]: state } : current));
    } finally {
      setBusy(false);
    }
  }

  const anyDenied = states && ORDER.some((capability) => states[capability] === 'denied');
  const allGranted = states && ORDER.every((capability) => states[capability] === 'granted' || states[capability] === 'unsupported');

  return (
    <div dir="rtl">
      <button
        type="button"
        className="setting-row"
        onClick={warmAll}
        disabled={busy}
        aria-label="ساری اجازتیں آن کریں"
      >
        <span className="setting-icon"><Unlock size={16} /></span>
        <span className="setting-label">🔓 ساری اجازتیں آن کریں</span>
        <span style={{ fontSize: 11.5, opacity: 0.75 }}>{busy ? 'ہو رہا ہے…' : allGranted ? 'سب آن ہیں ✓' : 'ایک ٹیپ'}</span>
      </button>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '2px 4px 0' }}>
        {ORDER.map((capability) => {
          const state = states?.[capability];
          return (
            <div key={capability} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
              <span style={{ flex: 1 }}>{CAPABILITY_LABELS[capability]}</span>
              <span style={{ opacity: 0.85 }}>{state ? PERMISSION_STATE_LABELS[state] : '…'}</span>
              {state && state !== 'granted' && state !== 'unsupported' && (
                <button
                  type="button"
                  onClick={() => warmOne(capability)}
                  disabled={busy}
                  style={{ fontSize: 11.5, padding: '2px 9px', borderRadius: 999, border: '1px solid rgba(139,92,246,0.45)', background: 'rgba(139,92,246,0.12)', color: 'inherit', cursor: 'pointer' }}
                >
                  آن کریں
                </button>
              )}
            </div>
          );
        })}
        <span style={{ fontSize: 11, opacity: 0.6, lineHeight: 1.8 }}>
          ہر اجازت صرف پہلی بار براؤزر پوچھتا ہے — ایک بار «Allow» کر دیں تو یہ سائٹ ہمیشہ یاد رکھتی ہے، پھر کوئی ٹول نہیں رکتا۔
        </span>
        {anyDenied && (
          <span style={{ fontSize: 11.5, color: '#fca5a5', lineHeight: 1.8 }}>{HOW_TO_ALLOW}</span>
        )}
      </div>
    </div>
  );
}
