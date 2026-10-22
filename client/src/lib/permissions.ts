/**
 * permissions — one place that knows every browser permission this app
 * actually uses, how to read its state, and how to request it.
 *
 * Capabilities audited from the code (Task 7):
 *  - microphone: chat voice input (SpeechRecognition) — warming it via
 *    getUserMedia pre-grants the origin's mic permission, so voice
 *    starts later without a mid-conversation prompt.
 *  - camera: hand-gesture control (useGestures getUserMedia video).
 *  - geolocation: the map's «میری جگہ» button (MapWidget).
 * Notifications are NOT used anywhere in the app, and downloads /
 * file picking / clipboard writes need no permission grant — so they
 * are deliberately absent here.
 *
 * Honest browser fact (also stated in the UI): the FIRST grant is
 * always the browser's own prompt — no website can bypass it. The win
 * this module buys: one Allow per capability, remembered by the
 * browser for this site forever after.
 */

export type Capability = 'microphone' | 'camera' | 'geolocation';
export type PermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported';

export const CAPABILITY_LABELS: Record<Capability, string> = {
  microphone: '🎙️ مائیکروفون (آواز کے لیے)',
  camera: '📷 کیمرا (ہاتھ کے اشاروں کے لیے)',
  geolocation: '📍 مقام (نقشے کے لیے)',
};

export const PERMISSION_STATE_LABELS: Record<PermissionState, string> = {
  granted: 'آن ہے ✓',
  denied: 'منع ہے ✗',
  prompt: 'اجازت درکار ہے',
  unsupported: 'اس براؤزر میں دستیاب نہیں',
};

export const HOW_TO_ALLOW =
  'اجازت آن کرنے کا طریقہ: براؤزر کے ایڈریس بار کے بائیں طرف لاک 🔒 یا ترتیبات کے نشان کو دبائیں → اس سائٹ کی اجازتوں میں مطلوبہ چیز «Allow» کر دیں → صفحہ تازہ کریں۔';

const PERMISSIONS_API_NAMES: Record<Capability, string> = {
  microphone: 'microphone',
  camera: 'camera',
  geolocation: 'geolocation',
};

export async function queryPermission(capability: Capability): Promise<PermissionState> {
  try {
    if (capability === 'geolocation' && !navigator.geolocation) return 'unsupported';
    if ((capability === 'microphone' || capability === 'camera') && !navigator.mediaDevices?.getUserMedia) {
      return 'unsupported';
    }
    const status = await navigator.permissions.query({ name: PERMISSIONS_API_NAMES[capability] as PermissionName });
    if (status.state === 'granted' || status.state === 'denied' || status.state === 'prompt') return status.state;
    return 'prompt';
  } catch {
    // Safari and some browsers reject unknown permission names.
    return 'unsupported';
  }
}

export async function queryAllPermissions(): Promise<Record<Capability, PermissionState>> {
  const [microphone, camera, geolocation] = await Promise.all([
    queryPermission('microphone'),
    queryPermission('camera'),
    queryPermission('geolocation'),
  ]);
  return { microphone, camera, geolocation };
}

/**
 * Request ONE capability via its proper API. Must be called from a
 * user-gesture handler (a tap) for the browser to show its prompt.
 * Resolves with the resulting state; never throws.
 */
export async function requestPermission(capability: Capability): Promise<PermissionState> {
  try {
    if (capability === 'microphone' || capability === 'camera') {
      const constraints = capability === 'microphone' ? { audio: true } : { video: true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      // The grant is what matters — release the device immediately.
      stream.getTracks().forEach((track) => track.stop());
      return 'granted';
    }
    // geolocation
    return await new Promise<PermissionState>((resolve) => {
      if (!navigator.geolocation) {
        resolve('unsupported');
        return;
      }
      navigator.geolocation.getCurrentPosition(
        () => resolve('granted'),
        (err) => resolve(err && err.code === 1 ? 'denied' : 'prompt'),
        { timeout: 10000 },
      );
    });
  } catch {
    // NotAllowedError → the user (or the browser) said no.
    const after = await queryPermission(capability);
    return after === 'granted' ? 'granted' : 'denied';
  }
}

/**
 * The «🔓 ساری اجازتیں آن کریں» walk: request each not-yet-granted
 * capability in turn, inside the one tap's gesture chain, reporting
 * the state after each step.
 */
export async function requestAllPermissions(
  onProgress?: (states: Record<Capability, PermissionState>) => void,
): Promise<Record<Capability, PermissionState>> {
  const states = await queryAllPermissions();
  onProgress?.({ ...states });
  for (const capability of ['microphone', 'camera', 'geolocation'] as Capability[]) {
    if (states[capability] === 'granted' || states[capability] === 'unsupported') continue;
    states[capability] = await requestPermission(capability);
    onProgress?.({ ...states });
  }
  return states;
}
