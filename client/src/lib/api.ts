import { useMutation } from '@tanstack/react-query';

type ChatMessageInput = { role: string; content: string; image?: string };

/** Smart-brain action the server may return alongside a chat reply. */
export type ChatAction =
  | { type: 'open_url'; url: string; displayName: string }
  | { type: 'build_project'; description: string }
  | { type: 'android_app'; description: string }
  | { type: 'search_results'; query: string; results: Array<{ title: string; snippet: string; url: string }> }
  | { type: 'weather'; city: string; tempC: string; feelsLikeC: string; conditionUr: string; conditionEn: string; humidity: string; windKmph: string }
  | { type: 'calc_result'; expression: string; result: number }
  | { type: 'youtube_results'; query: string; videos: Array<{ title: string; url: string; thumbnail: string; author: string }> }
  | { type: 'news_results'; headlines: Array<{ title: string; snippet: string; url: string }> }
  | { type: 'currency_result'; amount: number; from: string; to: string; result: number; rate: number }
  | { type: 'set_timer'; seconds: number; label: string }
  | { type: 'save_note'; text: string }
  | { type: 'list_notes' }
  | { type: 'prayer_times'; city: string; date: string; hijri: string; times: Record<string, string> }
  | { type: 'translate_result'; original: string; translated: string; target: string }
  | { type: 'unit_convert'; amount: number; fromUr: string; result: number; toUr: string }
  | { type: 'qr_code'; data: string }
  | { type: 'video_ideas'; ideas: string }
  | { type: 'world_clock'; city: string; time: string; date: string }
  | { type: 'page_summary'; url: string; title: string; summary: string }
  | { type: 'open_tool'; tool: 'background_remover' | 'ocr' | 'upscaler' | 'pdf' | 'audio_to_text' | 'email' | 'resize' | 'video_creator' | 'video_upload' | 'phone_lookup' | 'whatsapp_send'; phone?: string };

export type ChatResponse = {
  text: string;
  action?: ChatAction;
  multiStep?: boolean;
  plan?: string[];
};

/**
 * Replacement for @workspace/api-client-react's useSendMairaChatMessage.
 * POSTs to /api/openai/chat and resolves with { text, action?, multiStep?, plan? }.
 */
export function useSendMairaChatMessage() {
  return useMutation({
    mutationFn: async ({ data }: { data: { messages: ChatMessageInput[]; stream?: boolean; onDelta?: (delta: string) => void; language?: string } }) => {
      const { onDelta, ...body } = data;
      const res = await fetch('/api/openai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            try {
              const evt = JSON.parse(trimmed.slice(5).trim());
              if (evt.delta) onDelta(evt.delta);
              if (evt.done) {
                finalData = { text: evt.text || '', ...(evt.multiStep ? { multiStep: true, plan: evt.plan } : {}) };
              }
            } catch { /* skip */ }
          }
        }
        return finalData;
      }
      return res.json() as Promise<ChatResponse>;
    },
  });
}

/**
 * Replacement for @workspace/api-client-react's synthesizeMairaSpeech.
 * POSTs to /api/openai/speech and resolves with { audioBase64, mimeType }.
 * If the user saved their own Gemini API key in settings, it's sent along
 * so their personal quota is used instead of the server's.
 * Sends the user's selected voice (Charon/Fenrir) from settings.
 */
export async function synthesizeMairaSpeech({ text }: { text: string }) {
  const getSetting = (k: string) => {
    try { return localStorage.getItem(k) || undefined; }
    catch { return undefined; }
  };
  const userApiKey = getSetting('unique-ai-gemini-key');
  const voiceName = getSetting('unique-ai-voice') || 'Charon';
  const res = await fetch('/api/openai/speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      voiceName,
      ...(userApiKey ? { userApiKey } : {}),
    }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw { data: errData };
  }
  return res.json() as Promise<{ audioBase64: string; mimeType: string }>;
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
 * Free fallback TTS via Google Translate (server-proxied, no API key).
 * Used when Gemini TTS is down AND browser TTS doesn't work on the device.
 */
export async function synthesizeGoogleSpeech({ text }: { text: string }) {
  const res = await fetch('/api/tts/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw { data: errData };
  }
  return res.json() as Promise<{ audioBase64: string; mimeType: string }>;
}

/**
 * Ask the server to generate a complete single-file website from a
 * description. Resolves with { html }.
 */
export async function buildProject({ description }: { description: string }) {
  const res = await fetch('/api/build-project', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw { data: errData };
  }
  return res.json() as Promise<{ html: string }>;
}
