/**
 * Headless simulation of the Unique AI live-voice barge-in state machine.
 *
 * Mirrors, in miniature, the exact logic implemented in
 * client/src/pages/chat.tsx (2026-10-22):
 *   - the speech TICKET (interruptSpeech orphans every queued chunk,
 *     pending eager audio and browser-voice sentence),
 *   - the barge-in DETECTOR thresholds (ECHO-HARDENED 2026-10-24:
 *     sustained >= 800ms, >= 5 words, >= 3 novel words, >= 50% novel
 *     vs the text being spoken; NO instant-kill fast path for a final
 *     result — the old fast path fired on the first misrecognized
 *     echo fragment on his phone and killed replies after line one;
 *     candidate decays after a > 1200ms result gap),
 *   - the STOP-PHRASE fast path («رک جاؤ» / «رکو» / «بس کرو» / "bas
 *     karo" / "stop" ...): an utterance consisting of / dominated by a
 *     stop command interrupts IMMEDIATELY — no sustain, no word count,
 *     no novelty — unless the phrase is literally part of the text
 *     being spoken (speaker echo guard),
 *   - ADOPTION of the detecting recognition as the capture session
 *     (finals seeded, phone send debounce 1400ms, dispatch exactly once),
 *   - the bounded restart / unavailable policy (4 empty ends or a
 *     'not-allowed' -> tap-to-interrupt only, no restart spam),
 *   - tap-to-interrupt.
 *
 * Run: node scripts/sim-barge-in.mjs   (exit 0 = all scenarios pass)
 */

// ---- fake clock ------------------------------------------------------------
let now = 0;
let timerSeq = 0;
const timers = new Map();
function setT(fn, ms) { const id = ++timerSeq; timers.set(id, { at: now + ms, fn }); return id; }
function clearT(id) { timers.delete(id); }
function advance(ms) {
  const end = now + ms;
  for (;;) {
    let next = null;
    for (const [id, t] of timers) if (t.at <= end && (!next || t.at < next.t.at)) next = { id, t };
    if (!next) break;
    timers.delete(next.id);
    now = next.t.at;
    next.t.fn();
  }
  now = end;
}

// ---- constants mirrored from chat.tsx --------------------------------------
const BARGE_MIN_SUSTAIN_MS = 800;
const BARGE_MIN_WORDS = 5;
const BARGE_MIN_NOVEL_WORDS = 3;
const BARGE_NOVEL_RATIO = 0.5;
const BARGE_GAP_RESET_MS = 1200;
const BARGE_MAX_RESTARTS = 12;
const BARGE_MAX_EMPTY_ENDS = 4;
const PHONE_SEND_DEBOUNCE_MS = 1400;

function normalizeSpeechWords(text) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, ' ').split(/\s+/).filter(Boolean);
}

// ---- stop phrases (mirrored from chat.tsx) -----------------------------------
const STOP_PHRASES = [
  ['خاموش', 'ہو', 'جاؤ'],
  ['رک', 'جاؤ'], ['بس', 'کرو'], ['چپ', 'کرو'],
  ['ruk', 'jao'], ['bas', 'karo'], ['stop', 'it'],
  ['رکو'], ['رک'], ['بس'],
  ['ruko'], ['ruk'], ['bas'], ['stop'],
];

function matchStopPhrase(words) {
  if (!words.length || words.length > 4) return null;
  for (const phrase of STOP_PHRASES) {
    if (phrase.length > words.length) continue;
    const start = words.length - phrase.length;
    if (start > 1) continue;
    if (phrase.length * 2 < words.length) continue;
    let ok = true;
    for (let i = 0; i < phrase.length; i += 1) {
      if (words[start + i] !== phrase[i]) { ok = false; break; }
    }
    if (ok) return phrase;
  }
  return null;
}

function wordsContainPhrase(words, phrase) {
  outer: for (let s = 0; s + phrase.length <= words.length; s += 1) {
    for (let i = 0; i < phrase.length; i += 1) {
      if (words[s + i] !== phrase[i]) continue outer;
    }
    return true;
  }
  return false;
}

// ---- the miniature engine ----------------------------------------------------
function makeWorld({ recognitionAvailable = true } = {}) {
  const W = {
    ticket: 0,
    ttsActive: false,
    currentSpeechText: '',
    // playback bookkeeping
    chunksStarted: [],
    chunksCompleted: [],
    currentAudio: null, // { chunk, endTimer, resolve }
    audioStoppedAt: null,
    // live mode
    intended: true,
    dispatched: [],
    micReopens: 0,
    // barge-in
    bargeMode: 'off', // 'off' | 'detect' | 'capture'
    bargeUnavailable: false,
    bargeSpanTicket: 0,
    bargeRestarts: 0,
    bargeEmptyEnds: 0,
    bargeGotResult: false,
    recognitionStarts: 0,
    candidate: { firstAt: 0, lastAt: 0, text: '', finals: '' },
    turnBuffer: '',
    sendTimer: null,
    captureFinals: [], // finals arriving after adoption
    stopPhraseAt: null, // when the stop-phrase fast path fired
    stopPhrase: '',
  };

  function playChunk(chunk, ticket) {
    return new Promise((resolve) => {
      if (ticket !== W.ticket) { resolve(); return; } // stale: never starts
      W.chunksStarted.push(chunk);
      maybeStartBargeIn();
      const audio = { chunk, resolve };
      audio.endTimer = setT(() => {
        if (W.currentAudio === audio) W.currentAudio = null;
        W.chunksCompleted.push(chunk);
        resolve();
      }, 1000);
      W.currentAudio = audio;
    });
  }

  function pauseCurrentAudio() {
    const audio = W.currentAudio;
    if (!audio) return;
    W.currentAudio = null;
    clearT(audio.endTimer);
    W.audioStoppedAt = now;
    audio.resolve(); // pause() fires onended -> promise resolves, like the real element
  }

  // playAssistantMessage miniature: chunk loop with ticket checks.
  async function playReply(text, chunks) {
    const ticket = ++W.ticket;
    W.ttsActive = true;
    W.currentSpeechText = text;
    maybeStartBargeIn();
    for (const chunk of chunks) {
      if (ticket !== W.ticket) return 'aborted';
      await playChunk(chunk, ticket);
      if (ticket !== W.ticket) return 'aborted';
    }
    W.ttsActive = false;
    W.currentSpeechText = '';
    stopBargeInListener();
    W.micReopens += 1; // resumeContinuousAfterTts -> reopen
    return 'completed';
  }

  function interruptSpeech() {
    W.ticket += 1;
    stopBargeInListener();
    pauseCurrentAudio();
    W.ttsActive = false;
    W.currentSpeechText = '';
  }

  // ---- barge-in listener (detect) ----
  function stopBargeInListener() {
    if (W.bargeMode === 'detect') W.bargeMode = 'off';
    W.candidate = { firstAt: 0, lastAt: 0, text: '', finals: '' };
  }

  function maybeStartBargeIn() {
    if (!W.intended) return;
    if (!W.ttsActive) return;
    if (W.bargeMode !== 'off') return;
    if (W.bargeSpanTicket !== W.ticket) {
      W.bargeSpanTicket = W.ticket;
      W.bargeRestarts = 0;
      W.bargeEmptyEnds = 0;
      W.bargeUnavailable = false;
    }
    if (W.bargeUnavailable) return;
    if (!recognitionAvailable) { W.bargeUnavailable = true; return; }
    W.recognitionStarts += 1;
    W.bargeMode = 'detect';
    W.bargeGotResult = false;
    W.candidate = { firstAt: 0, lastAt: 0, text: '', finals: '' };
  }

  // A recognition result event during DETECT: results are cumulative
  // (list of {isFinal, transcript}) like the real API.
  function feedDetect(results, isFinalEventIdx = -1) {
    if (W.bargeMode !== 'detect') return;
    W.bargeGotResult = true;
    W.bargeEmptyEnds = 0;
    const c = W.candidate;
    if (c.lastAt && now - c.lastAt > BARGE_GAP_RESET_MS) {
      c.firstAt = 0; c.text = ''; c.finals = '';
    }
    let heard = ''; let heardFinals = '';
    results.forEach((r, i) => {
      heard += `${r.transcript} `;
      if (r.isFinal) { heardFinals += `${r.transcript} `; }
    });
    c.text = heard; c.finals = heardFinals;
    if (!c.firstAt) c.firstAt = now;
    c.lastAt = now;
    // STOP-PHRASE FAST PATH (mirrors chat.tsx): immediate interrupt —
    // no sustain / word count / novelty — unless the phrase is part of
    // the text being spoken (echo guard). No adoption: a stop command
    // is not a new turn.
    const stopPhrase = matchStopPhrase(normalizeSpeechWords(c.text));
    if (stopPhrase
      && !wordsContainPhrase(normalizeSpeechWords(W.currentSpeechText), stopPhrase)) {
      W.stopPhraseAt = now;
      W.stopPhrase = stopPhrase.join(' ');
      interruptSpeech();
      return;
    }
    const words = normalizeSpeechWords(c.text);
    if (words.length < BARGE_MIN_WORDS) return;
    const spoken = new Set(normalizeSpeechWords(W.currentSpeechText));
    const novel = words.filter((w) => !spoken.has(w)).length;
    const ratio = novel / words.length;
    const sustained = now - c.firstAt >= BARGE_MIN_SUSTAIN_MS;
    const genuine = novel >= BARGE_MIN_NOVEL_WORDS && ratio >= BARGE_NOVEL_RATIO;
    // ECHO-HARDENED 2026-10-24: no fast-final instant kill — a single
    // final, however novel, never confirms on its own.
    if (sustained && genuine) confirmBargeIn();
  }

  function confirmBargeIn() {
    const finals = W.candidate.finals.trim();
    W.bargeMode = 'capture';
    if (finals) {
      W.turnBuffer += `${finals} `;
      schedulePhoneSend();
    }
    W.candidate = { firstAt: 0, lastAt: 0, text: '', finals: '' };
    interruptSpeech(); // silences the reply; the adopted session survives
  }

  // A final arriving during CAPTURE (post-adoption).
  function feedCaptureFinal(transcript) {
    if (W.bargeMode !== 'capture') return;
    W.turnBuffer += `${transcript} `;
    schedulePhoneSend();
  }

  function schedulePhoneSend() {
    if (W.sendTimer) clearT(W.sendTimer);
    W.sendTimer = setT(() => {
      W.sendTimer = null;
      const text = W.turnBuffer.trim();
      W.turnBuffer = '';
      W.bargeMode = 'off'; // dispatch -> pauseContinuousForTts retires the session
      if (text) W.dispatched.push(text);
    }, PHONE_SEND_DEBOUNCE_MS);
  }

  // Detect-session onend with nothing heard (Android-style churn).
  function feedDetectEnd() {
    if (W.bargeMode !== 'detect') return;
    if (!W.ttsActive) return;
    if (!W.bargeGotResult) {
      W.bargeEmptyEnds += 1;
      if (W.bargeEmptyEnds >= BARGE_MAX_EMPTY_ENDS) { W.bargeUnavailable = true; W.bargeMode = 'off'; return; }
    }
    W.bargeGotResult = false;
    W.bargeRestarts += 1;
    if (W.bargeRestarts > BARGE_MAX_RESTARTS) { W.bargeUnavailable = true; W.bargeMode = 'off'; return; }
    setT(() => { if (W.bargeMode === 'detect') W.recognitionStarts += 1; }, 250);
  }

  function tapInterrupt() {
    interruptSpeech();
    // live: poke the mic open for the new turn
    if (W.intended) { W.bargeMode = 'capture'; W.captureViaTap = true; }
  }

  return { W, playReply, interruptSpeech, feedDetect, feedCaptureFinal, feedDetectEnd, tapInterrupt };
}

// ---- tiny assertion kit ------------------------------------------------------
let failures = 0;
function check(name, cond, detail = '') {
  if (cond) console.log(`  PASS  ${name}`);
  else { failures += 1; console.log(`  FAIL  ${name} ${detail}`); }
}
const tick = () => new Promise((r) => setImmediate(r));
async function settle() { for (let i = 0; i < 5; i++) await tick(); }
// Advance the fake clock in small steps, flushing promise continuations
// between steps — chunk N+1 only starts once chunk N's promise resolves,
// exactly like the real await-chain in playAssistantMessage.
async function run(ms) {
  const end = now + ms;
  while (now < end) {
    advance(Math.min(100, end - now));
    await tick();
  }
  await settle();
}

const REPLY = 'آج موسم بہت اچھا ہے کل بھی دھوپ رہے گی اور ہوا ہلکی چلے گی';
const CHUNKS = ['c1', 'c2', 'c3', 'c4', 'c5'];

// ---- Scenario 1: normal turn -------------------------------------------------
async function scenario1() {
  console.log('Scenario 1: normal turn — reply plays fully, mic reopens once');
  now = 0; timers.clear();
  const { W, playReply } = makeWorld();
  const done = playReply(REPLY, CHUNKS.slice(0, 3));
  await run(3500);
  const result = await done;
  check('reply completed', result === 'completed');
  check('all 3 chunks played', W.chunksCompleted.length === 3, `got ${W.chunksCompleted.length}`);
  check('no dispatch from silence', W.dispatched.length === 0);
  check('mic reopened exactly once', W.micReopens === 1);
  check('barge listener retired at span end', W.bargeMode === 'off');
}

// ---- Scenario 2: barge-in mid-reply ------------------------------------------
async function scenario2() {
  console.log('Scenario 2: barge-in mid-reply — old queue never resumes, turn handed over once');
  now = 0; timers.clear();
  const { W, playReply, feedDetect, feedCaptureFinal } = makeWorld();
  const done = playReply(REPLY, CHUNKS); // 5 chunks x 1000ms
  await run(1500); // chunk 1 done, chunk 2 playing
  check('chunk 2 is playing', W.chunksStarted.length === 2);
  // User starts speaking over the reply: novel words, sustained.
  // ECHO-HARDENED bar: confirmation needs >= 800ms of sustained
  // genuinely-new speech, so feed 7 results over 900ms.
  const speechStart = now;
  const words = ['مجھے', 'ایک', 'اور', 'سوال', 'پوچھنا', 'ہے'];
  for (let i = 0; i < 7; i++) {
    feedDetect([{ isFinal: false, transcript: words.slice(0, Math.min(2 + i, words.length)).join(' ') }], -1);
    // run(), not raw advance(): chunk transitions ride on promise
    // continuations, so the clock must flush microtasks between feeds
    // or the playing chunk's handover never lands before the confirm.
    if (i < 6) await run(150);
  }
  await settle();
  check('barge-in confirmed', W.bargeMode === 'capture', `mode=${W.bargeMode}`);
  check('audio stopped within ~1.1s of sustained speech', W.audioStoppedAt !== null && W.audioStoppedAt - speechStart <= 1100,
    `stoppedAt=${W.audioStoppedAt} start=${speechStart}`);
  check('reply aborted', (await done) === 'aborted');
  await run(300);
  feedCaptureFinal('مجھے ایک اور سوال پوچھنا ہے'); // user finishes his sentence
  await run(1300);
  check('not dispatched before debounce elapses', W.dispatched.length === 0);
  await run(200);
  check('captured turn dispatched exactly once', W.dispatched.length === 1, `got ${JSON.stringify(W.dispatched)}`);
  check('dispatched text is the user utterance', W.dispatched[0] === 'مجھے ایک اور سوال پوچھنا ہے');
  await run(10000);
  check('old reply never resumed (chunks 4-5 never started)', W.chunksStarted.length <= 3, `started=${W.chunksStarted.join(',')}`);
  check('no duplicate dispatch', W.dispatched.length === 1);
}

// ---- Scenario 3: stray words must not kill the reply --------------------------
async function scenario3() {
  console.log('Scenario 3: stray single word + short blip — reply survives');
  now = 0; timers.clear();
  const { W, playReply, feedDetect } = makeWorld();
  const done = playReply(REPLY, CHUNKS.slice(0, 3));
  await run(1200);
  feedDetect([{ isFinal: false, transcript: 'اچھا' }], -1); // one stray word
  await run(100);
  // A 3-word novel blip, but only ~100ms long — never sustained, no final.
  feedDetect([{ isFinal: false, transcript: 'نئی بات سنو ذرا' }], -1);
  await run(2500);
  check('reply completed despite stray words', (await done) === 'completed');
  check('all chunks played', W.chunksCompleted.length === 3);
  check('no capture, no dispatch', W.bargeMode === 'off' && W.dispatched.length === 0);
}

// ---- Scenario 4: the AI's own echo must not kill the reply --------------------
async function scenario4() {
  console.log('Scenario 4: speaker echo of the reply itself — novelty gate holds');
  now = 0; timers.clear();
  const { W, playReply, feedDetect } = makeWorld();
  const done = playReply(REPLY, CHUNKS.slice(0, 3));
  await run(1100);
  // The mic "hears" the AI's own voice: words copied from the reply,
  // sustained well past 450ms with finals too.
  const echoWords = REPLY.split(' ');
  for (let i = 0; i < 6; i++) {
    const partial = echoWords.slice(0, 4 + i * 2).join(' ');
    feedDetect([{ isFinal: i >= 4, transcript: partial }], i >= 4 ? 0 : -1);
    await run(300);
  }
  await run(1500);
  check('echo never confirmed as barge-in', W.bargeMode !== 'capture');
  check('reply completed', (await done) === 'completed');
  check('no dispatch from echo', W.dispatched.length === 0);
}

// ---- Scenario 5: tap-to-interrupt ----------------------------------------------
async function scenario5() {
  console.log('Scenario 5: tap-to-interrupt — instant silence, mic opens');
  now = 0; timers.clear();
  const { W, playReply, tapInterrupt, feedCaptureFinal } = makeWorld();
  const done = playReply(REPLY, CHUNKS);
  await run(1600); // chunk 2 playing
  tapInterrupt();
  await settle();
  check('silence is immediate', W.audioStoppedAt === 1600, `stoppedAt=${W.audioStoppedAt}`);
  check('reply aborted', (await done) === 'aborted');
  feedCaptureFinal('رکو مجھے کچھ اور کہنا ہے');
  await run(1500);
  check('new turn captured after tap', W.dispatched.length === 1 && W.dispatched[0].includes('رکو'));
  await run(6000);
  check('remaining chunks never played', W.chunksStarted.length === 2);
}

// ---- Scenario 6: recognition unavailable during playback -----------------------
async function scenario6() {
  console.log('Scenario 6: barge-in unavailable — degrades to tap-only, no restart spam');
  now = 0; timers.clear();
  const { W, playReply, tapInterrupt } = makeWorld({ recognitionAvailable: false });
  const done = playReply(REPLY, CHUNKS.slice(0, 3));
  await run(3500);
  check('reply completed without a listener', (await done) === 'completed');
  check('listener marked unavailable', W.bargeUnavailable === true);
  check('no recognition construction spam', W.recognitionStarts === 0, `starts=${W.recognitionStarts}`);
  // A fresh reply span: tap still guarantees an exit.
  now = 0; timers.clear(); W.audioStoppedAt = null;
  const done2 = playReply(REPLY, CHUNKS);
  await run(1200);
  tapInterrupt();
  await settle();
  check('tap still interrupts when recognition is unavailable', (await done2) === 'aborted' && W.audioStoppedAt === 1200);
}

// ---- Scenario 7: flaky platform — empty-end churn is bounded -------------------
async function scenario7() {
  console.log('Scenario 7: platform kills detect sessions instantly — bounded restarts, then tap-only');
  now = 0; timers.clear();
  const { W, playReply, feedDetectEnd } = makeWorld();
  const done = playReply(REPLY, CHUNKS.slice(0, 3));
  await run(100);
  for (let i = 0; i < 10; i++) { feedDetectEnd(); await run(300); }
  check('gave up after the empty-end cap', W.bargeUnavailable === true);
  check('restarts stayed bounded', W.bargeRestarts <= BARGE_MAX_RESTARTS && W.recognitionStarts <= 6,
    `restarts=${W.bargeRestarts} starts=${W.recognitionStarts}`);
  await run(3000);
  check('reply still completed', (await done) === 'completed');
}

// ---- Scenario 8: stop phrase «رک جاؤ» alone — instant stop --------------------
async function scenario8() {
  console.log('Scenario 8: stop phrase «رک جاؤ» — instant stop, no sustain needed');
  now = 0; timers.clear();
  const { W, playReply, feedDetect } = makeWorld();
  const done = playReply(REPLY, CHUNKS); // REPLY contains no stop phrase
  await run(1500); // chunk 2 playing
  check('chunk 2 is playing', W.chunksStarted.length === 2);
  const saidAt = now;
  // ONE interim result, two words — the old gates needed >= 3 words
  // sustained >= 450ms; the fast path must fire on this single event.
  feedDetect([{ isFinal: false, transcript: 'رک جاؤ' }], -1);
  await settle();
  check('stop phrase recognized', W.stopPhrase === 'رک جاؤ', `got "${W.stopPhrase}"`);
  check('silence is immediate (same tick)', W.audioStoppedAt === saidAt, `stoppedAt=${W.audioStoppedAt} saidAt=${saidAt}`);
  check('not adopted as a capture turn', W.bargeMode === 'off', `mode=${W.bargeMode}`);
  check('reply aborted', (await done) === 'aborted');
  await run(6000);
  check('remaining chunks never played', W.chunksStarted.length === 2, `started=${W.chunksStarted.join(',')}`);
  check('nothing dispatched', W.dispatched.length === 0);
}

// ---- Scenario 9: echo of a story containing «رکو» — no false stop --------------
async function scenario9() {
  console.log('Scenario 9: AI story itself says «رکو» — echo must NOT stop the reply');
  now = 0; timers.clear();
  const { W, playReply, feedDetect } = makeWorld();
  const STORY = 'عدیل نے کہانی سنائی بچے نے زور سے کہا رکو یہ میری باری ہے سب ہنس پڑے';
  const done = playReply(STORY, CHUNKS.slice(0, 3));
  await run(1100); // chunk 2 playing
  // The speakers play the story; the mic hears fragments of it back.
  // The dangerous fragment: the stop word ALONE as an interim — the
  // echo guard (phrase is part of the spoken text) must block it.
  feedDetect([{ isFinal: false, transcript: 'رکو' }], -1);
  await settle();
  check('echo stop word did not fire the fast path', W.stopPhraseAt === null && W.audioStoppedAt === null,
    `stopAt=${W.stopPhraseAt} audioStoppedAt=${W.audioStoppedAt}`);
  // Sustained echo of the story's own words — novelty gate must hold too.
  const storyWords = STORY.split(' ');
  for (let i = 0; i < 4; i++) {
    feedDetect([{ isFinal: i >= 3, transcript: storyWords.slice(0, 5 + i * 2).join(' ') }], i >= 3 ? 0 : -1);
    await run(300);
  }
  await run(1500);
  check('reply completed despite the echo', (await done) === 'completed');
  check('no capture, no dispatch from echo', W.bargeMode === 'off' && W.dispatched.length === 0);
}

// ---- Scenario 10: Roman Urdu stop phrase «bas karo» ----------------------------
async function scenario10() {
  console.log('Scenario 10: Roman Urdu «bas karo» — instant stop');
  now = 0; timers.clear();
  const { W, playReply, feedDetect } = makeWorld();
  const done = playReply(REPLY, CHUNKS);
  await run(1200); // chunk 2 playing
  const saidAt = now;
  feedDetect([{ isFinal: true, transcript: 'bas karo' }], 0);
  await settle();
  check('stop phrase recognized', W.stopPhrase === 'bas karo', `got "${W.stopPhrase}"`);
  check('silence is immediate (same tick)', W.audioStoppedAt === saidAt, `stoppedAt=${W.audioStoppedAt} saidAt=${saidAt}`);
  check('reply aborted', (await done) === 'aborted');
  await run(6000);
  check('remaining chunks never played', W.chunksStarted.length === 2);
}

// ---- Scenario 11: stop during prefetch (dropout-hardening queue) -------------
async function scenario11() {
  console.log('Scenario 11: stop during prefetch — prefetched audio is discarded unheard');
  now = 0; timers.clear();
  const { W, interruptSpeech } = makeWorld();
  // Miniature of the lib/tts-chunks queue wired into playAssistantMessage
  // (2026-10-23 dropout hardening): chunk N+1 synthesizes into a
  // prefetch slot WHILE chunk N plays, so inter-chunk gaps vanish —
  // and a stop (ticket bump) must orphan that prefetched, not-yet-
  // played audio exactly like a queued chunk. (The REAL queue code is
  // proven against stubs in scripts/test-tts-chunks.mjs; this mirrors
  // its ticket semantics in the sim's idiom.)
  const readySet = new Set();
  const synthStarts = [];
  const synthP = (chunk) => {
    synthStarts.push(chunk);
    return new Promise((res) => setT(() => { readySet.add(chunk); res(chunk); }, 300));
  };
  let releasePlay = null;
  const playP = (chunk, ticket) => {
    if (ticket !== W.ticket) return Promise.resolve(); // stale: never starts
    W.chunksStarted.push(chunk);
    return new Promise((res) => {
      releasePlay = res; // the scenario resolves it on interrupt (pause -> onended)
      setT(res, 1000); // natural end if never interrupted
    });
  };
  const queue = (async () => {
    const ticket = ++W.ticket;
    W.ttsActive = true;
    const outcomes = [synthP('c1'), synthP('c2'), null]; // c1 + immediate prefetch of c2
    for (let i = 0; i < 3; i++) {
      if (ticket !== W.ticket) return 'aborted';
      await outcomes[i];
      if (ticket !== W.ticket) return 'aborted';
      if (i + 1 < 3 && !outcomes[i + 1]) outcomes[i + 1] = synthP(`c${i + 2}`);
      await playP(`c${i + 1}`, ticket);
      if (ticket !== W.ticket) return 'aborted';
    }
    W.ttsActive = false;
    return 'completed';
  })();
  await run(500); // c1 synthesized at 300 and is playing; c2 prefetched
  check('prefetch happened: c2 synthesized while c1 plays', synthStarts.includes('c2'), `synth=${synthStarts.join(',')}`);
  check('prefetched c2 is READY (audio in hand) before the stop', readySet.has('c2'));
  check('only c1 has started playing', W.chunksStarted.join(',') === 'c1', `started=${W.chunksStarted.join(',')}`);
  interruptSpeech(); // the user barges in / taps stop
  releasePlay(); // the real element's pause() resolves the play promise
  await settle();
  check('queue aborted by the stop', (await queue) === 'aborted');
  await run(4000);
  check('prefetched c2 NEVER played after the stop', W.chunksStarted.join(',') === 'c1', `started=${W.chunksStarted.join(',')}`);
  check('no chunk of the dead reply ever started again', W.chunksStarted.length === 1);
}

// ---- Scenario 12: noisy phone echo — misrecognized fragments must NOT kill the reply ----
// The 2026-10-24 device-test failure: on his phone the reply died after
// its first line. The old fast path killed on ONE >= 4-word >= 50%-novel
// FINAL; phone echo arrives exactly as such short misrecognized finals.
// Under the hardened bar neither a short all-novel final nor sustained
// low-novelty echo may confirm.
async function scenario12() {
  console.log('Scenario 12: noisy phone echo (misrecognized fragments + short novel final) — reply survives');
  now = 0; timers.clear();
  const { W, playReply, feedDetect } = makeWorld();
  const done = playReply(REPLY, CHUNKS.slice(0, 3));
  await run(1100); // chunk 2 playing
  // (a) A short FINAL with 2 novel words of 4 (50% novel) — the old
  // fast path would have killed the reply on this single event. New
  // bar: 4 words < 5, and no sustain yet — ignored.
  feedDetect([{ isFinal: true, transcript: 'جی اچھا ٹھیک ہے' }], 0);
  await settle();
  check('short novel final did not kill the reply', W.bargeMode !== 'capture' && W.audioStoppedAt === null);
  // (b) Sustained echo of the reply's own words with misrecognitions
  // mixed in: at most 1 novel word, far below the 3-novel / 50% bar,
  // sustained well past 800ms — must never confirm.
  const echoLines = [
    'آج موسم بہت اچھا ہے جی',
    'آج موسم بہت اچھا ہے کل بھی جی',
    'آج موسم بہت اچھا ہے کل بھی دھوپ رہے گی',
  ];
  for (let i = 0; i < echoLines.length; i++) {
    feedDetect([{ isFinal: i === 2, transcript: echoLines[i] }], i === 2 ? 0 : -1);
    await run(700);
  }
  await run(1500);
  check('sustained noisy echo never confirmed', W.bargeMode !== 'capture');
  check('reply completed despite noisy echo', (await done) === 'completed');
  check('all chunks played', W.chunksCompleted.length === 3);
  check('no dispatch from echo', W.dispatched.length === 0);
}

await scenario1();
await scenario2();
await scenario3();
await scenario4();
await scenario5();
await scenario6();
await scenario7();
await scenario8();
await scenario9();
await scenario10();
await scenario11();
await scenario12();

console.log(failures === 0 ? '\nALL SCENARIOS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
