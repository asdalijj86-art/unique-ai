/**
 * visual-memories.ts — VISUAL MEMORIES (Phase 2, Stonic v3.1.25:
 * "keep a photo as a memory, with its story"). A photo + the story
 * behind it, saved locally per account, shown in the MEMORY panel.
 *
 * Photos are downscaled on the way in (max 480px, JPEG 0.82) so the
 * store stays small; the original file is never kept. Nothing leaves
 * the device. Pure CRUD + validation, like lib/memory.ts.
 */

export interface VisualMemory {
  id: string;
  /** Downscaled JPEG data URL (data:image/jpeg;base64,…). */
  photo: string;
  /** The story behind the photo, in the user's own words. */
  story: string;
  /** Optional short title. */
  title: string;
  createdAt: number;
  /** Which persona's memory this belongs to (view filter). */
  persona: 'uniqa' | 'unique';
}

export const VISUAL_MEMORIES_KEY = 'unique-ai-visual-memories';
export const MAX_VISUAL_MEMORIES = 50;
export const MAX_STORY_CHARS = 500;

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function newId(): string {
  try {
    return `vm-${crypto.randomUUID().slice(0, 8)}`;
  } catch {
    return `vm-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }
}

export function loadVisualMemories(storage: StorageLike): VisualMemory[] {
  try {
    const raw = storage.getItem(VISUAL_MEMORIES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m): m is VisualMemory =>
        !!m && typeof m === 'object'
        && typeof (m as VisualMemory).id === 'string'
        && typeof (m as VisualMemory).photo === 'string'
        && (m as VisualMemory).photo.startsWith('data:image/')
        && typeof (m as VisualMemory).story === 'string',
    );
  } catch {
    return [];
  }
}

export function saveVisualMemories(storage: StorageLike, list: VisualMemory[]): void {
  try {
    storage.setItem(VISUAL_MEMORIES_KEY, JSON.stringify(list.slice(0, MAX_VISUAL_MEMORIES)));
  } catch { /* storage full — list stays in memory only */ }
}

export function makeVisualMemory(
  photoDataUrl: string,
  story: string,
  persona: 'uniqa' | 'unique',
  title = '',
): VisualMemory | null {
  if (typeof photoDataUrl !== 'string' || !photoDataUrl.startsWith('data:image/')) return null;
  const storyText = String(story || '').trim().slice(0, MAX_STORY_CHARS);
  if (!storyText) return null;
  return {
    id: newId(),
    photo: photoDataUrl,
    story: storyText,
    title: String(title || '').trim().slice(0, 80),
    createdAt: Date.now(),
    persona,
  };
}

export function addVisualMemory(storage: StorageLike, memory: VisualMemory): VisualMemory[] {
  const list = [memory, ...loadVisualMemories(storage)].slice(0, MAX_VISUAL_MEMORIES);
  saveVisualMemories(storage, list);
  return list;
}

export function deleteVisualMemory(storage: StorageLike, id: string): VisualMemory[] {
  const list = loadVisualMemories(storage).filter((m) => m.id !== id);
  saveVisualMemories(storage, list);
  return list;
}

/**
 * Downscale an image file to a small JPEG data URL (browser only —
 * uses canvas). Never keeps the original: the returned data URL is
 * the only copy. Rejects non-image files and files over 10 MB.
 */
export function downscaleImageFile(file: File, maxDim = 480, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('یہ تصویر نہیں ہے۔'));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      reject(new Error('تصویر 10 MB سے بڑی ہے۔'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('کینوس نہیں کھلا۔');
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e instanceof Error ? e : new Error('تصویر تیار نہیں ہو سکی۔'));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('تصویر پڑھی نہیں جا سکی۔'));
    };
    img.src = url;
  });
}
