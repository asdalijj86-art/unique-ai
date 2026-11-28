/**
 * remote-tasks.ts — PHONE REMOTE: synced to-dos + notes + photo send
 * (Phase 2, Stonic Remote: "a note or to-do you ask your character
 * for shows up on your phone too", "send a photo from your phone's
 * camera straight to your character").
 *
 * Two stores in one module:
 *  1. LOCAL store (per-account namespaced): the to-dos and notes this
 *     device knows — shown in the Phone Remote panel and mirrored to
 *     the phone side of the same app.
 *  2. SYNC payloads over the pairing relay's NEW 'sync' kind
 *     (server/pairing.js): todo-add / todo-toggle / todo-delete /
 *     note-add / photo. The relay validates the type + sizes; photos
 *     are downscaled thumbnails (data URL ≤ 150 KB — the relay caps
 *     messages at 200 KB). A photo that arrives becomes a VISUAL
 *     MEMORY on the laptop (photo + the sender's note as its story).
 *
 * Pure merge/validate helpers here; the DevicePairing poll loop
 * delivers sync messages to chat.tsx via onRemoteSync.
 */

export interface RemoteTodo {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
  /** Which device added it (display name). */
  from: string;
}

export interface RemoteNote {
  id: string;
  text: string;
  createdAt: number;
  from: string;
}

export const REMOTE_TODOS_KEY = 'unique-ai-remote-todos';
export const REMOTE_NOTES_KEY = 'unique-ai-remote-notes';
export const MAX_SYNC_PHOTO_CHARS = 150_000;

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type SyncPayload =
  | { type: 'todo-add'; todo: RemoteTodo }
  | { type: 'todo-toggle'; id: string; done: boolean }
  | { type: 'todo-delete'; id: string }
  | { type: 'note-add'; note: RemoteNote }
  | { type: 'photo'; dataUrl: string; note: string; from: string };

export function newRemoteId(prefix: string): string {
  try {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  } catch {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }
}

function loadList<T>(storage: StorageLike, key: string): T[] {
  try {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function saveList(storage: StorageLike, key: string, list: unknown[]): void {
  try {
    storage.setItem(key, JSON.stringify(list));
  } catch { /* ignore */ }
}

export function loadRemoteTodos(storage: StorageLike): RemoteTodo[] {
  return loadList<RemoteTodo>(storage, REMOTE_TODOS_KEY).filter(
    (t) => !!t && typeof t.id === 'string' && typeof t.text === 'string',
  );
}

export function saveRemoteTodos(storage: StorageLike, todos: RemoteTodo[]): void {
  saveList(storage, REMOTE_TODOS_KEY, todos);
}

export function loadRemoteNotes(storage: StorageLike): RemoteNote[] {
  return loadList<RemoteNote>(storage, REMOTE_NOTES_KEY).filter(
    (n) => !!n && typeof n.id === 'string' && typeof n.text === 'string',
  );
}

export function saveRemoteNotes(storage: StorageLike, notes: RemoteNote[]): void {
  saveList(storage, REMOTE_NOTES_KEY, notes);
}

export function makeRemoteTodo(text: string, from: string): RemoteTodo | null {
  const t = String(text || '').trim().slice(0, 200);
  if (!t) return null;
  return { id: newRemoteId('todo'), text: t, done: false, createdAt: Date.now(), from: from || 'فون' };
}

export function makeRemoteNote(text: string, from: string): RemoteNote | null {
  const t = String(text || '').trim().slice(0, 500);
  if (!t) return null;
  return { id: newRemoteId('note'), text: t, createdAt: Date.now(), from: from || 'فون' };
}

export function toggleRemoteTodo(todos: RemoteTodo[], id: string, done: boolean): RemoteTodo[] {
  return todos.map((t) => (t.id === id ? { ...t, done } : t));
}

/** Strict validation — mirrors the server relay's whitelist. A bad
 *  payload is dropped, never applied. */
export function isValidSyncPayload(payload: unknown): payload is SyncPayload {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  switch (p.type) {
    case 'todo-add':
      return !!p.todo && typeof p.todo === 'object'
        && typeof (p.todo as RemoteTodo).id === 'string'
        && typeof (p.todo as RemoteTodo).text === 'string'
        && (p.todo as RemoteTodo).text.length > 0
        && (p.todo as RemoteTodo).text.length <= 200;
    case 'todo-toggle':
      return typeof p.id === 'string' && typeof p.done === 'boolean';
    case 'todo-delete':
      return typeof p.id === 'string';
    case 'note-add':
      return !!p.note && typeof p.note === 'object'
        && typeof (p.note as RemoteNote).id === 'string'
        && typeof (p.note as RemoteNote).text === 'string'
        && (p.note as RemoteNote).text.length > 0
        && (p.note as RemoteNote).text.length <= 500;
    case 'photo':
      return typeof p.dataUrl === 'string'
        && p.dataUrl.startsWith('data:image/')
        && p.dataUrl.length <= MAX_SYNC_PHOTO_CHARS
        && typeof p.note === 'string' && p.note.length <= 500
        && typeof p.from === 'string';
    default:
      return false;
  }
}

export interface SyncApplyResult {
  todos: RemoteTodo[];
  notes: RemoteNote[];
  /** A photo arrived — the caller saves it as a visual memory. */
  photo: { dataUrl: string; note: string; from: string } | null;
}

/** Pure merge of one validated sync payload into local lists. */
export function applySyncPayload(
  todos: RemoteTodo[],
  notes: RemoteNote[],
  payload: SyncPayload,
): SyncApplyResult {
  switch (payload.type) {
    case 'todo-add':
      if (todos.some((t) => t.id === payload.todo.id)) return { todos, notes, photo: null };
      return { todos: [payload.todo, ...todos], notes, photo: null };
    case 'todo-toggle':
      return { todos: toggleRemoteTodo(todos, payload.id, payload.done), notes, photo: null };
    case 'todo-delete':
      return { todos: todos.filter((t) => t.id !== payload.id), notes, photo: null };
    case 'note-add':
      if (notes.some((n) => n.id === payload.note.id)) return { todos, notes, photo: null };
      return { todos, notes: [payload.note, ...notes], photo: null };
    case 'photo':
      return { todos, notes, photo: { dataUrl: payload.dataUrl, note: payload.note, from: payload.from } };
    default:
      return { todos, notes, photo: null };
  }
}
