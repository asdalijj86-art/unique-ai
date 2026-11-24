/**
 * FrontExtras — the front's bottom-strip cards + the create-skill
 * dialog (2026-11-24, Stonic-video build). All own Unique brand.
 *
 *   - UniquePlayer: REAL YouTube music — the YouTube embed's public
 *     search playlist (listType=search, no key, no account). Type a
 *     query, it plays YouTube's results for it.
 *   - MediaLinkCard: status ONLY — camera is OFFLINE (not connected;
 *     camera awareness is a future phase, never claimed live here).
 *   - HeadlinesCard: NO fake live news — it says plainly that no
 *     live feed is connected, with a real Google News link.
 *   - SupportButton: WhatsApp as a SUPPORT button/link ONLY — it
 *     opens a real wa.me link to the number the user saves in
 *     Settings. Never an in-app WhatsApp chat.
 *   - SkillsDialog: SKILL NAME / DESCRIPTION / INSTRUCTIONS +
 *     Cancel / Save; saved skills live in lib/custom-skills and are
 *     genuinely sent to the brain with every message.
 */

import { useState } from 'react';

// ---------------------------------------------------------------------------
// UniquePlayer — YouTube music, own name, real playback.
// ---------------------------------------------------------------------------

const PLAYER_PRESETS: { label: string; query: string }[] = [
  { label: 'نعت شریف', query: 'naat sharif' },
  { label: 'حمد', query: 'hamd naat' },
  { label: 'پرسکون موسیقی', query: 'calm ambient music' },
  { label: 'تلاوت', query: 'quran recitation' },
];

export function UniquePlayer() {
  const [query, setQuery] = useState('naat sharif');
  const [playingQuery, setPlayingQuery] = useState('naat sharif');
  const [dialogOpen, setDialogOpen] = useState(false);
  const src = `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(playingQuery)}`;
  const youtubeSearch = `https://www.youtube.com/results?search_query=${encodeURIComponent(playingQuery)}`;
  return (
    <div className="ustrip-card" data-testid="unique-player" dir="rtl">
      <div className="ustrip-title">🎵 Unique Player</div>
      <form
        className="uplayer-search"
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim()) setPlayingQuery(query.trim());
        }}
      >
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="موسیقی تلاش کریں…"
          aria-label="یوٹیوب موسیقی تلاش کریں"
          data-testid="input-player-search"
        />
        <button type="submit" data-testid="button-player-search">▶ چلائیں</button>
      </form>
      <div className="uplayer-presets">
        {PLAYER_PRESETS.map((p) => (
          <button
            key={p.query}
            type="button"
            className={`uplayer-preset${playingQuery === p.query ? ' active' : ''}`}
            onClick={() => {
              setQuery(p.query);
              setPlayingQuery(p.query);
            }}
            data-testid={`button-player-preset-${p.label}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {!dialogOpen && (
        <iframe
          key={playingQuery}
          className="uplayer-frame"
          src={src}
          title="Unique Player — YouTube موسیقی"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          data-testid="player-youtube-frame"
        />
      )}
      <button
        type="button"
        className="uplayer-open-btn"
        onClick={() => setDialogOpen(true)}
        data-testid="button-open-player"
      >
        ▶ پلیئر کھولیں
      </button>
      <p className="ustrip-note">YouTube سے چل رہا ہے — اگر کوئی ویڈیو نہ چلے تو تلاش بدلیں۔</p>
      {dialogOpen && (
        <div
          className="ufront-dialog-overlay"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDialogOpen(false);
          }}
        >
          <div className="ufront-dialog" role="dialog" aria-label="Unique Player">
            <div className="ufront-dialog-head" dir="rtl">
              <span className="ufront-dialog-title">🎵 Unique Player — {playingQuery}</span>
              <button
                type="button"
                className="ufront-dialog-close"
                onClick={() => setDialogOpen(false)}
                aria-label="بند کریں"
              >
                ✕
              </button>
            </div>
            <div className="ufront-dialog-body">
              <iframe
                key={playingQuery}
                className="uplayer-dialog-frame"
                src={src}
                title="Unique Player — YouTube موسیقی"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                data-testid="player-youtube-frame-dialog"
              />
              <p className="ustrip-note" style={{ display: 'block', marginTop: 8 }}>
                اگر یہاں بھی ویڈیو نہ چلے تو{' '}
                <a href={youtubeSearch} target="_blank" rel="noopener noreferrer" style={{ color: '#7dd3fc' }}>
                  YouTube پر کھولیں
                </a>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MediaLinkCard — status only. Camera: OFFLINE, honestly.
// ---------------------------------------------------------------------------

export function MediaLinkCard({ micLive }: { micLive: boolean }) {
  return (
    <div className="ustrip-card" data-testid="media-link" dir="rtl">
      <div className="ustrip-title">📡 MEDIA LINK</div>
      <div className="umedia-rows">
        <div className="umedia-row">
          <span className="umedia-dot off" aria-hidden="true" />
          <span>کیمرا</span>
          <strong>OFFLINE</strong>
        </div>
        <div className="umedia-row">
          <span className={`umedia-dot${micLive ? ' on' : ' off'}`} aria-hidden="true" />
          <span>مائیک</span>
          <strong>{micLive ? 'LIVE' : 'بند'}</strong>
        </div>
      </div>
      <p className="ustrip-note">کیمرا ابھی منسلک نہیں — کیمرا آگاہی بعد کی مرحلہ ہے، ابھی صرف حیثیت دکھائی جا رہی ہے۔</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HeadlinesCard — no fake news: clearly labelled placeholder.
// ---------------------------------------------------------------------------

export function HeadlinesCard() {
  return (
    <div className="ustrip-card" data-testid="headlines" dir="rtl">
      <div className="ustrip-title">📰 آج کی سرخیاں</div>
      <p className="ustrip-note">
        لائیو خبریں ابھی منسلک نہیں ہیں — اس لیے یہاں کوئی جعلی سرخی نہیں دکھائی جا رہی۔
      </p>
      <button
        type="button"
        className="ustrip-btn"
        onClick={() => window.open('https://news.google.com', '_blank', 'noopener')}
        data-testid="button-open-news"
      >
        📰 Google News کھولیں
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SupportButton — WhatsApp SUPPORT link only. Real wa.me link to the
// number the user saves; without a number it asks for one first.
// ---------------------------------------------------------------------------

const SUPPORT_NUMBER_KEY = 'unique-ai-support-whatsapp';

export function SupportButton({
  supportNumber,
  onSaveNumber,
}: {
  supportNumber: string;
  onSaveNumber: (number: string) => void;
}) {
  const [asking, setAsking] = useState(false);
  const [draft, setDraft] = useState(supportNumber);

  const openSupport = () => {
    const digits = supportNumber.replace(/\D/g, '');
    if (!digits) {
      setDraft('');
      setAsking(true);
      return;
    }
    window.open(
      `https://wa.me/${digits}?text=${encodeURIComponent('السلام علیکم! Unique AI سپورٹ سے بات کرنی ہے۔')}`,
      '_blank',
      'noopener',
    );
  };

  return (
    <div className="ustrip-card ustrip-support" data-testid="whatsapp-support" dir="rtl">
      <div className="ustrip-title">💬 WhatsApp سپورٹ</div>
      {asking ? (
        <form
          className="usupport-form"
          onSubmit={(e) => {
            e.preventDefault();
            const digits = draft.replace(/\D/g, '');
            if (!digits) return;
            try {
              window.localStorage.setItem(SUPPORT_NUMBER_KEY, digits);
            } catch { /* ignore */ }
            onSaveNumber(digits);
            setAsking(false);
          }}
        >
          <input
            type="tel"
            dir="ltr"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="923001234567"
            aria-label="WhatsApp سپورٹ نمبر"
            data-testid="input-support-number"
          />
          <button type="submit" data-testid="button-save-support-number">محفوظ کریں</button>
          <button type="button" onClick={() => setAsking(false)}>منسوخ</button>
          <p className="ustrip-note">سپورٹ نمبر صرف اسی ڈیوائس پر محفوظ ہوتا ہے۔</p>
        </form>
      ) : (
        <>
          <p className="ustrip-note">
            {supportNumber
              ? 'مدد چاہیے؟ WhatsApp پر سپورٹ سے بات کریں۔'
              : 'سپورٹ نمبر ابھی سیٹ نہیں — پہلے نمبر شامل کریں۔'}
          </p>
          <button
            type="button"
            className="usupport-btn"
            onClick={openSupport}
            data-testid="button-whatsapp-support"
          >
            💬 {supportNumber ? 'WhatsApp پر سپورٹ' : 'سپورٹ نمبر شامل کریں'}
          </button>
        </>
      )}
    </div>
  );
}

export function readSupportNumber(): string {
  try {
    return window.localStorage.getItem(SUPPORT_NUMBER_KEY) || '';
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// LibraryStrip — LIBRARY under the Visual Hub (2026-11-25, Stonic front
// screenshot): the hub's saved drawings — recent assistant replies that
// actually drew numbered steps. Real items only; tapping one shows its
// drawing in the hub again. Empty when nothing was ever drawn.
// ---------------------------------------------------------------------------

export type LibraryItem = { title: string; date: string; text: string; at: number };

export function LibraryStrip({
  items,
  onOpenItem,
}: {
  items: LibraryItem[];
  onOpenItem: (item: LibraryItem) => void;
}) {
  return (
    <section className="ulib" data-testid="library-strip" dir="rtl" aria-label="لائبریری">
      <div className="ulib-title">📚 LIBRARY — محفوظ ڈرائنگ</div>
      {items.length === 0 ? (
        <p className="ulib-empty">ابھی کوئی ڈرائنگ محفوظ نہیں — کچھ قدم بہ قدم پوچھیں، مراحل یہاں محفوظ ہوں گے۔</p>
      ) : (
        <ul className="ulib-items">
          {items.map((it, i) => (
            <li key={i}>
              <button
                type="button"
                className="ulib-item"
                onClick={() => onOpenItem(it)}
                data-testid={`library-item-${i}`}
                title="بصری مرکز میں یہ ڈرائنگ دوبارہ دیکھیں"
              >
                <span className="ulib-item-title">{it.title}</span>
                {it.date ? <span className="ulib-item-date">{it.date}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// SkillsDialog — SKILL NAME / DESCRIPTION / INSTRUCTIONS + Cancel/Save.
// ---------------------------------------------------------------------------

export function SkillsDialog({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (skill: { name: string; description: string; instructions: string }) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [error, setError] = useState('');

  return (
    <div
      className="ufront-dialog-overlay"
      data-testid="dialog-create-skill"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        className="ufront-dialog uskill-dialog"
        role="dialog"
        aria-label="نئی مہارت بنائیں"
        dir="rtl"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) {
            setError('مہارت کا نام لکھنا ضروری ہے۔');
            return;
          }
          onSave({ name: name.trim(), description: description.trim(), instructions: instructions.trim() });
        }}
      >
        <div className="ufront-dialog-head">
          <span className="ufront-dialog-title">🛠️ نئی مہارت بنائیں</span>
          <button type="button" className="ufront-dialog-close" onClick={onClose} aria-label="بند کریں">
            ✕
          </button>
        </div>
        <div className="ufront-dialog-body">
          <label className="uskill-field">
            <span>SKILL NAME — مہارت کا نام *</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: خریداری کی فہرست"
              data-testid="input-skill-name"
            />
          </label>
          <label className="uskill-field">
            <span>DESCRIPTION — تفصیل</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="یہ مہارت کیا کرتی ہے؟"
              rows={2}
              data-testid="input-skill-description"
            />
          </label>
          <label className="uskill-field">
            <span>INSTRUCTIONS — ہدایات</span>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="اس مہارت کو استعمال کرتے وقت کیا کرنا ہے؟"
              rows={3}
              data-testid="input-skill-instructions"
            />
          </label>
          {error && <p className="uskill-error" role="alert">{error}</p>}
          <p className="ustrip-note">
            محفوظ ہونے کے بعد یہ مہارت ہر پیغام کے ساتھ آپ کے اسسٹنٹ کو بھیجی جائے گی۔
          </p>
          <div className="uskill-actions">
            <button type="button" className="uskill-cancel" onClick={onClose} data-testid="button-skill-cancel">
              Cancel
            </button>
            <button type="submit" className="uskill-save" data-testid="button-skill-save">
              Save
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
