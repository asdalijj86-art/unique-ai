import { useMutation } from '@tanstack/react-query';

type ChatMessageInput = { role: string; content: string; image?: string };

/** Smart-brain action the server may return alongside a chat reply. */
export type ChatAction =
  | { type: 'open_url'; url: string; displayName: string }
  | { type: 'open_link'; url: string; displayName: string }
  | { type: 'android_app'; description: string }
  // Brain builder (Phase 3): a background build job started by a voice/
  // chat order («گیم بنا دو») or returned with a status answer. The
  // card polls /api/build/status/:jobId for the job's REAL state and
  // shows the link + download only once the file has validated.
  | { type: 'build_app'; jobId: string; title: string }
  | { type: 'search_results'; query: string; results: Array<{ title: string; snippet: string; url: string }> }
  | { type: 'weather'; city: string; tempC: string; feelsLikeC: string; conditionUr: string; conditionEn: string; humidity: string; windKmph: string }
  | { type: 'calc_result'; expression: string; result: number }
  | { type: 'youtube_results'; query: string; videos: Array<{ title: string; url: string; thumbnail: string; author: string }> }
  | { type: 'news_results'; headlines: Array<{ title: string; snippet: string; url: string }> }
  | { type: 'currency_result'; amount: number; from: string; to: string; result: number; rate: number }
  | { type: 'set_timer'; seconds: number; label: string }
  // Client-side only (never sent by the server): a document a tool
  // generated (CV / invoice / assignment) that the user asked to
  // download in chat — rendered as a card whose button builds the
  // real PDF in the browser from the stored document HTML.
  | { type: 'doc_download'; title: string; filename: string; html: string }
  | { type: 'save_note'; text: string }
  | { type: 'list_notes' }
  | { type: 'prayer_times'; city: string; date: string; hijri: string; times: Record<string, string> }
  | { type: 'translate_result'; original: string; translated: string; target: string }
  | { type: 'unit_convert'; amount: number; fromUr: string; result: number; toUr: string }
  | { type: 'qr_code'; data: string }
  | { type: 'video_ideas'; ideas: string }
  | { type: 'world_clock'; city: string; time: string; date: string }
  | { type: 'page_summary'; url: string; title: string; summary: string }
  // The server still names the legacy image/video tools here; the client
  // normalizes them onto the تصویر ٹولز / ویڈیو ٹولز hubs (resolveToolOpen).
  | { type: 'open_tool'; tool: 'background_remover' | 'ocr' | 'upscaler' | 'resize' | 'image_compress' | 'text_on_image' | 'video_upload' | 'video_creator' | 'pdf' | 'audio_to_text' | 'email' | 'password_gen' | 'emi_calc' | 'resume_builder' | 'invoice_gen' | 'assignment_maker' | 'phone_lookup' | 'whatsapp_send' | 'quran'; phone?: string };

export type ChatResponse = {
  text: string;
  action?: ChatAction;
  /** Helper-agent team (Task D): when one message ran SEVERAL data
   *  tools in parallel, the server returns every action here instead
   *  of a single `action`. */
  actions?: ChatAction[];
  multiStep?: boolean;
  plan?: string[];
};

/**
 * Assistant speech plays slightly faster than natural pace (user request
 * 2026-10-21: «آواز تھوڑی سپیڈ تیز کرو»). Applied via the audio element's
 * playbackRate WITH preservesPitch, so the voice stays natural — this is
 * NOT a sample-rate/pitch hack (the old pitch hack distorted Salman's
 * voice and was removed). Shared by every TTS playback path (chat voice
 * chain, QuranReader) so the pace is identical everywhere.
 */
export const TTS_PLAYBACK_RATE = 1.1;

/**
 * Replacement for @workspace/api-client-react's useSendMairaChatMessage.
 * POSTs to /api/openai/chat and resolves with { text, action?, multiStep?, plan? }.
 */
export function useSendMairaChatMessage() {
  return useMutation({
    mutationFn: async ({ data }: { data: { messages: ChatMessageInput[]; stream?: boolean; onDelta?: (delta: string) => void; language?: string; persona?: string; tone?: string; memory?: string; team?: string } }) => {
      const { onDelta, ...body } = data;

      // One chat attempt with HARD timeouts. Previously this fetch had no
      // timeout at all: a stalled upstream left the mutation pending
      // forever, so the user got no reply, no error, and every later send
      // was silently swallowed by the isPending guard. A stall watchdog
      // aborts after 35s without data; an absolute cap aborts at 90s.
      const chatOnce = async (userApiKey: string | undefined, trackDelta: () => void): Promise<ChatResponse> => {
        const ctrl = new AbortController();
        let timedOut = false;
        let stallTimer: ReturnType<typeof setTimeout> | undefined;
        const armStall = () => {
          if (stallTimer) clearTimeout(stallTimer);
          stallTimer = setTimeout(() => { timedOut = true; ctrl.abort(); }, 35000);
        };
        const absTimer = setTimeout(() => { timedOut = true; ctrl.abort(); }, 90000);
        armStall();
        try {
          const res = await fetch('/api/openai/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...body, ...(userApiKey ? { userApiKey } : {}) }),
            signal: ctrl.signal,
          });
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw { data: errData };
          }
          // Streaming mode: read SSE deltas and call onDelta for each
          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('text/event-stream') && onDelta) {
            const reader = res.body!.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let finalData: ChatResponse = { text: '' };
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              armStall();
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';
              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data:')) continue;
                try {
                  const evt = JSON.parse(trimmed.slice(5).trim());
                  // The server reports a mid-stream failure (e.g. the
                  // upstream died before any text) as an error event.
                  if (evt.error) {
                    throw { data: { error: evt.error, errorType: evt.errorType } };
                  }
                  if (evt.delta) { trackDelta(); onDelta(evt.delta); }
                  if (evt.done) {
                    finalData = { text: evt.text || '', ...(evt.multiStep ? { multiStep: true, plan: evt.plan } : {}) };
                  }
                } catch (e: any) {
                  if (e?.data) throw e;
                  /* skip malformed line */
                }
              }
            }
            return finalData;
          }
          return (await res.json()) as ChatResponse;
        } catch (e: any) {
          if (timedOut) {
            throw { data: { error: 'جواب آنے میں بہت دیر لگ گئی۔ نیٹ چیک کر کے دوبارہ کوشش کریں۔', errorType: 'timeout' } };
          }
          throw e;
        } finally {
          if (stallTimer) clearTimeout(stallTimer);
          clearTimeout(absTimer);
        }
      };

      // The user's own keys power the chat too — same rotation scheme as
      // speech (synthesizeMairaSpeech): start from the active key, and on
      // quota/auth failure rotate to the next key. Rotation happens ONLY
      // when no reply text has streamed yet (retrying mid-stream would
      // duplicate the reply). With no saved keys, a single attempt runs on
      // the server's env key, exactly as before.
      const keys = getGeminiKeys();
      const attempts = keys.length > 0 ? keys : [undefined];
      const startIdx = keys.length > 0 ? getActiveKeyIndex() % keys.length : 0;
      let lastErr: any = null;
      for (let a = 0; a < attempts.length; a++) {
        const keyIdx = keys.length > 0 ? (startIdx + a) % keys.length : 0;
        const userApiKey = keys.length > 0 ? keys[keyIdx] : undefined;
        let gotDelta = false;
        try {
          const result = await chatOnce(userApiKey, () => { gotDelta = true; });
          if (keys.length > 0) setActiveKeyIndex(keyIdx);
          return result;
        } catch (e: any) {
          lastErr = e;
          const t = e?.data?.errorType;
          if (keys.length > 1 && !gotDelta && (t === 'quota' || t === 'auth')) {
            setActiveKeyIndex(keyIdx);
            continue;
          }
          throw e;
        }
      }
      throw lastErr || { data: { error: 'پیغام بھیجنے میں مسئلہ ہوا۔ براہِ کرم دوبارہ کوشش کریں۔', errorType: 'unknown' } };
    },
  });
}

/**
 * Multi-key rotation: user can paste several Gemini keys (one per line or
 * comma-separated) in one field. Keys are tried in order; on quota/auth
 * failure the app rotates to the next key automatically.
 */
/**
 * Parse the keys field into individual Gemini keys.
 * Normal case: one key per line (or comma-separated).
 * Repair case: a copied key got line-wrapped mid-key (fragments that don't
 * start with a key prefix) — then strip ALL whitespace and re-split on the
 * known key prefixes ("AIza…" classic, "AQ.…" new).
 */
export function parseGeminiKeys(raw: string): string[] {
  if (!raw) return [];
  const byLine = raw.split(/[\n,]+/).map((k) => k.trim()).filter((k) => k.length > 10);
  const looksBroken = byLine.some((k) => !/^(AIza|AQ\.)/.test(k));
  if (looksBroken) {
    const clean = raw.replace(/\s+/g, '');
    const byPrefix = clean.split(/(?=AIza)|(?=AQ\.)/).filter((k) => k.length > 10);
    if (byPrefix.length) return byPrefix;
  }
  return byLine;
}

export function getGeminiKeys(): string[] {
  try {
    return parseGeminiKeys(localStorage.getItem('unique-ai-gemini-key') || '');
  } catch { return []; }
}
export function getActiveKeyIndex(): number {
  try { return Math.max(0, parseInt(localStorage.getItem('unique-ai-gemini-key-index') || '0', 10) || 0); }
  catch { return 0; }
}
export function setActiveKeyIndex(i: number) {
  try { localStorage.setItem('unique-ai-gemini-key-index', String(i)); } catch { /* ignore */ }
}
export function rotateGeminiKey() {
  const keys = getGeminiKeys();
  if (keys.length < 2) return;
  setActiveKeyIndex((getActiveKeyIndex() + 1) % keys.length);
}
export function getActiveGeminiKey(): string | undefined {
  const keys = getGeminiKeys();
  if (!keys.length) return undefined;
  return keys[getActiveKeyIndex() % keys.length];
}

/**
 * Replacement for @workspace/api-client-react's synthesizeMairaSpeech.
 * POSTs to /api/openai/speech and resolves with { audioBase64, mimeType }.
 * If the user saved their own Gemini API key(s) in settings, they're sent along
 * so their personal quota is used instead of the server's — with automatic
 * rotation to the next key when one hits quota.
 * Sends the user's selected voice (Charon/Fenrir) from settings.
 */
// Session dead-key memory: once a key answers quota/auth it is dead for
// the rest of the session — re-asking it on every reply burned several
// slow server attempts before the voice arrived (or never did). Dead keys
// are skipped with NO network call. The memory is forgotten the moment
// the saved key list itself changes (a fresh paste gets a fresh chance).
const deadTtsKeys = new Set<string>();
let deadTtsKeysFingerprint: string | null = null;

function refreshDeadTtsKeys(keys: string[]) {
  const fp = keys.join('|');
  if (deadTtsKeysFingerprint !== fp) {
    deadTtsKeysFingerprint = fp;
    deadTtsKeys.clear();
  }
}

/** Uniqa's Gemini voice (Phase 2): a warm FEMALE prebuilt voice. Used
 *  ONLY for her turns — Unique's turns never carry it, and hers never
 *  carry Charon/Fenrir (the persona separation, lib/persona.ts). */
export const UNIQA_GEMINI_VOICE = 'Sulafat';

export async function synthesizeMairaSpeech({ text, female }: { text: string; female?: boolean }) {
  const voiceName = (() => {
    // Uniqa's turns always take her own female Gemini voice — the
    // stored male-voice selection belongs to Unique alone.
    if (female) return UNIQA_GEMINI_VOICE;
    try {
      const stored = localStorage.getItem('unique-ai-voice') || 'Salman';
      // 'Salman' is the Edge TTS voice — it has no Gemini equivalent. When
      // the Gemini path is used at all (fallback / Charon selected), it
      // speaks with Charon; only an explicit 'Fenrir' selection differs.
      return stored === 'Fenrir' ? 'Fenrir' : 'Charon';
    } catch { return 'Charon'; }
  })();
  const keys = getGeminiKeys();
  refreshDeadTtsKeys(keys);
  const attempts = keys.length > 0 ? keys : [undefined];
  let lastErr: any = null;
  const startIdx = keys.length > 0 ? getActiveKeyIndex() % keys.length : 0;
  for (let a = 0; a < attempts.length; a++) {
    const keyIdx = keys.length > 0 ? (startIdx + a) % keys.length : 0;
    const userApiKey = keys.length > 0 ? keys[keyIdx] : undefined;
    // Known-dead this session — skip instantly, no network call at all.
    if (userApiKey && deadTtsKeys.has(userApiKey)) {
      lastErr = { data: { errorType: 'quota' } };
      continue;
    }
    // Hard 15s cap per key attempt: a stalled speech request must fail as
    // a classifiable timeout, never hang the voice pipeline.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    let res: Response;
    try {
      res = await fetch('/api/openai/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voiceName,
          ...(userApiKey ? { userApiKey } : {}),
        }),
        signal: ctrl.signal,
      });
    } catch (e: any) {
      clearTimeout(timer);
      if (e?.name === 'AbortError' || e?.name === 'TimeoutError') {
        throw { data: { errorType: 'timeout', error: 'آواز آنے میں بہت دیر لگ گئی۔ نیٹ چیک کر کے دوبارہ کوشش کریں۔' } };
      }
      // Network failure — rotating keys cannot fix the network; fail now.
      throw e;
    }
    clearTimeout(timer);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const t = errData?.errorType;
      // Rotate to the next key ONLY on quota/auth — and remember this key
      // as dead so later replies don't waste time asking it again.
      if (t === 'quota' || t === 'auth') {
        if (userApiKey) deadTtsKeys.add(userApiKey);
        if (keys.length > 1) {
          setActiveKeyIndex(keyIdx);
          lastErr = { data: errData };
          continue;
        }
      }
      throw { data: errData };
    }
    // Success — remember this key as the active one.
    if (keys.length > 0) setActiveKeyIndex(keyIdx);
    return res.json() as Promise<{ audioBase64: string; mimeType: string }>;
  }
  throw lastErr || { data: { errorType: 'quota' } };
}

/**
 * Professional assignment maker — POSTs to /api/assignment/generate.
 * Sends the user's own Gemini key if saved (BYOK), else server key is used.
 */
export async function generateAssignment(params: {
  name: string; rollNo: string; classLevel: string; subject: string;
  topic: string; language: string; length: string;
}) {
  const getSetting = (k: string) => {
    try { return localStorage.getItem(k) || undefined; }
    catch { return undefined; }
  };
  const userApiKey = getSetting('unique-ai-gemini-key');
  const res = await fetch('/api/assignment/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, ...(userApiKey ? { userApiKey } : {}) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw { data };
  return data as { ok: boolean; content: string; meta: Record<string, string> };
}

/**
 * Test a user's Gemini key via the server. Returns { ok, errorType?, message }.
 * Used by Settings to validate the key immediately on save.
 */
export async function testGeminiKey(userApiKey: string): Promise<{ ok: boolean; errorType?: string; message: string }> {
  const res = await fetch('/api/tts/test-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userApiKey }),
  });
  return res.json();
}

/**
 * PRIMARY voice — Microsoft Edge TTS (Salman, ur-IN male) via the server.
 * Free, needs no API key and has NO daily quota, so it works day and
 * night — unlike Gemini TTS, whose free quota dies by evening.
 * POSTs to /api/tts/edge and resolves with { audioBase64, mimeType }.
 * Hard 20s cap: a stalled request throws a classifiable timeout instead
 * of hanging the voice pipeline.
 */
export async function synthesizeEdgeSpeech({ text, voice }: { text: string; voice?: 'uniqa' }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  let res: Response;
  try {
    res = await fetch('/api/tts/edge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // voice:'uniqa' asks the server for HER Edge voice (Uzma); absent
      // = Salman, Unique's voice — the default is never hers.
      body: JSON.stringify({ text, ...(voice ? { voice } : {}) }),
      signal: ctrl.signal,
    });
  } catch (e: any) {
    if (e?.name === 'AbortError' || e?.name === 'TimeoutError') {
      throw { data: { errorType: 'timeout' } };
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw { data: errData };
  }
  return res.json() as Promise<{ audioBase64: string; mimeType: string }>;
}
