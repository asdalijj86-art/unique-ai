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
import { synthesizeMairaSpeech, synthesizeEdgeSpeech, TTS_PLAYBACK_RATE } from '@/lib/api';
import { synthesizeSalmanClientSide } from '@/lib/edge-tts';
import { registerAudioStop, stopOtherAudio } from '@/lib/audio-bus';
import { SURAH_URDU, SURAH_ALIASES } from '@/lib/surah-names';

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

const BISMILLAH = 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ';

export type QuranAutoplayRequest = { signal: number; surah: number; speak: boolean };

export default function QuranReader({ autoplayRequest }: { autoplayRequest?: QuranAutoplayRequest | null } = {}) {
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

  // Audio focus: when the chat voice starts speaking it silences this
  // reader through the bus (and playUrdu silences the chat in return) —
  // the two voices can never overlap. stopAudio is stable enough here:
  // it only touches refs and state setters.
  useEffect(() => registerAudioStop('quran', () => stopAudio()), []);

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
    // One voice at a time across the app: silence the chat voice first.
    stopOtherAudio('quran');
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
    // The Salman (Edge) legs' classified failure, remembered so the
    // reason shown at the end can be THEIRS (below).
    let edgeErrorType: string | undefined;
    // PRIMARY: client-side Edge TTS (Salman) straight from this
    // browser — free, no key, NO daily quota, so the tilawat plays day
    // and night, and fast (Microsoft throttles datacenter IPs, not
    // residential ones). Its own 12s budget sits inside withCap's 15s.
    try {
      result = await withCap(synthesizeSalmanClientSide(text));
    } catch (e: any) {
      edgeErrorType = e?.data?.errorType || 'network';
      result = null;
    }
    if (!result) {
      // FALLBACK 1: server-side Edge TTS (same Salman voice via our
      // server). If only the Edge paths fail, no error is shown as
      // long as the Gemini fallback below succeeds.
      try {
        result = await withCap(synthesizeEdgeSpeech({ text }));
      } catch (e: any) {
        if (!edgeErrorType) edgeErrorType = e?.data?.errorType || 'network';
        result = null;
      }
    }
    if (!result) {
      // FALLBACK 2: Gemini TTS (user keys). When every path has failed,
      // prefer the SALMAN legs' classification: this reader speaks with
      // Salman, so blaming the Gemini key's quota (when the Edge paths
      // actually failed on network/timeout) names the wrong culprit.
      try {
        result = await withCap(synthesizeMairaSpeech({ text }));
      } catch (e: any) {
        return { ok: false, errorType: edgeErrorType || e?.data?.errorType || 'unknown' };
      }
    }
    if (stopAllRef.current) return { ok: false };
    const { audioBase64, mimeType } = result;
    const bytes = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: mimeType || 'audio/wav' });
    const url = URL.createObjectURL(blob);
    return await new Promise<{ ok: boolean; errorType?: string }>((resolve) => {
      const audio = new Audio(url);
      // Same slightly-faster pace as the chat voice (user request
      // 2026-10-21), pitch preserved so the voice stays natural. Only
      // the Urdu TRANSLATION is ever spoken — never the Arabic text.
      audio.preservesPitch = true;
      audio.playbackRate = TTS_PLAYBACK_RATE;
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

  // Voice-command autoplay: the chat sends an autoplay REQUEST naming
  // the surah («سورۃ ناس پڑھ کر سناؤ» → surah 114; generic «تلاوت سناؤ»
  // → surah 1). Open THAT surah and — when speak is set — recite its
  // Urdu translation right away. Works on first mount AND when the
  // reader is already open (a fresh signal re-opens on the new surah
  // instead of re-running the generic open). Guarded so one signal can
  // never start two recitations.
  const autoplaySeenRef = useRef(0);
  const autoplayingRef = useRef(false);
  useEffect(() => {
    if (!autoplayRequest || autoplayRequest.signal <= autoplaySeenRef.current) return;
    autoplaySeenRef.current = autoplayRequest.signal;
    const { surah, speak } = autoplayRequest;
    if (autoplayingRef.current) {
      // A recitation is in flight: still honor the command — switch the
      // visible surah (openSurah stops the current audio and the old
      // speak loop exits on stopAllRef).
      void openSurah(surah);
      return;
    }
    autoplayingRef.current = true;
    (async () => {
      try {
        const detail = await openSurah(surah);
        // speakWholeSurah resets stopAllRef itself after its stopAudio().
        if (detail && speak) await speakWholeSurah(detail);
      } finally {
        autoplayingRef.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoplayRequest]);

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
