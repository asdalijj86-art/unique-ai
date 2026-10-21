/**
 * QuranReader — Holy Quran with Urdu translation (Fateh Muhammad Jalandhry).
 *
 * - Surah list (searchable by Urdu/Arabic/English name or number)
 * - Full surah view: Arabic (Uthmani, verbatim) + Urdu tarjuma below each ayah
 * - 🔊 buttons speak the URDU TRANSLATION only (never Arabic — TTS cannot do
 *   proper tajweed, and mispronouncing Quranic Arabic would be disrespectful)
 *
 * All text served verbatim from api.alquran.cloud via our server cache.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { Loader2, Search, Volume2, Square, BookOpen, ArrowRight, ListMusic } from 'lucide-react';
import { synthesizeMairaSpeech, synthesizeEdgeSpeech } from '@/lib/api';

type SurahMeta = {
  number: number;
  name: string;
  englishName: string;
  englishNameTranslation: string;
  numberOfAyahs: number;
  revelationType: string;
};

type Ayah = {
  number: number;
  numberInSurah: number;
  arabic: string;
  urdu: string;
};

type SurahDetail = SurahMeta & { ayahs: Ayah[] };

// Urdu names for all 114 surahs (standard names + common alternates for search)
const SURAH_URDU: Record<number, string> = {
  1: 'الفاتحہ', 2: 'البقرہ', 3: 'آل عمران', 4: 'النساء', 5: 'المائدہ',
  6: 'الانعام', 7: 'الاعراف', 8: 'الانفال', 9: 'التوبہ', 10: 'یونس',
  11: 'ہود', 12: 'یوسف', 13: 'الرعد', 14: 'ابراہیم', 15: 'الحجر',
  16: 'النحل', 17: 'بنی اسرائیل', 18: 'الکہف', 19: 'مریم', 20: 'طٰہٰ',
  21: 'الانبیاء', 22: 'الحج', 23: 'المومنون', 24: 'النور', 25: 'الفرقان',
  26: 'الشعراء', 27: 'النمل', 28: 'القصص', 29: 'العنکبوت', 30: 'الروم',
  31: 'لقمان', 32: 'السجدہ', 33: 'الاحزاب', 34: 'سبا', 35: 'فاطر',
  36: 'یٰسین', 37: 'الصٰفٰت', 38: 'ص', 39: 'الزمر', 40: 'المومن',
  41: 'حم سجدہ', 42: 'الشوریٰ', 43: 'الزخرف', 44: 'الدخان', 45: 'الجاثیہ',
  46: 'الاحقاف', 47: 'محمد', 48: 'الفتح', 49: 'الحجرات', 50: 'ق',
  51: 'الذاریات', 52: 'الطور', 53: 'النجم', 54: 'القمر', 55: 'الرحمٰن',
  56: 'الواقعہ', 57: 'الحدید', 58: 'المجادلہ', 59: 'الحشر', 60: 'الممتحنہ',
  61: 'الصف', 62: 'الجمعہ', 63: 'المنافقون', 64: 'التغابن', 65: 'الطلاق',
  66: 'التحریم', 67: 'الملک', 68: 'القلم', 69: 'الحاقہ', 70: 'المعارج',
  71: 'نوح', 72: 'الجن', 73: 'المزمل', 74: 'المدثر', 75: 'القیامہ',
  76: 'الدہر', 77: 'المرسلات', 78: 'النبأ', 79: 'النازعات', 80: 'عبس',
  81: 'التکویر', 82: 'الانفطار', 83: 'المطففین', 84: 'الانشقاق', 85: 'البروج',
  86: 'الطارق', 87: 'الاعلیٰ', 88: 'الغاشیہ', 89: 'الفجر', 90: 'البلد',
  91: 'الشمس', 92: 'اللیل', 93: 'الضحیٰ', 94: 'الشرح', 95: 'التین',
  96: 'العلق', 97: 'القدر', 98: 'البینہ', 99: 'الزلزال', 100: 'العادیات',
  101: 'القارعہ', 102: 'التکاثر', 103: 'العصر', 104: 'الہمزہ', 105: 'الفیل',
  106: 'قریش', 107: 'الماعون', 108: 'الکوثر', 109: 'الکافرون', 110: 'النصر',
  111: 'اللہب', 112: 'الاخلاص', 113: 'الفلق', 114: 'الناس',
};

// Alternate/common names for search
const SURAH_ALIASES: Record<number, string[]> = {
  17: ['الاسراء'], 36: ['یاسین', 'یٰس'], 40: ['غافر'], 41: ['فصلت'],
  55: ['رحمن', 'رحمٰن'], 56: ['واقعہ'], 67: ['تبارک'], 76: ['الانسان'],
  94: ['الانشراح'], 111: ['المسد'], 1: ['فاتحہ', 'الحمد'],
  2: ['بقرہ'], 18: ['کہف'], 112: ['قل ہو اللہ'],
};

const BISMILLAH = 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ';

export default function QuranReader({ autoplaySignal }: { autoplaySignal?: number } = {}) {
  const [surahs, setSurahs] = useState<SurahMeta[] | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<SurahDetail | null>(null);
  const [loadingSurah, setLoadingSurah] = useState(false);
  const [error, setError] = useState('');
  // TTS state
  const [speakingAyah, setSpeakingAyah] = useState<number | null>(null);
  const [speakingAll, setSpeakingAll] = useState(false);
  const [ttsBusy, setTtsBusy] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopAllRef = useRef(false);

  useEffect(() => {
    fetch('/api/quran/surahs')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setSurahs(data);
        else setError('فہرست نہیں مل سکی۔');
      })
      .catch(() => setError('سرور سے رابطہ نہیں ہو سکا۔'));
    return () => stopAudio();
  }, []);

  function stopAudio() {
    stopAllRef.current = true;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setSpeakingAyah(null);
    setSpeakingAll(false);
    setTtsBusy(false);
  }

  // Explain WHY the voice failed, in Urdu, from the server's classified
  // errorType — a silent failure left the user staring at a mute reader.
  function ttsErrorMessage(errorType?: string): string {
    switch (errorType) {
      case 'quota':
        return '⚠️ آواز کی key کا آج کا کوٹہ ختم ہے — کل دوبارہ کوشش کریں یا نئی key لگائیں۔';
      case 'auth':
        return '⚠️ Gemini key میں مسئلہ ہے — Settings میں key چیک کریں۔';
      case 'timeout':
      case 'network':
        return '⚠️ نیٹ سست ہے — آواز نہیں بن سکی، دوبارہ کوشش کریں۔';
      default:
        return 'آواز نہیں چل سکی۔';
    }
  }

  async function playUrdu(text: string): Promise<{ ok: boolean; errorType?: string }> {
    // One synthesis attempt with a hard 15s cap: a stalled synthesis must
    // surface as a timeout with a reason, never as endless silence.
    const withCap = (p: Promise<{ audioBase64: string; mimeType: string }>) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      return Promise.race([
        p,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject({ data: { errorType: 'timeout' } }), 15000);
        }),
      ]).finally(() => { if (timer) clearTimeout(timer); });
    };
    let result: { audioBase64: string; mimeType: string } | null = null;
    // PRIMARY: Edge TTS (Salman) — free, no key, NO daily quota, so the
    // tilawat plays day and night. If only Edge fails, no error is shown
    // as long as the Gemini fallback below succeeds.
    try {
      result = await withCap(synthesizeEdgeSpeech({ text }));
    } catch {
      result = null;
    }
    if (!result) {
      // FALLBACK: Gemini TTS (user keys) — its classified errorType is
      // what surfaces when both paths have failed.
      try {
        result = await withCap(synthesizeMairaSpeech({ text }));
      } catch (e: any) {
        return { ok: false, errorType: e?.data?.errorType || 'unknown' };
      }
    }
    if (stopAllRef.current) return { ok: false };
    const { audioBase64, mimeType } = result;
    const bytes = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: mimeType || 'audio/wav' });
    const url = URL.createObjectURL(blob);
    return await new Promise<{ ok: boolean; errorType?: string }>((resolve) => {
      const audio = new Audio(url);
      audio.playbackRate = 1.0; // natural pace for Quran translation
      audioRef.current = audio;
      audio.onended = () => { URL.revokeObjectURL(url); resolve({ ok: !stopAllRef.current }); };
      audio.onerror = () => { URL.revokeObjectURL(url); resolve({ ok: false }); };
      audio.play().catch(() => resolve({ ok: false }));
    });
  }

  async function speakAyah(ayah: Ayah) {
    if (speakingAyah === ayah.numberInSurah) { stopAudio(); return; }
    stopAudio();
    stopAllRef.current = false;
    setTtsBusy(true);
    setSpeakingAyah(ayah.numberInSurah);
    const r = await playUrdu(ayah.urdu);
    if (!r.ok && !stopAllRef.current) setError(ttsErrorMessage(r.errorType));
    setSpeakingAyah(null);
    setTtsBusy(false);
  }

  async function speakWholeSurah(surah?: SurahDetail) {
    const target = surah && Array.isArray(surah.ayahs) ? surah : selected;
    if (!target) return;
    if (speakingAll) { stopAudio(); return; }
    stopAudio();
    stopAllRef.current = false;
    setSpeakingAll(true);
    setTtsBusy(true);
    // Speak each ayah's Urdu translation in order. On failure, SAY WHY
    // (classified reason) instead of breaking in silence.
    for (const ayah of target.ayahs) {
      if (stopAllRef.current) break;
      setSpeakingAyah(ayah.numberInSurah);
      const r = await playUrdu(ayah.urdu);
      if (!r.ok) {
        if (!stopAllRef.current) setError(ttsErrorMessage(r.errorType));
        break;
      }
    }
    setSpeakingAyah(null);
    setSpeakingAll(false);
    setTtsBusy(false);
  }

  async function openSurah(n: number): Promise<SurahDetail | null> {
    stopAudio();
    setLoadingSurah(true);
    setError('');
    try {
      const res = await fetch(`/api/quran/surah/${n}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'error');
      setSelected(data);
      return data as SurahDetail;
    } catch {
      setError('سورۃ نہیں کھل سکی۔ دوبارہ کوشش کریں۔');
      return null;
    } finally {
      setLoadingSurah(false);
    }
  }

  // Voice-command autoplay («مجھے قرآن پاک کی تلاوت سناؤ»): the chat bumps
  // autoplaySignal when a recite command opens this reader. Open Surah
  // Al-Fatiha and speak its translation right away — opening in silence
  // was the bug. Guarded so a signal can never start two recitations.
  const autoplaySeenRef = useRef(0);
  const autoplayingRef = useRef(false);
  useEffect(() => {
    if (!autoplaySignal || autoplaySignal <= autoplaySeenRef.current) return;
    autoplaySeenRef.current = autoplaySignal;
    if (autoplayingRef.current) return;
    autoplayingRef.current = true;
    (async () => {
      try {
        const detail = await openSurah(1);
        // speakWholeSurah resets stopAllRef itself after its stopAudio().
        if (detail) await speakWholeSurah(detail);
      } finally {
        autoplayingRef.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoplaySignal]);

  const filtered = useMemo(() => {
    if (!surahs) return [];
    const q = search.trim();
    if (!q) return surahs;
    const qLower = q.toLowerCase();
    const qNum = parseInt(q, 10);
    return surahs.filter((s) => {
      if (!isNaN(qNum) && s.number === qNum) return true;
      const urduName = SURAH_URDU[s.number] || '';
      const aliases = (SURAH_ALIASES[s.number] || []).join(' ');
      return (
        urduName.includes(q) ||
        aliases.includes(q) ||
        s.name.includes(q) ||
        s.englishName.toLowerCase().includes(qLower) ||
        s.englishNameTranslation.toLowerCase().includes(qLower)
      );
    });
  }, [surahs, search]);

  // ---- Surah detail view ----
  if (selected) {
    const showBismillah = selected.number !== 1 && selected.number !== 9;
    return (
      <div dir="rtl" className="quran-reader">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <button type="button" className="tool-action-button" onClick={() => { stopAudio(); setSelected(null); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <ArrowRight size={14} /> فہرست
          </button>
          <button type="button" className="tool-action-button" onClick={() => speakWholeSurah()} disabled={ttsBusy && !speakingAll}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {speakingAll ? <><Square size={14} /> روکیں</> : <><ListMusic size={14} /> پوری سورۃ سناؤ (ترجمہ)</>}
          </button>
        </div>

        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#e9d5ff' }}>
            سورۃ {SURAH_URDU[selected.number] || selected.englishName}
          </div>
          <div className="tool-small-note">
            {selected.englishNameTranslation} • {selected.numberOfAyahs} آیات •
            {selected.revelationType === 'Meccan' ? ' مکی' : ' مدنی'}
          </div>
        </div>

        {showBismillah && (
          <div style={{
            textAlign: 'center', fontSize: 24, color: '#fde68a', marginBottom: 20,
            fontFamily: "'Amiri', 'Scheherazade New', serif", lineHeight: 2.2,
          }}>
            {BISMILLAH}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {selected.ayahs.map((ayah) => (
            <div key={ayah.numberInSurah} style={{
              background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.18)',
              borderRadius: 14, padding: '14px 16px',
            }}>
              <div style={{
                fontSize: 23, lineHeight: 2.3, color: '#fefce8', textAlign: 'right',
                fontFamily: "'Amiri', 'Scheherazade New', serif",
              }}>
                {ayah.arabic}
                <span style={{
                  display: 'inline-block', minWidth: 34, textAlign: 'center',
                  fontSize: 14, color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.4)',
                  borderRadius: 8, marginRight: 8, padding: '0 6px', verticalAlign: 'middle',
                }}>
                  {ayah.numberInSurah}
                </span>
              </div>
              <div style={{ fontSize: 15.5, lineHeight: 2, color: '#d1d5db', marginTop: 8 }}>
                {ayah.urdu}
              </div>
              <button type="button" className="tool-action-button"
                onClick={() => speakAyah(ayah)}
                disabled={ttsBusy && speakingAyah !== ayah.numberInSurah}
                style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                {speakingAyah === ayah.numberInSurah
                  ? <><Square size={13} /> روکیں</>
                  : <><Volume2 size={13} /> ترجمہ سناؤ</>}
              </button>
            </div>
          ))}
        </div>
        {error && <div className="tool-error" style={{ marginTop: 12 }}>{error}</div>}
      </div>
    );
  }

  // ---- Surah list view ----
  return (
    <div dir="rtl" className="quran-reader">
      <div style={{ textAlign: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#e9d5ff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <BookOpen size={20} /> قرآن پاک
        </div>
        <div className="tool-small-note">اردو ترجمہ (فتح محمد جالندھری) کے ساتھ • آواز میں صرف ترجمہ سنایا جاتا ہے</div>
      </div>

      <div style={{ position: 'relative', marginBottom: 12 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="سورۃ تلاش کریں… (نام یا نمبر)"
          className="tool-input"
          style={{ width: '100%', paddingLeft: 34 }}
        />
        <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
      </div>

      {error && <div className="tool-error" style={{ marginBottom: 10 }}>{error}</div>}

      {!surahs ? (
        <div className="tool-label"><Loader2 size={16} className="spin" /> فہرست لوڈ ہو رہی ہے…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 420, overflowY: 'auto', paddingLeft: 4 }}>
          {filtered.map((s) => (
            <button
              key={s.number}
              type="button"
              onClick={() => openSurah(s.number)}
              disabled={loadingSurah}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, textAlign: 'right',
                background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.18)',
                borderRadius: 12, padding: '10px 14px', cursor: 'pointer', color: 'inherit', width: '100%',
              }}
            >
              <span style={{
                minWidth: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center',
                justifyContent: 'center', background: 'rgba(139,92,246,0.2)', color: '#c4b5fd',
                fontWeight: 700, fontSize: 14, flexShrink: 0,
              }}>
                {s.number}
              </span>
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontWeight: 700, color: '#e9d5ff', fontSize: 15 }}>
                  {SURAH_URDU[s.number] || s.englishName}
                </span>
                <span className="tool-small-note" style={{ display: 'block' }}>
                  {s.englishNameTranslation} • {s.numberOfAyahs} آیات
                </span>
              </span>
              <span style={{ fontSize: 17, color: '#fde68a', fontFamily: "'Amiri', serif" }}>{s.name}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="tool-label">کوئی سورۃ نہیں ملی۔</div>
          )}
        </div>
      )}
      {loadingSurah && <div className="tool-label" style={{ marginTop: 10 }}><Loader2 size={16} className="spin" /> سورۃ کھل رہی ہے…</div>}
    </div>
  );
}
