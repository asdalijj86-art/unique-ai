import { useMutation } from '@tanstack/react-query';
import { ttsAudioCache, makeTtsCacheKey } from './tts-cache';
import { authFetch } from './auth';
import { secureAppStorage } from './secure-app-storage';

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
  | { type: 'open_tool'; tool: 'background_remover' | 'ocr' | 'upscaler' | 'resize' | 'image_compress' | 'text_on_image' | 'video_upload' | 'video_creator' | 'video_maker' | 'pdf' | 'audio_to_text' | 'email' | 'password_gen' | 'emi_calc' | 'resume_builder' | 'invoice_gen' | 'assignment_maker' | 'phone_lookup' | 'whatsapp_send' | 'quran'; phone?: string };

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
/**
 * Replacement for @workspace/api-client-react's useSendMairaChatMessage.
 * POSTs to /api/openai/chat and resolves with { text, action?, multiStep?, plan? }.
 *
 * SECURITY (2026-11-25): the client NEVER sends a Gemini key any more.
 * The server uses ONLY the logged-in account's own stored key — a
 * guest with no key gets the honest no-key answer, never the owner's
 * key. The old client-side key rotation is gone with the keys.
 */
export function useSendMairaChatMessage() {
  return useMutation({
    mutationFn: async ({ data }: { data: { messages: ChatMessageInput[]; stream?: boolean; onDelta?: (delta: string) => void; language?: string; persona?: string; tone?: string; memory?: string; team?: string; study?: string } }) => {
      const { onDelta, ...body } = data;

      // One chat attempt with HARD timeouts. Previously this fetch had no
      // timeout at all: a stalled upstream left the mutation pending
      // forever, so the user got no reply, no error, and every later send
      // was silently swallowed by the isPending guard. A stall watchdog
      // aborts after 35s without data; an absolute cap aborts at 90s.
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
        const res = await authFetch('/api/openai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
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
                if (evt.delta) { onDelta(evt.delta); }
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
    },
  });
}

/**
 * SECURITY (2026-11-25): Gemini keys NO LONGER live in localStorage.
 * Each account stores its own key on the server (encrypted at rest,
 * /api/auth/key) and the server uses only the logged-in account's key.
 * The old client-side multi-key rotation (parseGeminiKeys /
 * getGeminiKeys / getActiveKeyIndex / rotateGeminiKey) is DELETED —
 * the plaintext localStorage key `unique-ai-gemini-key` must never
 * be written again. Any legacy key found there is migrated to the
 * server once, on the owner's first login (see lib/secure-app-storage
 * + chat.tsx), then deleted.
 */

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
      // SECURITY (2026-11-25): per-account namespaced storage.
      const stored = secureAppStorage.getItem('unique-ai-voice') || 'Salman';
      // 'Salman' is the Edge TTS voice — it has no Gemini equivalent. When
      // the Gemini path is used at all (fallback / Charon selected), it
      // speaks with Charon; only an explicit 'Fenrir' selection differs.
      return stored === 'Fenrir' ? 'Fenrir' : 'Charon';
    } catch { return 'Charon'; }
  })();
  // FAIL-CLOSED GUARD (2026-10-27): the voice name is the ONLY place
  // a female Gemini voice could enter a Unique turn, and it is fully
  // determined by the female flag above (false → Charon/Fenrir only,
  // true → Sulafat only). If that mapping ever breaks, refuse the
  // Gemini leg outright — Edge/browser fallbacks, or silence with a
  // banner, are both better than Unique speaking a female voice.
  if (!female && voiceName === UNIQA_GEMINI_VOICE) {
    throw { data: { errorType: 'network', error: 'آواز تیار نہیں ہو سکی۔' } };
  }
  // CACHE (2026-10-27): exact text + resolved voice + female flag.
  // A hit costs zero Gemini calls — this is what makes Replay,
  // "سنیں" and repeated lines free. The guard above runs first, so
  // a cached female voice can never leak into a male turn.
  const cacheKey = makeTtsCacheKey(text, voiceName, !!female);
  const cached = ttsAudioCache.get(cacheKey);
  if (cached) return cached;
  // NIGHT BACKUP (2026-10-27 user-approved "rat wala backup",
  // restored 2026-11-28 in its SECURE form): the server owns every
  // key — the client never sees one, never sends one, and the old
  // plaintext localStorage keys + client-side rotation stay deleted
  // (2026-11-25 security build). When the account's own key hits
  // quota, exactly ONE retry goes out with useBackup: true and the
  // server answers THAT attempt from its own env key, owner-only.
  // A guest gets the honest quota error, never the owner's key.
  // Any other failure (no key, timeout, network) throws as-is —
  // only quota earns a retry, so there is no infinite loop.
  const attempt = async (useBackup: boolean) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    let res: Response;
    try {
      res = await authFetch('/api/openai/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voiceName, ...(useBackup ? { useBackup: true } : {}) }),
        signal: ctrl.signal,
      });
    } catch (e: any) {
      clearTimeout(timer);
      if (e?.name === 'AbortError' || e?.name === 'TimeoutError') {
        throw { data: { errorType: 'timeout', error: 'آواز آنے میں بہت دیر لگ گئی۔ نیٹ چیک کر کے دوبارہ کوشش کریں۔' } };
      }
      throw e;
    }
    clearTimeout(timer);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw { data: errData };
    }
    return (await res.json()) as { audioBase64: string; mimeType: string };
  };
  try {
    const audio = await attempt(false);
    ttsAudioCache.set(cacheKey, audio);
    return audio;
  } catch (e: any) {
    if (e?.data?.errorType !== 'quota') throw e;
    const backupAudio = await attempt(true);
    ttsAudioCache.set(cacheKey, backupAudio);
    return backupAudio;
  }
}

/**
 * Professional assignment maker — POSTs to /api/assignment/generate.
 * SECURITY (2026-11-25): the server uses the logged-in account's own
 * stored key. No key is ever sent from the client.
 */
export async function generateAssignment(params: {
  name: string; rollNo: string; classLevel: string; subject: string;
  topic: string; language: string; length: string;
}) {
  const res = await authFetch('/api/assignment/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params }),
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
  // Validation-only: the key is checked by the server and NOT stored
  // by this call. Saving happens via /api/auth/key (auth.ts).
  const res = await authFetch('/api/tts/test-key', {
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
  // FAIL-FAST (2026-10-26): single client attempt only. The server
  // already retries 3x internally, so the old second client attempt
  // burned another full 20s cap per chain pass — 9 passes per dead
  // chunk in the evening recurrence, which is a large part of why a
  // reply spoke line-by-line minutes late. A throttle that clears
  // is re-probed by the next chunk (or the 60s per-reply circuit
  // in chat.tsx), not by burning another 20s here. The 20s cap
  // still bounds this one attempt.
  let lastErr: any = null;
  for (let attempt = 0; attempt < 1; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await authFetch('/api/tts/edge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // voice:'uniqa' asks the server for HER Edge voice (Uzma); absent
        // = Salman, Unique's voice — used only on his turns now, since
        // Uniqa is the default and her turns always send voice:'uniqa'.
        body: JSON.stringify({ text, ...(voice ? { voice } : {}) }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (errData?.errorType === 'network' && attempt === 0) {
          lastErr = { data: errData };
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }
        throw { data: errData };
      }
      return res.json() as Promise<{ audioBase64: string; mimeType: string }>;
    } catch (e: any) {
      if (e?.data) throw e;
      if (e?.name === 'AbortError' || e?.name === 'TimeoutError') {
        throw { data: { errorType: 'timeout' } };
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr || { data: { errorType: 'network' } };
}
