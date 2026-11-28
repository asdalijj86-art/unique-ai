/**
 * CharactersPanel — CUSTOM CHARACTERS (Phase 2, Stonic v3.1.9:
 * "Pick who your assistant is — Girlfriend, Partner, Best Friend,
 * Assistant, Listener, Boyfriend, Bro, Mentor or a sci-fi butler —
 * or write your own with a name, a voice and a personality").
 *
 * One list: the two built-ins (یونیکا / یونیک — never deletable)
 * first, then the user's own characters. Pick one to make it the
 * speaking character; create from a preset role or fully custom;
 * rename / re-personality / delete the user's own. The voice line is
 * honest: a character speaks with the locked female or male voice
 * chain by its gender — there is no third voice engine.
 */

import { useEffect, useState } from 'react';
import { secureAppStorage } from '@/lib/secure-app-storage';
import {
  CHARACTER_PRESETS,
  allCharacters,
  basePersonaFor,
  characterVoiceNote,
  createCharacterFromPreset,
  createCustomCharacter,
  deleteCharacter,
  loadCharacters,
  saveActiveCharacterId,
  saveCharacters,
  updateCharacter,
  type CharacterDef,
  type CharacterGender,
  type CharacterRole,
} from '@/lib/characters';

export default function CharactersPanel({
  activeCharacter,
  onActiveChange,
  /** The base persona (Uniqa/Unique) — marks the right built-in row
   *  active when no custom character is picked. */
  basePersona = 'uniqa',
}: {
  /** The active custom character (null = plain Uniqa/Unique default). */
  activeCharacter: CharacterDef | null;
  onActiveChange: (c: CharacterDef | null) => void;
  basePersona?: 'uniqa' | 'unique';
}) {
  const [list, setList] = useState<CharacterDef[]>(() => allCharacters(secureAppStorage));
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [role, setRole] = useState<CharacterRole>('assistant');
  const [name, setName] = useState('');
  const [gender, setGender] = useState<CharacterGender>('female');
  const [personality, setPersonality] = useState('');
  const [note, setNote] = useState('');

  const refresh = () => setList(allCharacters(secureAppStorage));
  useEffect(() => { refresh(); }, []);

  const activeId = activeCharacter?.id ?? null;

  function select(c: CharacterDef) {
    if (c.builtin) {
      saveActiveCharacterId(secureAppStorage, null);
      onActiveChange(null);
      setNote(c.id === 'builtin-uniqa' ? 'یونیکا سامنے آ گئی — پہلے والی ساتھی۔' : 'یونیک سامنے آ گیا۔');
      return;
    }
    saveActiveCharacterId(secureAppStorage, c.id);
    onActiveChange(c);
    setNote(`«${c.name}» سامنے آ گئی — اب وہی بولے گی۔`);
  }

  function openCreate(presetRole: CharacterRole) {
    const p = CHARACTER_PRESETS.find((x) => x.role === presetRole) ?? CHARACTER_PRESETS[3];
    setRole(presetRole);
    setName(p.defaultName);
    setGender(p.gender);
    setPersonality(p.personality);
    setEditId(null);
    setShowCreate(true);
    setNote('');
  }

  function openEdit(c: CharacterDef) {
    if (c.builtin) return;
    setRole(c.role);
    setName(c.name);
    setGender(c.gender);
    setPersonality(c.personality);
    setEditId(c.id);
    setShowCreate(true);
    setNote('');
  }

  function saveForm() {
    const trimmedName = name.trim();
    if (!trimmedName) { setNote('پہلے نام لکھیں۔'); return; }
    if (trimmedName.length > 40) { setNote('نام 40 حرف سے چھوٹا رکھیں۔'); return; }
    const customs = loadCharacters(secureAppStorage);
    if (editId) {
      const next = updateCharacter(customs, editId, { name: trimmedName, role, gender, personality });
      saveCharacters(secureAppStorage, next);
      refresh();
      const updated = next.find((c) => c.id === editId);
      if (updated && activeCharacter?.id === editId) onActiveChange(updated);
      setNote(`«${trimmedName}» بدل دی گئی۔`);
    } else {
      const created = createCustomCharacter({ name: trimmedName, role, gender, personality });
      if (!created) { setNote('کردار نہیں بنا — نام چیک کریں۔'); return; }
      saveCharacters(secureAppStorage, [...customs, created]);
      refresh();
      setNote(`«${created.name}» بن گئی — اسے چن کر سامنے لائیں۔`);
    }
    setShowCreate(false);
    setEditId(null);
  }

  function remove(c: CharacterDef) {
    if (c.builtin) return;
    if (!window.confirm(`کیا «${c.name}» کو مٹا دیں؟ اس کی یادیں بھی مٹ جائیں گی۔`)) return;
    const customs = deleteCharacter(loadCharacters(secureAppStorage), c.id);
    saveCharacters(secureAppStorage, customs);
    if (activeCharacter?.id === c.id) {
      saveActiveCharacterId(secureAppStorage, null);
      onActiveChange(null);
    }
    refresh();
    setNote(`«${c.name}» مٹا دی گئی۔`);
  }

  const editing = showCreate;

  return (
    <div className="upanel" data-testid="panel-characters" dir="rtl">
      <p className="upanel-intro">
        کون بول رہا ہے — کردار چنیں، یا اپنا کردار بنائیں۔ یونیکا پہلے نمبر پر ہی رہے گی۔
      </p>

      <div className="upanel-section-title">🎭 کردار</div>
      <div className="uchar-list">
        {list.map((c) => {
          // Selected = this custom character, OR (no custom active)
          // the built-in row of the base persona speaking right now.
          const selected = activeCharacter
            ? c.id === activeCharacter.id
            : c.builtin && ((c.id === 'builtin-uniqa') === (basePersona === 'uniqa'));
          void activeId;
          return (
            <div
              key={c.id}
              className={`uchar-card${selected ? ' active' : ''}`}
              style={{ ['--uchar-color' as string]: c.color }}
              data-testid={`character-card-${c.id}`}
            >
              <button
                type="button"
                className="uchar-pick"
                onClick={() => select(c)}
                aria-pressed={selected}
                data-testid={`button-character-select-${c.id}`}
              >
                <span className="uchar-icon" aria-hidden="true">{c.icon}</span>
                <span className="uchar-name">{c.name}</span>
                <span className="uchar-role">
                  {c.builtin ? (c.id === 'builtin-uniqa' ? 'یونیکا — ساتھی' : 'یونیک — معاون') : CHARACTER_PRESETS.find((p) => p.role === c.role)?.labelUrdu ?? c.role}
                </span>
                <span className="uchar-voice">{characterVoiceNote(c)}</span>
              </button>
              {!c.builtin && (
                <span className="uchar-actions">
                  <button type="button" onClick={() => openEdit(c)} data-testid={`button-character-edit-${c.id}`}>✏️ بدلیں</button>
                  <button type="button" onClick={() => remove(c)} data-testid={`button-character-delete-${c.id}`}>🗑️ مٹائیں</button>
                </span>
              )}
              {c.builtin && (
                <span className="uchar-base">بنیادی کردار — {basePersonaFor(c) === 'uniqa' ? 'یونیکا کی آواز' : 'یونیک کی آواز'}</span>
              )}
            </div>
          );
        })}
      </div>

      {!editing && (
        <button
          type="button"
          className="upanel-refresh"
          onClick={() => openCreate('assistant')}
          data-testid="button-character-new"
        >
          ➕ نیا کردار بنائیں
        </button>
      )}

      {editing && (
        <div className="uchar-form" data-testid="character-form" dir="rtl">
          <div className="upanel-section-title">{editId ? '✏️ کردار بدلیں' : '➕ نیا کردار'}</div>
          <div className="uchar-roles" role="group" aria-label="کردار کی قسم">
            {CHARACTER_PRESETS.map((p) => (
              <button
                key={p.role}
                type="button"
                className={`uchar-role-chip${role === p.role ? ' active' : ''}`}
                onClick={() => { setRole(p.role); setGender(p.gender); if (!editId) { setName(p.defaultName); setPersonality(p.personality); } }}
                aria-pressed={role === p.role}
                data-testid={`button-character-role-${p.role}`}
              >
                {p.icon} {p.labelUrdu}
              </button>
            ))}
          </div>
          <label className="uchar-field">
            <span>نام</span>
            <input
              type="text"
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              placeholder="کردار کا نام"
              data-testid="input-character-name"
            />
          </label>
          <div className="uchar-gender" role="group" aria-label="آواز">
            <button
              type="button"
              className={gender === 'female' ? 'active' : ''}
              onClick={() => setGender('female')}
              aria-pressed={gender === 'female'}
              data-testid="button-character-gender-female"
            >
              💛 خواتین کی آواز (یونیکا والی)
            </button>
            <button
              type="button"
              className={gender === 'male' ? 'active' : ''}
              onClick={() => setGender('male')}
              aria-pressed={gender === 'male'}
              data-testid="button-character-gender-male"
            >
              💙 مرد کی آواز (یونیک والی)
            </button>
          </div>
          <label className="uchar-field">
            <span>شخصیت — کیسی بات کرے؟</span>
            <textarea
              value={personality}
              maxLength={500}
              rows={3}
              onChange={(e) => setPersonality(e.target.value)}
              placeholder="مثلاً: گرم، مزاحیہ، اور ہر بات میں حوصلہ دینے والی"
              data-testid="input-character-personality"
            />
          </label>
          <div className="uchar-form-actions">
            <button type="button" onClick={saveForm} data-testid="button-character-save">✅ محفوظ کریں</button>
            <button type="button" onClick={() => { setShowCreate(false); setEditId(null); }} data-testid="button-character-cancel">منسوخ کریں</button>
          </div>
          <p className="upanel-empty">
            آواز وہی رہے گی جو چنی ہے — یونیکا والی یا یونیک والی۔ کردار کا اپنا نیا آواز کا انجن نہیں ہے، اس لیے نام، شخصیت اور لہجہ بدلتا ہے، آواز نہیں۔
          </p>
        </div>
      )}

      {note && (
        <p className="upanel-empty" role="status" data-testid="characters-note">{note}</p>
      )}
    </div>
  );
}
