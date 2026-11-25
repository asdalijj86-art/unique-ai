/**
 * usb-save — save ALL of his memory onto a USB stick (2026-11-26).
 *
 * His order: plug in a USB, say «میموری USB میں بچا لو», and Uniqa
 * saves all his memories into it herself.
 *
 * HONEST LIMIT, built into the design: a web page CANNOT write to
 * a USB silently. The browser only lets a page write into a folder
 * the user himself picks, once, in a folder picker
 * (showDirectoryPicker — File System Access API). So the flow is:
 *
 *   1. Uniqa asks him to pick the USB folder once (the picker IS
 *      the user's own tap — a browser rule, said out loud).
 *   2. She writes the backup file into that folder herself, with
 *      live progress, and names the file + bytes when done.
 *   3. If the browser blocks the picker (no support, no gesture,
 *      headless, or it never opens), she falls back to a normal
 *      file download and SAYS SO plainly — the file then has to be
 *      copied onto the USB by hand. No silent failure, no fake
 *      "saved to USB" claim.
 *   4. If he cancels the picker himself, NOTHING is written and
 *      no surprise download appears — the reply says so.
 *
 * ENCRYPTION (absolute): the file is the brain backup from
 * lib/backup over the secure vault adapter — memory entries travel
 * as their RAW AES-256-GCM encrypted blobs (same password-derived
 * key scheme as the security build), never plaintext. A lost USB
 * stick holds nothing readable without his password. API keys are
 * never in the file (backup.ts excludes them by design).
 *
 * The export covers ALL his memory: both persona stores (Uniqa's
 * notes/learnings + Unique's) plus conversations — collectBackup
 * gathers every key this account owns.
 */

// showDirectoryPicker is NOT in TypeScript's lib.dom (TS 5.9) — the
// handle types ARE, so only the window method needs declaring.
declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      mode?: 'readwrite' | 'read';
      id?: string;
    }) => Promise<FileSystemDirectoryHandle>;
  }
}

/** How long to wait for the folder picker to appear before giving
 *  up honestly and falling back to a download (headless browsers
 *  and gesture-less calls never open it — never hang forever). */
const PICKER_TIMEOUT_MS = 8000;

export type UsbSaveOutcome =
  | { ok: true; via: 'usb'; fileName: string; bytes: number }
  | { ok: true; via: 'download'; fileName: string; bytes: number; note: string }
  | { ok: false; cancelled: boolean; error: string };

function downloadTextFile(fileName: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function isAbortError(e: unknown): boolean {
  return (
    (typeof e === 'object' && e !== null && 'name' in e && (e as { name?: unknown }).name === 'AbortError') ||
    /abort/i.test(e instanceof Error ? e.message : String(e ?? ''))
  );
}

/**
 * Write the serialized backup into a folder the user picks (the
 * USB), or fall back to a download when the picker cannot open.
 * `onStage` reports live progress for the job timer.
 */
export async function saveMemoryBackupToUsb(
  serialized: string,
  fileName: string,
  onStage: (stage: string) => void,
): Promise<UsbSaveOutcome> {
  const bytes = new TextEncoder().encode(serialized).length;
  const pick = window.showDirectoryPicker;
  if (typeof pick !== 'function') {
    // This browser has no folder picker at all — say so and download.
    onStage('براؤزر میں USB فولڈر چننے کا طریقہ نہیں ہے — فائل ڈاؤن لوڈ ہو رہی ہے…');
    downloadTextFile(fileName, serialized);
    return {
      ok: true,
      via: 'download',
      fileName,
      bytes,
      note: 'اس براؤزر میں USB فولڈر براہِ راست چننے کا طریقہ نہیں ہے، اس لیے فائل ڈاؤن لوڈ ہو گئی ہے — اسے خود USB میں کاپی کر لیں۔',
    };
  }

  onStage('USB فولڈر چنیں — فولڈر چننے کا خانہ کھل رہا ہے…');
  let dir: FileSystemDirectoryHandle;
  // A genuine user cancel takes human time: the dialog has to open
  // and be read before Cancel is pressed. An abort that lands in
  // under a second means the dialog NEVER appeared at all (headless
  // browsers reject instantly) — that is "the picker could not
  // open", not "he cancelled", so it falls back to a download.
  const pickerStartedAt = Date.now();
  const pickerAbortedTooFast = () => Date.now() - pickerStartedAt < 1000;
  try {
    dir = await Promise.race([
      pick.call(window, { mode: 'readwrite' }),
      new Promise<never>((_resolve, reject) =>
        window.setTimeout(() => reject(new Error('picker-timeout')), PICKER_TIMEOUT_MS),
      ),
    ]);
  } catch (e) {
    if (isAbortError(e) && !pickerAbortedTooFast()) {
      // He cancelled the picker himself: nothing written, no download.
      return { ok: false, cancelled: true, error: 'آپ نے فولڈر چننا منسوخ کر دیا — کچھ نہیں لکھا گیا۔' };
    }
    // Picker blocked / never opened (headless, no gesture, denied,
    // or it timed out): fall back to a download and SAY SO plainly.
    onStage('فولڈر چننے کا خانہ نہیں کھلا — فائل ڈاؤن لوڈ ہو رہی ہے…');
    downloadTextFile(fileName, serialized);
    return {
      ok: true,
      via: 'download',
      fileName,
      bytes,
      note: 'براؤزر نے USB فولڈر کھولنے نہیں دیا، اس لیے فائل ڈاؤن لوڈ ہو گئی ہے — اسے خود USB میں کاپی کر لیں۔',
    };
  }

  onStage(`«${fileName}» USB میں لکھ رہی ہوں…`);
  try {
    const handle = await dir.getFileHandle(fileName, { create: true });
    const writable = await handle.createWritable();
    await writable.write(new Blob([serialized], { type: 'application/json' }));
    await writable.close();
    // Verify the write really landed: read the file back and check
    // its size before claiming success.
    const written = await handle.getFile();
    if (written.size !== bytes) {
      throw new Error(`size-mismatch:${written.size}`);
    }
    return { ok: true, via: 'usb', fileName, bytes: written.size };
  } catch (e) {
    // The folder was picked but the write failed (removed drive,
    // read-only stick, permission lost): fall back to a download
    // and say exactly what happened.
    onStage('USB میں لکھنا نہیں ہو سکا — فائل ڈاؤن لوڈ ہو رہی ہے…');
    downloadTextFile(fileName, serialized);
    const reason = e instanceof Error ? e.message : String(e ?? '');
    return {
      ok: true,
      via: 'download',
      fileName,
      bytes,
      note: `USB میں لکھنا نہیں ہو سکا (${reason}) — فائل ڈاؤن لوڈ ہو گئی ہے، اسے خود USB میں کاپی کر لیں۔`,
    };
  }
}
