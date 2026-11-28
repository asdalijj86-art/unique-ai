/**
 * PhoneRemotePanel — PHONE REMOTE (Phase 2, Stonic Remote: call from
 * the phone, QR pairing, synced to-dos/notes, photo send from the
 * phone camera).
 *
 * Pairing itself stays in the existing DevicePairing panel (code +
 * QR already live there) — this panel is the NEW part: the synced
 * to-dos and notes (they travel over the pairing relay's 'sync'
 * kind, so a to-do asked on the phone shows up on the laptop too,
 * and vice versa) and photo send (the phone's camera photo arrives
 * on the laptop as a visual memory). When not linked, it says so
 * plainly with one button to open pairing.
 */

import { useRef, useState } from 'react';
import { downscaleImageFile } from '@/lib/visual-memories';
import {
  loadRemoteNotes,
  loadRemoteTodos,
  makeRemoteNote,
  makeRemoteTodo,
  saveRemoteNotes,
  saveRemoteTodos,
  type RemoteNote,
  type RemoteTodo,
  type SyncPayload,
} from '@/lib/remote-tasks';
import { secureAppStorage } from '@/lib/secure-app-storage';
import type { LinkState } from './DevicePairing';

export default function PhoneRemotePanel({
  linkState,
  deviceName,
  onOpenPairing,
  onSendSync,
}: {
  linkState: LinkState;
  /** This device's display name (sender label on to-dos/notes). */
  deviceName: string;
  onOpenPairing: () => void;
  /** Send one sync payload over the relay; false = not linked / failed. */
  onSendSync: (payload: SyncPayload) => boolean;
}) {
  const [todos, setTodos] = useState<RemoteTodo[]>(() => loadRemoteTodos(secureAppStorage));
  const [notes, setNotes] = useState<RemoteNote[]>(() => loadRemoteNotes(secureAppStorage));
  const [todoText, setTodoText] = useState('');
  const [noteText, setNoteText] = useState('');
  const [notice, setNotice] = useState('');
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const linked = linkState.linked;

  function addTodo() {
    const todo = makeRemoteTodo(todoText, deviceName);
    if (!todo) { setNotice('پہلے کام لکھیں۔'); return; }
    const next = [todo, ...todos];
    setTodos(next);
    saveRemoteTodos(secureAppStorage, next);
    setTodoText('');
    if (linked && !onSendSync({ type: 'todo-add', todo })) {
      setNotice('کام یہیں محفوظ ہو گیا — فون تک نہیں پہنچا (لنک بند ہے)۔');
    } else {
      setNotice(linked ? '✅ کام شامل — فون پر بھی آ گیا۔' : '✅ کام شامل ہو گیا (فون جوڑیں تو وہاں بھی آئے گا)۔');
    }
  }

  function toggleTodo(t: RemoteTodo) {
    const next = todos.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x));
    setTodos(next);
    saveRemoteTodos(secureAppStorage, next);
    if (linked) onSendSync({ type: 'todo-toggle', id: t.id, done: !t.done });
  }

  function deleteTodo(t: RemoteTodo) {
    const next = todos.filter((x) => x.id !== t.id);
    setTodos(next);
    saveRemoteTodos(secureAppStorage, next);
    if (linked) onSendSync({ type: 'todo-delete', id: t.id });
  }

  function addNote() {
    const note = makeRemoteNote(noteText, deviceName);
    if (!note) { setNotice('پہلے نوٹ لکھیں۔'); return; }
    const next = [note, ...notes];
    setNotes(next);
    saveRemoteNotes(secureAppStorage, next);
    setNoteText('');
    if (linked && !onSendSync({ type: 'note-add', note })) {
      setNotice('نوٹ یہیں محفوظ ہو گیا — فون تک نہیں پہنچا (لنک بند ہے)۔');
    } else {
      setNotice(linked ? '✅ نوٹ شامل — فون پر بھی آ گیا۔' : '✅ نوٹ شامل ہو گیا (فون جوڑیں تو وہاں بھی آئے گا)۔');
    }
  }

  async function sendPhoto(file: File) {
    try {
      const dataUrl = await downscaleImageFile(file, 480, 0.8);
      if (dataUrl.length > 150_000) {
        setNotice('تصویر بہت بڑی ہے — چھوٹی تصویر بھیجیں۔');
        return;
      }
      const ok = linked && onSendSync({ type: 'photo', dataUrl, note: 'فون سے بھیجی گئی تصویر', from: deviceName });
      setNotice(ok ? '✅ تصویر بھیج دی — لیپ ٹاپ کی تصویری یادوں میں آ جائے گی۔' : 'تصویر تیار ہے، مگر فون جڑا نہیں — پہلے جوڑیں۔');
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'تصویر نہیں بھیجی جا سکی۔');
    }
  }

  return (
    <div className="upanel" data-testid="panel-phone-remote" dir="rtl">
      <p className="upanel-intro">
        فون ریموٹ — فون سے کال، کام اور نوٹس۔ لیپ ٹاپ آن اور ایپ کھلی ہونی چاہیے؛ باہر سے جوڑنے کے لیے Tailscale چاہیے (کال والی شرط)۔
      </p>

      <div className="uremote-status" data-testid="remote-link-status">
        {linked ? (
          <span>📱 جڑا ہوا ہے — {linkState.peerName || 'فون'} {linkState.peerOnline ? '(آن لائن)' : '(آف لائن)'}</span>
        ) : (
          <span>📱 فون جڑا نہیں ہے</span>
        )}
        <button type="button" className="upanel-refresh" onClick={onOpenPairing} data-testid="button-remote-open-pairing">
          {linked ? 'جوڑنا دیکھیں' : '📱 فون جوڑیں'}
        </button>
      </div>

      <div className="upanel-section-title">✅ کام (To-Do) — دونوں طرف ایک جیسے</div>
      <div className="uremote-add">
        <input
          type="text"
          value={todoText}
          maxLength={200}
          onChange={(e) => setTodoText(e.target.value)}
          placeholder="نیا کام لکھیں…"
          data-testid="input-remote-todo"
        />
        <button type="button" onClick={addTodo} data-testid="button-remote-todo-add">شامل کریں</button>
      </div>
      {todos.length === 0 ? (
        <p className="upanel-empty">ابھی کوئی کام نہیں — اوپر سے شامل کریں، یا فون سے بھیجیں۔</p>
      ) : (
        <ul className="upanel-list">
          {todos.map((t) => (
            <li key={t.id} className="upanel-item" data-testid={`remote-todo-${t.id}`}>
              <input
                type="checkbox"
                checked={t.done}
                onChange={() => toggleTodo(t)}
                aria-label={t.done ? 'نامکمل کریں' : 'مکمل کریں'}
                data-testid={`checkbox-remote-todo-${t.id}`}
              />
              <span className="upanel-item-text" style={t.done ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}>
                {t.text} <small>({t.from})</small>
              </span>
              <button type="button" className="upanel-item-delete" onClick={() => deleteTodo(t)} aria-label="کام مٹائیں">🗑️</button>
            </li>
          ))}
        </ul>
      )}

      <div className="upanel-section-title">📝 نوٹس — دونوں طرف ایک جیسے</div>
      <div className="uremote-add">
        <input
          type="text"
          value={noteText}
          maxLength={500}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="نیا نوٹ لکھیں…"
          data-testid="input-remote-note"
        />
        <button type="button" onClick={addNote} data-testid="button-remote-note-add">شامل کریں</button>
      </div>
      {notes.length === 0 ? (
        <p className="upanel-empty">ابھی کوئی نوٹ نہیں۔</p>
      ) : (
        <ul className="upanel-list">
          {notes.slice(0, 10).map((n) => (
            <li key={n.id} className="upanel-item">
              <span className="upanel-item-text">{n.text} <small>({n.from})</small></span>
            </li>
          ))}
        </ul>
      )}

      <div className="upanel-section-title">📷 فون سے تصویر بھیجیں</div>
      <p className="upanel-empty">
        فون کے کیمرے سے تصویر بھیجیں — وہ لیپ ٹاپ کی «تصویری یادیں» میں آ جائے گی۔ تصویر چھوٹی کر کے بھیجی جاتی ہے۔
      </p>
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void sendPhoto(f);
          e.target.value = '';
        }}
        data-testid="input-remote-photo"
      />
      <button
        type="button"
        className="upanel-refresh"
        onClick={() => photoInputRef.current?.click()}
        data-testid="button-remote-photo"
      >
        📷 تصویر بھیجیں
      </button>

      {notice && (
        <p className="upanel-empty" role="status" data-testid="remote-notice">{notice}</p>
      )}
    </div>
  );
}
