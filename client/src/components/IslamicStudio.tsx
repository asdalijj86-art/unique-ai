// Islamic Knowledge Studio — MASTER PROMPT implementation, 2026-10-31.
// ONE tool inside Unique AI. No paid API, no key, no large model,
// content loaded on demand, audio streamed (never bulk-loaded).
// SOURCES (free, public, no key):
//  - Quran text/audio: AlQuran Cloud API (api.alquran.cloud/v1) +
//    CDN cdn.islamic.network — Arabic Uthmani, Urdu Jalandhry,
//    English Saheeh International, Qari audio (ar.alafasy etc).
//  - Hadith: fawazahmed0 hadith-api via jsdelivr (eng-bukhari,
//    eng-muslim, eng-abudawud, eng-tirmidhi, eng-nasai, eng-ibnmajah).
// HONEST LIMITS, stated in the panel:
//  - Quran recitation is REAL recorded Qari audio, never TTS.
//    Read Aloud (browser speech) is ONLY for Urdu/English
//    explanations and translations, never for Quran Arabic.
//  - Tafsir is loaded only if the free API returns a tafsir
//    edition; otherwise the panel says so, it never invents one.
//  - Hadith grading is shown ONLY if the source returns it;
//    otherwise it says "Grading not shown in this source".
//  - The built-in Q&A gives general education only, never a
//    fatwa, and always recommends a qualified Mufti for rulings.
//  - Dua Arabic below is limited to widely known texts with a
//    Surah:Ayah or general collection reference; no hadith
//    numbers are invented.
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

export function isIslamicStudioOrder(text: string): boolean {
  return /(islamic|اسلامی|اسلامک|quran|قرآن|hadith|حدیث|islamic studio|اسلامی اسٹوڈیو|اسلامی سٹوڈیو)/i.test(String(text || ''));
}

const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #a7f3d0', marginBottom: 8, fontSize: 15, color: '#052e16', background: '#fefce8' };
const QARIS = [
  { id: 'ar.alafasy', name: 'Mishary Rashid Alafasy' },
  { id: 'ar.minshawi', name: 'Mohamed Siddiq El-Minshawi' },
  { id: 'ar.husary', name: 'Mahmoud Khalil Al-Husary' },
];
const HADITH_EDITIONS = [
  { id: 'eng-bukhari', name: 'Sahih al-Bukhari' }, { id: 'eng-muslim', name: 'Sahih Muslim' },
  { id: 'eng-abudawud', name: 'Sunan Abu Dawud' }, { id: 'eng-tirmidhi', name: 'Jami at-Tirmidhi' },
  { id: 'eng-nasai', name: "Sunan an-Nasa'i" }, { id: 'eng-ibnmajah', name: 'Sunan Ibn Majah' },
];
const SCHOLARS = [
  { name: 'Imam Bukhari', work: 'Sahih al-Bukhari', note: 'Compiler of the most authentic Hadith collection after the Quran, in Sunni scholarship.' },
  { name: 'Imam Muslim', work: 'Sahih Muslim', note: 'Compiler of Sahih Muslim, the second most authentic collection in Sunni scholarship.' },
  { name: 'Imam Abu Hanifa', work: 'Hanafi fiqh', note: 'Founder of the Hanafi school of thought.' },
  { name: 'Imam Malik', work: 'Muwatta Imam Malik', note: 'Founder of the Maliki school; Muwatta is an early Hadith and fiqh work.' },
  { name: 'Imam Shafi\'i', work: 'Al-Risala, Kitab al-Umm', note: 'Founder of the Shafi\'i school.' },
  { name: 'Imam Ahmad ibn Hanbal', work: 'Musnad Ahmad', note: 'Founder of the Hanbali school.' },
  { name: 'Imam Nawawi', work: 'Riyad as-Salihin, Forty Hadith', note: 'Shafi\'i scholar known for accessible Hadith collections.' },
  { name: 'Ibn Kathir', work: 'Tafsir Ibn Kathir', note: 'Quran commentator and historian.' },
  { name: 'Mufti Muhammad Shafi', work: 'Maariful Quran', note: 'Urdu Tafsir widely read in South Asia.' },
];
const CATEGORIES = [
  { title: 'Tawheed and Aqeedah', text: 'Belief in the Oneness of Allah, His names and attributes, and belief in angels, books, messengers, the Last Day and divine decree — the foundation of Islam.' },
  { title: 'Salah and Prayer', text: 'Five obligatory prayers a day: Fajr, Zuhr, Asr, Maghrib and Isha. Learn their times, steps and conditions from the Quran and Hadith sections.' },
  { title: 'Wudu and Purification', text: 'Wudu is washing the face, arms to the elbows, wiping the head, and washing the feet — in order, with intention. Details differ slightly between schools; consult a scholar for rulings.' },
  { title: 'Fasting and Ramadan', text: 'Fasting in Ramadan is obligatory for able adults: no food, drink or marital relations from dawn to sunset, with the intention of worship.' },
  { title: 'Zakat', text: 'Zakat is the obligatory charity on wealth held for a lunar year above the nisab, generally 2.5% on cash and trade goods. Exact nisab and categories need a scholar for your case.' },
  { title: 'Hajj and Umrah', text: 'Hajj is the pilgrimage to Makkah in Dhul-Hijjah, obligatory once in a lifetime for those able. Umrah is the lesser pilgrimage, performed any time of year.' },
  { title: 'Marriage and Family', text: 'Marriage in Islam is a contract with mutual rights and kindness. Family ties, parents\' rights and children\'s upbringing are central duties.' },
  { title: 'Daily Sunnah', text: 'Sunnahs of eating, sleeping, entering and leaving home, greeting with Salam, and keeping the tongue clean — small acts with great reward.' },
  { title: 'Seerah of Prophet Muhammad ﷺ', text: 'The life of the Prophet ﷺ: born in Makkah, received revelation at 40, migrated to Madinah, and established the Muslim community. Study it from verified Seerah books.' },
  { title: 'Stories of the Prophets', text: 'Stories of Adam, Nuh, Ibrahim, Musa, Isa and others (peace be upon them) — told in the Quran as lessons in patience, trust and obedience.' },
];
const DUAS = [
  { title: 'Before Sleeping', arabic: 'بِاسْمِكَ اللَّهُمَّ أَمُوتُ وَأَحْيَا', urdu: 'اے اللہ! تیرے نام سے میں مرتا اور جیتا ہوں۔', ref: 'Sahih al-Bukhari (general collection reference; no number invented)' },
  { title: 'Morning Azkar', arabic: 'أَصْبَحْنَا وَأَصْبَحَ الْمُلْكُ لِلَّهِ', urdu: 'ہم نے صبح کی اور ساری بادشاہت اللہ کی ہے۔', ref: 'Morning dhikr, Sahih Muslim (general reference)' },
  { title: 'Dua for Parents', arabic: 'رَبِّ ارْحَمْهُمَا كَمَا رَبَّيَانِي صَغِيرًا', urdu: 'اے میرے رب! ان دونوں پر رحم فرما جیسے انہوں نے بچپن میں میری پرورش کی۔', ref: 'Quran 17:24' },
  { title: 'Dua for Forgiveness', arabic: 'رَبَّنَا ظَلَمْنَا أَنفُسَنَا وَإِن لَّمْ تَغْفِرْ لَنَا وَتَرْحَمْنَا لَنَكُونَنَّ مِنَ الْخَاسِرِينَ', urdu: 'اے ہمارے رب! ہم نے اپنی جانوں پر ظلم کیا، اگر تو نے ہمیں نہ بخشا اور رحم نہ کیا تو ہم نقصان اٹھانے والوں میں سے ہوں گے۔', ref: 'Quran 7:23' },
  { title: 'Dua for This World and Hereafter', arabic: 'رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ', urdu: 'اے ہمارے رب! ہمیں دنیا میں بھلائی دے اور آخرت میں بھلائی دے اور ہمیں آگ کے عذاب سے بچا۔', ref: 'Quran 2:201' },
];

export default function IslamicStudio({ onClose }: { onClose: () => void }) {
  const [section, setSection] = useState<'quran' | 'hadith' | 'scholars' | 'knowledge' | 'dua' | 'qa'>('quran');
  const [surahs, setSurahs] = useState<any[]>([]);
  const [surahNo, setSurahNo] = useState(1);
  const [juzNo, setJuzNo] = useState(1);
  const [ayahs, setAyahs] = useState<any[]>([]);
  const [surahName, setSurahName] = useState('');
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [arabicSize, setArabicSize] = useState(26);
  const [urduSize, setUrduSize] = useState(17);
  const [dark, setDark] = useState(false);
  const [qari, setQari] = useState('ar.alafasy');
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState<number | null>(null);
  const [repeatAyah, setRepeatAyah] = useState(false);
  const [bookmarks, setBookmarks] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('unique-ai-quran-bookmarks') || '[]'); } catch { return []; } });
  const [tafsir, setTafsir] = useState('');
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [hadithEdition, setHadithEdition] = useState('eng-bukhari');
  const [hadithNo, setHadithNo] = useState(1);
  const [hadith, setHadith] = useState<any>(null);
  const [qa, setQa] = useState('');
  const [qaAnswer, setQaAnswer] = useState('');

  useEffect(() => { fetch('https://api.alquran.cloud/v1/surah').then((r) => r.json()).then((j) => setSurahs(j.data || [])).catch(() => setError('Surah list could not be loaded — check internet and retry.')); }, []);

  async function loadSurah(n: number) {
    setLoading('Loading Surah…'); setError(''); setTafsir('');
    try {
      const r = await fetch(`https://api.alquran.cloud/v1/surah/${n}/editions/quran-uthmani,ur.jalandhry,en.sahih`);
      const j = await r.json(); if (j.code !== 200) throw new Error('surah load failed');
      const [ar, ur, en] = j.data; setSurahName(`${ar.englishName} — ${ar.name}`);
      setAyahs(ar.ayahs.map((a: any, i: number) => ({ number: a.number, inSurah: a.numberInSurah, arabic: a.text, urdu: ur.ayahs[i]?.text || '', english: en.ayahs[i]?.text || '' })));
      localStorage.setItem('unique-ai-quran-progress', JSON.stringify({ surah: n, at: Date.now() }));
    } catch { setError('This Surah could not be loaded from the free Quran API. Please retry.'); }
    setLoading('');
  }
  async function loadJuz(n: number) {
    setLoading('Loading Juz…'); setError('');
    try {
      const r = await fetch(`https://api.alquran.cloud/v1/juz/${n}/quran-uthmani`);
      const j = await r.json(); if (j.code !== 200) throw new Error('juz load failed');
      setSurahName(`Juz ${n}`); setAyahs(j.data.ayahs.map((a: any) => ({ number: a.number, inSurah: a.numberInSurah, arabic: a.text, urdu: '', english: '', surah: a.surah.englishName })));
    } catch { setError('This Juz could not be loaded. Please retry.'); }
    setLoading('');
  }
  async function loadTafsir() {
    setLoading('Loading Tafsir editions…');
    try {
      const e = await fetch('https://api.alquran.cloud/v1/edition/format/tafsir').then((r) => r.json());
      const first = e.data?.[0]; if (!first) { setTafsir('No tafsir edition is available from this free source right now.'); setLoading(''); return; }
      const r = await fetch(`https://api.alquran.cloud/v1/surah/${surahNo}/${first.identifier}`);
      const j = await r.json(); const text = j.data?.ayahs?.[0]?.text || '';
      setTafsir(`Source: ${first.englishName || first.identifier} (as listed by AlQuran Cloud). First ayah of this Surah: ${text}`);
    } catch { setTafsir('Tafsir could not be loaded from the free source right now.'); }
    setLoading('');
  }
  async function loadHadith() {
    setLoading('Loading Hadith…'); setError(''); setHadith(null);
    try {
      const r = await fetch(`https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/${hadithEdition}/${hadithNo}.json`);
      const j = await r.json(); const h = j.hadiths?.[0]; if (!h) throw new Error('hadith not found');
      setHadith(h);
    } catch { setError('This Hadith could not be loaded from the free Hadith API. Try another number or collection.'); }
    setLoading('');
  }
  async function runSearch() {
    if (!search.trim()) return; setLoading('Searching…');
    try {
      const r = await fetch(`https://api.alquran.cloud/v1/search/${encodeURIComponent(search)}/all/quran-uthmani`);
      const j = await r.json(); setSearchResults((j.data?.matches || []).slice(0, 20));
      if (!j.data?.matches?.length) setError('No Quran match found for this search in the free API. Try a Surah name or number above.');
    } catch { setError('Search could not run. Please retry.'); }
    setLoading('');
  }
  function speak(text: string) {
    if (!('speechSynthesis' in window)) { setError('Read Aloud is not supported by this browser.'); return; }
    window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = /[\u0600-\u06FF]/.test(text) ? 'ur-PK' : 'en-US'; window.speechSynthesis.speak(u);
  }
  function toggleBookmark(key: string) {
    const next = bookmarks.includes(key) ? bookmarks.filter((b) => b !== key) : [...bookmarks, key];
    setBookmarks(next); localStorage.setItem('unique-ai-quran-bookmarks', JSON.stringify(next));
  }
  function answerQa() {
    const q = qa.toLowerCase();
    let a = 'This is general Islamic education only, not a fatwa. ';
    if (q.includes('wudu') || q.includes('وضو')) a += 'Wudu: wash face, arms to elbows, wipe head, wash feet, in order, with intention. For a ruling in your case, consult a qualified Mufti.';
    else if (q.includes('prayer') || q.includes('namaz') || q.includes('نماز') || q.includes('salah')) a += 'Five prayers are obligatory: Fajr (2), Zuhr (4), Asr (4), Maghrib (3), Isha (4) rakahs of Fard. Use the Quran and Hadith sections above for references.';
    else if (q.includes('zakat') || q.includes('زکوٰۃ')) a += 'Zakat is obligatory charity, generally 2.5% on cash/trade wealth held a lunar year above nisab. Nisab and your exact case need a scholar.';
    else if (q.includes('fast') || q.includes('roza') || q.includes('روزہ')) a += 'Fasting in Ramadan is obligatory for able adults from dawn to sunset. Sick, travelling and other exemptions have scholarly details — consult a Mufti for your case.';
    else a += 'Reliable evidence for this exact question is not in the built-in general summaries. Use the Search above for Quran verses, or the Hadith section, and for any ruling consult a qualified Mufti or scholar. Do not treat an AI answer as a fatwa.';
    setQaAnswer(a);
  }
  const filteredSurahs = surahs.filter((s) => !search || s.englishName.toLowerCase().includes(search.toLowerCase()) || String(s.number) === search.trim());

  return (
    <div style={{ background: dark ? '#052e16' : '#f0fdf4', color: dark ? '#fefce8' : '#052e16', borderRadius: 16, padding: 16, margin: 12, boxShadow: '0 4px 24px rgba(0,0,0,.3)', maxHeight: '85vh', overflowY: 'auto', border: '2px solid #d4af37' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>🕌 Islamic Knowledge Studio — Unique AI</h3>
        <button type="button" onClick={onClose} aria-label="بند کریں"><X size={18} /></button>
      </div>
      <p style={{ fontSize: 13 }}>Free, lightweight, on-demand. Quran text/audio: AlQuran Cloud + Islamic Network CDN. Hadith: fawazahmed0 Hadith API. Quran audio is real Qari recording, never AI voice. Read Aloud is only for Urdu/English explanations, never for Quran Arabic.</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {(['quran', 'hadith', 'scholars', 'knowledge', 'dua', 'qa'] as const).map((s) => (
          <button key={s} type="button" onClick={() => setSection(s)} style={{ padding: '8px 14px', borderRadius: 999, background: section === s ? '#047857' : '#d1fae5', color: section === s ? '#fff' : '#052e16' }}>{s === 'quran' ? 'Quran Pak' : s === 'hadith' ? 'Hadith' : s === 'scholars' ? 'Scholars & Books' : s === 'knowledge' ? 'Knowledge Center' : s === 'dua' ? 'Dua & Azkar' : 'Islamic Q&A'}</button>
        ))}
        <button type="button" onClick={() => setDark(!dark)} style={{ padding: '8px 14px', borderRadius: 999, background: '#d4af37', color: '#052e16' }}>{dark ? 'Light Mode' : 'Dark Mode'}</button>
      </div>
      <label>Global search (Surah name/number, or Quran text): <input style={inputStyle} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. Baqarah, 2, or an Arabic word" /></label>
      <button type="button" onClick={runSearch} style={{ padding: '8px 16px', borderRadius: 999, background: '#047857', color: '#fff' }}>Search Quran</button>
      {loading && <p>{loading}</p>} {error && <p style={{ color: '#b91c1c' }}>{error}</p>}
      {searchResults.length > 0 && (
        <div><strong>Search results (source: AlQuran Cloud, quran-uthmani):</strong>
          {searchResults.map((m: any, i: number) => <p key={i} style={{ fontSize: 14 }}><b>{m.surah?.englishName} {m.numberInSurah}</b> — <span dir="rtl" lang="ar">{m.text}</span></p>)}
        </div>
      )}

      {section === 'quran' && (
        <div>
          <label>Surah number (1–114): <input type="number" min={1} max={114} value={surahNo} onChange={(e) => setSurahNo(Number(e.target.value))} style={inputStyle} /></label>
          <button type="button" onClick={() => loadSurah(surahNo)} style={{ padding: '8px 16px', borderRadius: 999, background: '#047857', color: '#fff', marginRight: 8 }}>Load Surah</button>
          <label>Juz (1–30): <input type="number" min={1} max={30} value={juzNo} onChange={(e) => setJuzNo(Number(e.target.value))} style={inputStyle} /></label>
          <button type="button" onClick={() => loadJuz(juzNo)} style={{ padding: '8px 16px', borderRadius: 999, background: '#047857', color: '#fff' }}>Load Juz</button>
          <p style={{ fontSize: 13 }}>Surahs: {filteredSurahs.slice(0, 20).map((s) => `${s.number}. ${s.englishName}`).join(', ')}{surahs.length > 20 ? ' … (search to narrow)' : ''}</p>
          <label>Arabic font size: <input type="range" min={18} max={40} value={arabicSize} onChange={(e) => setArabicSize(Number(e.target.value))} /> {arabicSize}px</label><br />
          <label>Urdu font size: <input type="range" min={14} max={26} value={urduSize} onChange={(e) => setUrduSize(Number(e.target.value))} /> {urduSize}px</label><br />
          <label>Qari: <select style={inputStyle} value={qari} onChange={(e) => setQari(e.target.value)}>{QARIS.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}</select></label>
          <label>Playback speed: <select style={inputStyle} value={speed} onChange={(e) => setSpeed(Number(e.target.value))}><option value={0.75}>0.75x</option><option value={1}>1x</option><option value={1.25}>1.25x</option><option value={1.5}>1.5x</option></select></label>
          <label><input type="checkbox" checked={repeatAyah} onChange={(e) => setRepeatAyah(e.target.checked)} /> Repeat this Ayah</label>
          <button type="button" onClick={loadTafsir} style={{ padding: '8px 16px', borderRadius: 999, background: '#d4af37', color: '#052e16', marginLeft: 8 }}>Load Tafsir (if available)</button>
          {tafsir && <p style={{ fontSize: 14, background: '#fefce8', color: '#052e16', padding: 10, borderRadius: 8 }}>{tafsir} — Translation and Tafsir are shown separately, never mixed.</p>}
          <h4>{surahName}</h4>
          <p style={{ fontSize: 13 }}>Bookmarks: {bookmarks.join(', ') || 'none yet'} • Reading progress is saved on this device only.</p>
          {ayahs.slice(0, 50).map((a: any) => (
            <div key={a.number} style={{ borderBottom: '1px solid #a7f3d0', padding: '10px 0', background: playing === a.number ? '#fef9c3' : 'transparent' }}>
              <p dir="rtl" lang="ar" style={{ fontSize: arabicSize, margin: '4px 0', color: dark ? '#fefce8' : '#052e16' }}>{a.arabic} ﴿{a.inSurah}﴾</p>
              {a.urdu && <p style={{ fontSize: urduSize, margin: '4px 0' }}><b>Urdu (Jalandhry):</b> {a.urdu}</p>}
              {a.english && <p style={{ fontSize: 14, margin: '4px 0' }}><b>English (Saheeh International):</b> {a.english}</p>}
              <button type="button" onClick={() => { const audio = new Audio(`https://cdn.islamic.network/quran/audio/128/${qari}/${a.number}.mp3`); audio.playbackRate = speed; audio.loop = repeatAyah; audio.play(); setPlaying(a.number); audio.onended = () => setPlaying(null); }} style={{ padding: '6px 12px', borderRadius: 999, background: '#047857', color: '#fff' }}>▶ Play Ayah (Qari, not TTS)</button>
              <button type="button" onClick={() => toggleBookmark(`${surahName} — Ayah ${a.inSurah}`)} style={{ padding: '6px 12px', borderRadius: 999, background: '#d4af37', color: '#052e16', marginLeft: 6 }}>Bookmark</button>
              {a.urdu && <button type="button" onClick={() => speak(a.urdu)} style={{ padding: '6px 12px', borderRadius: 999, background: '#312e81', color: '#fff', marginLeft: 6 }}>Read Aloud (Urdu translation only)</button>}
            </div>
          ))}
          {ayahs.length > 50 && <p>Showing first 50 ayahs for Chromebook memory — load a smaller Surah or use Juz navigation for the rest.</p>}
          <p><b>Full Surah audio (streamed, not downloaded in bulk):</b> <audio controls src={`https://cdn.islamic.network/quran/audio-surah/128/${qari}/${surahNo}.mp3`} style={{ width: '100%' }} /></p>
        </div>
      )}

      {section === 'hadith' && (
        <div>
          <label>Collection: <select style={inputStyle} value={hadithEdition} onChange={(e) => setHadithEdition(e.target.value)}>{HADITH_EDITIONS.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
          <label>Hadith number: <input type="number" min={1} value={hadithNo} onChange={(e) => setHadithNo(Number(e.target.value))} style={inputStyle} /></label>
          <button type="button" onClick={loadHadith} style={{ padding: '8px 16px', borderRadius: 999, background: '#047857', color: '#fff' }}>Load Hadith</button>
          <p style={{ fontSize: 13 }}>Note: this free source gives English text. Arabic text and Urdu translation are not in this source, so they are not invented here — check sunnah.com for the full Arabic/Urdu of the same number.</p>
          {hadith && (
            <div style={{ background: '#fefce8', color: '#052e16', padding: 12, borderRadius: 8 }}>
              <p><b>Collection:</b> {HADITH_EDITIONS.find((h) => h.id === hadithEdition)?.name} • <b>Hadith No:</b> {hadith.hadithnumber}</p>
              <p>{hadith.text}</p>
              <p><b>Grade:</b> {hadith.grades?.[0]?.grade || 'Grading not shown in this source'} {hadith.grades?.[0]?.name ? `(graded by: ${hadith.grades[0].name})` : '(no grader named in this source)'}</p>
              <button type="button" onClick={() => speak(hadith.text)} style={{ padding: '6px 12px', borderRadius: 999, background: '#312e81', color: '#fff' }}>Read Aloud (explanation)</button>
            </div>
          )}
          <p style={{ fontSize: 13 }}>Other collections in the prompt (Muwatta, Musnad Ahmad, Riyad as-Salihin, Forty Hadith) are not in this free English API edition list, so they are not faked here — use the collections above, or tell me and I will add a verified source for them.</p>
        </div>
      )}

      {section === 'scholars' && (
        <div>{SCHOLARS.map((s) => <div key={s.name} style={{ borderBottom: '1px solid #a7f3d0', padding: '8px 0' }}><strong>{s.name}</strong> — {s.work}<p style={{ margin: '4px 0', fontSize: 14 }}>{s.note} No statement is attributed to a scholar without a source; these are general biographical notes only.</p></div>)}</div>
      )}
      {section === 'knowledge' && (
        <div>{CATEGORIES.filter((c) => !search || c.title.toLowerCase().includes(search.toLowerCase())).map((c) => <div key={c.title} style={{ borderBottom: '1px solid #a7f3d0', padding: '8px 0' }}><strong>{c.title}</strong><p style={{ margin: '4px 0', fontSize: 14 }}>{c.text}</p><button type="button" onClick={() => speak(c.text)} style={{ padding: '6px 12px', borderRadius: 999, background: '#312e81', color: '#fff' }}>Read Aloud</button></div>)}</div>
      )}
      {section === 'dua' && (
        <div>{DUAS.map((d) => <div key={d.title} style={{ borderBottom: '1px solid #a7f3d0', padding: '10px 0' }}><strong>{d.title}</strong><p dir="rtl" lang="ar" style={{ fontSize: 24 }}>{d.arabic}</p><p style={{ fontSize: 15 }}>{d.urdu}</p><p style={{ fontSize: 13 }}>Reference: {d.ref}</p><button type="button" onClick={() => speak(d.urdu)} style={{ padding: '6px 12px', borderRadius: 999, background: '#312e81', color: '#fff' }}>Read Aloud (Urdu only)</button></div>)}</div>
      )}
      {section === 'qa' && (
        <div>
          <p style={{ fontSize: 13 }}>Ask in simple Urdu, Arabic or English. This assistant gives general education with Quran/Hadith references where available — it is NOT a fatwa. For rulings, consult a qualified Mufti.</p>
          <input style={inputStyle} value={qa} onChange={(e) => setQa(e.target.value)} placeholder="e.g. How do I perform Wudu?" />
          <button type="button" onClick={answerQa} style={{ padding: '8px 16px', borderRadius: 999, background: '#047857', color: '#fff' }}>Ask</button>
          {qaAnswer && <p style={{ background: '#fefce8', color: '#052e16', padding: 12, borderRadius: 8 }}>{qaAnswer}</p>}
        </div>
      )}
    </div>
  );
}
