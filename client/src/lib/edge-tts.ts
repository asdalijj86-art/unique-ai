/**
 * Client-side Microsoft Edge TTS — Salman (ur-IN, male) synthesized
 * directly in the user's browser over a WebSocket.
 *
 * WHY: the server route (/api/tts/edge) synthesizes the same voice, but
 * Microsoft throttles datacenter IPs, so from Render a single reply can
 * take 18–60s. The read-aloud endpoint serves real Edge-browser clients
 * fast, and the user's phone is one — so the primary path now talks to
 * Microsoft straight from the browser. The server route and Gemini TTS
 * remain as fallback legs in the voice chain (chat.tsx / QuranReader).
 *
 * The wire protocol mirrors the vendored library
 * (server/vendor/msedge-tts) frame-for-frame: same synth URL, same
 * Sec-MS-GEC token algorithm, same speech.config payload, same SSML
 * template with the library's Prosody defaults, same `Path:audio`
 * framing. One shared socket is reused across requests; each request
 * is routed by its X-RequestId.
 */

// The public Edge read-aloud client token — the same constant the
// vendored library ships (MsEdgeTTS.TRUSTED_CLIENT_TOKEN). It is not a
// user secret: every Edge browser carries it.
const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const WSS_URL = 'wss://api.msedgeservices.com/tts/cognitiveservices/websocket/v1';
const SEC_MS_GEC_VERSION = '1-143.0.3650.96';
const VOICE_NAME = 'ur-IN-SalmanNeural';
// Inferred from the voice name by the library's locale regex
// (/\b[a-z]{2,}-[A-Z]{2}\b/ on "ur-IN-SalmanNeural").
const VOICE_LOCALE = 'ur-IN';
// UNIQA (Phase 2): the female companion's OWN Edge voice. The wire
// protocol is voice-agnostic — the voice rides inside each request's
// SSML — so one shared socket serves both personas. Her chain NEVER
// falls back to Salman's name (see chat.tsx): if her voice cannot be
// synthesized, the next leg (server Edge with her voice, then Gemini's
// female voice) speaks instead.
export const UNIQA_VOICE_NAME = 'ur-PK-UzmaNeural';
export const UNIQA_VOICE_LOCALE = 'ur-PK';
// OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3 in the library.
const OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';
// Prosody defaults from the library's ProsodyOptions class.
const PROSODY_PITCH = '+0Hz';
const PROSODY_RATE = 1.0;
const PROSODY_VOLUME = 100.0;
// speech.config metadataoptions defaults (MetadataOptions class).
const SENTENCE_BOUNDARY_ENABLED = false;
const WORD_BOUNDARY_ENABLED = false;
const AUDIO_DELIM_TEXT = 'Path:audio\r\n';
const AUDIO_DELIM_BYTES = new TextEncoder().encode(AUDIO_DELIM_TEXT);
const CONNECT_TIMEOUT_MS = 10000;

export type EdgeTtsResult = { audioBase64: string; mimeType: 'audio/mpeg' };
type EdgeTtsError = { data: { errorType: 'network' | 'timeout' } };

const networkError = (): EdgeTtsError => ({ data: { errorType: 'network' } });
const timeoutError = (): EdgeTtsError => ({ data: { errorType: 'timeout' } });
const isClassified = (e: unknown): e is EdgeTtsError =>
  !!e && typeof e === 'object' && 'data' in e &&
  ((e as EdgeTtsError).data?.errorType === 'network' || (e as EdgeTtsError).data?.errorType === 'timeout');

/**
 * Sec-MS-GEC — mirrors MsEdgeTTS.generateSecMsGec exactly: Windows ticks
 * (seconds since 1601 + the Unix offset) rounded DOWN to a 300-second
 * block, converted to 100ns ticks, concatenated with the client token,
 * SHA-256 hashed, uppercase hex. (The library's static clock offset is
 * 0 unless a 403 forces a resync; the plain algorithm is what the
 * server route runs with.)
 */
export async function generateSecMsGec(): Promise<string> {
  const ticks = Math.floor(Date.now() / 1000) + 11644473600;
  const rounded = ticks - (ticks % 300);
  const windowsTicks = rounded * 10000000;
  const data = new TextEncoder().encode(`${windowsTicks}${TRUSTED_CLIENT_TOKEN}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-xxxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// 32 lowercase hex chars (the library's MsEdgeTTS.randomHex(16)).
function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function getSynthUrl(): Promise<string> {
  const secMsGec = await generateSecMsGec();
  return `${WSS_URL}?Ocp-Apim-Subscription-Key=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}&ConnectionId=${generateUUID()}`;
}

// The speech.config frame, byte-for-byte as the library builds it in
// MsEdgeTTS._createClient (whitespace inside the JSON included).
function buildSpeechConfig(): string {
  return `Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n
                    {
                        "context": {
                            "synthesis": {
                                "audio": {
                                    "metadataoptions": {
                                        "sentenceBoundaryEnabled": "${SENTENCE_BOUNDARY_ENABLED}",
                                        "wordBoundaryEnabled": "${WORD_BOUNDARY_ENABLED}"
                                    },
                                    "outputFormat": "${OUTPUT_FORMAT}" 
                                }
                            }
                        }
                    }
                `;
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// The SSML document, byte-for-byte as the library's _SSMLTemplate
// builds it (Prosody defaults, voice locale as xml:lang).
function buildSSML(input: string, voiceName: string = VOICE_NAME, voiceLocale: string = VOICE_LOCALE): string {
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${voiceLocale}">
                <voice name="${voiceName}">
                    <prosody pitch="${PROSODY_PITCH}" rate="${PROSODY_RATE}" volume="${PROSODY_VOLUME}">
                        ${input}
                    </prosody> 
                </voice>
            </speak>`;
}

// ---------------------------------------------------------------------------
// Shared connection + per-request routing
// ---------------------------------------------------------------------------

type PendingRequest = {
  chunks: Uint8Array[];
  resolve: (value: EdgeTtsResult) => void;
  reject: (err: EdgeTtsError) => void;
  timer: ReturnType<typeof setTimeout>;
};

const pending = new Map<string, PendingRequest>();
let sharedSocket: WebSocket | null = null;
let sharedSocketReady: Promise<WebSocket> | null = null;

// Handshake-failure memo. Microsoft's endpoint rejects the WebSocket
// handshake itself (HTTP 403) whenever the browser's User-Agent is not
// Microsoft Edge's — and a web page CANNOT set or override the UA on a
// WebSocket (verified against the live endpoint 2026-10-21: Edge UA →
// synthesis OK; the same frames with a Chrome/ChromeOS UA → 403 before
// any frame is exchanged; Origin plays no role). So in Chrome /
// ChromeOS / Android Chrome this leg can NEVER connect, and retrying
// it for every chunk of every reply only burned seconds before the
// fallback legs could speak — the user heard long silences and then
// only Gemini, with no sign Salman had been attempted at all. After a
// connect-phase failure, remember it for a minute: later calls fail
// FAST with the same classified network error and the chain moves
// straight to the server Salman leg. The memo is short (60s) so a
// transient network drop in a browser where this leg CAN work (Edge)
// only pauses it briefly, and a successful connect clears it at once.
let clientEdgeDownUntil = 0;
const CLIENT_EDGE_DOWN_MS = 60000;

function failAllPending(): void {
  for (const entry of pending.values()) {
    clearTimeout(entry.timer);
    entry.reject(networkError());
  }
  pending.clear();
}

function indexOfBytes(haystack: Uint8Array, needle: Uint8Array): number {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

// Header bytes are pure ASCII; decode byte-per-char so binary audio
// payload in the same frame is never mangled by a UTF-8 decode.
function asciiDecode(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result || '');
      resolve(s.slice(s.indexOf(',') + 1));
    };
    reader.onerror = () => reject(networkError());
    reader.readAsDataURL(blob);
  });
}

async function finishRequest(requestId: string, entry: PendingRequest): Promise<void> {
  if (!pending.delete(requestId)) return;
  clearTimeout(entry.timer);
  const total = entry.chunks.reduce((n, c) => n + c.length, 0);
  if (total === 0) {
    // turn.end with no audio — treat as failure so fallbacks can run
    // (the library's file path likewise errors on zero bytes).
    entry.reject(networkError());
    return;
  }
  try {
    const blob = new Blob(entry.chunks as BlobPart[], { type: 'audio/mpeg' });
    const audioBase64 = await blobToBase64(blob);
    entry.resolve({ audioBase64, mimeType: 'audio/mpeg' });
  } catch (e) {
    entry.reject(isClassified(e) ? e : networkError());
  }
}

function handleMessage(ev: MessageEvent): void {
  const data = ev.data;
  let headerText: string;
  let audio: Uint8Array | null = null;
  if (typeof data === 'string') {
    headerText = data;
  } else if (data instanceof ArrayBuffer) {
    const bytes = new Uint8Array(data);
    const delimAt = indexOfBytes(bytes, AUDIO_DELIM_BYTES);
    if (delimAt >= 0) {
      headerText = asciiDecode(bytes.subarray(0, delimAt + AUDIO_DELIM_BYTES.length));
      audio = bytes.subarray(delimAt + AUDIO_DELIM_BYTES.length);
    } else {
      // Control frame delivered as binary (or a binary frame whose
      // header carries turn.end) — scan the whole thing as text.
      headerText = asciiDecode(bytes);
    }
  } else {
    return; // binaryType is 'arraybuffer'; Blobs should never arrive
  }
  const idMatch = /X-RequestId:(.*?)\r\n/.exec(headerText);
  if (!idMatch) return;
  const entry = pending.get(idMatch[1]);
  if (!entry) return;
  if (audio && audio.length > 0) entry.chunks.push(audio);
  if (headerText.includes('Path:turn.end')) {
    void finishRequest(idMatch[1], entry);
  }
}

function resetSocket(ws: WebSocket): void {
  if (sharedSocket === ws) {
    sharedSocket = null;
    sharedSocketReady = null;
    failAllPending();
  }
  // A replacement socket is already in use: the pending requests belong
  // to IT, and this stale socket's late close must not fail them.
}

async function connectSocket(): Promise<WebSocket> {
  let url: string;
  try {
    url = await getSynthUrl();
  } catch {
    throw networkError();
  }
  const ws = new WebSocket(url);
  sharedSocket = ws;
  ws.binaryType = 'arraybuffer';
  ws.onmessage = handleMessage;
  await new Promise<void>((resolve, reject) => {
    const connectTimer = setTimeout(() => {
      try { ws.close(); } catch { /* ignore */ }
      reject(timeoutError());
    }, CONNECT_TIMEOUT_MS);
    ws.onopen = () => {
      clearTimeout(connectTimer);
      try {
        ws.send(buildSpeechConfig());
        resolve();
      } catch {
        reject(networkError());
      }
    };
    ws.onclose = () => {
      clearTimeout(connectTimer);
      reject(networkError()); // no-op once open — the promise has settled
      resetSocket(ws);
    };
    ws.onerror = () => {
      // A close event follows an error; the close handler does the
      // cleanup and rejects anything still pending.
      try { ws.close(); } catch { /* ignore */ }
    };
  });
  return ws;
}

function ensureSocket(): Promise<WebSocket> {
  if (sharedSocket) {
    if (sharedSocket.readyState === WebSocket.OPEN) {
      return Promise.resolve(sharedSocket);
    }
    if (sharedSocket.readyState !== WebSocket.CONNECTING) {
      // CLOSING/CLOSED husk whose close event we already consumed —
      // drop it and reconnect below.
      sharedSocket = null;
      sharedSocketReady = null;
    }
  }
  if (sharedSocketReady) return sharedSocketReady;
  const ready = connectSocket();
  sharedSocketReady = ready;
  ready.catch(() => {
    if (sharedSocketReady === ready) sharedSocketReady = null;
  });
  return ready;
}

/**
 * Synthesize `text` with Salman (ur-IN-SalmanNeural) straight from the
 * browser. Resolves with { audioBase64, mimeType: 'audio/mpeg' }.
 * Rejects with { data: { errorType: 'network' | 'timeout' } } — the
 * same classified shape the server TTS helpers throw, so callers can
 * fall through to the next voice leg. `timeoutMs` budgets the WHOLE
 * call (connect + synthesis); a timed-out request never poisons the
 * shared socket or other pending requests.
 */
async function synthesizeEdgeVoiceClientSide(
  text: string,
  voiceName: string,
  voiceLocale: string,
  timeoutMs: number,
): Promise<EdgeTtsResult> {
  const deadline = Date.now() + timeoutMs;
  const remaining = () => deadline - Date.now();

  // A recent handshake failure is remembered (see clientEdgeDownUntil):
  // fail fast so the fallback legs get this call's whole budget instead
  // of another doomed socket attempt.
  if (Date.now() < clientEdgeDownUntil) throw networkError();

  // Connect (or reuse) within the same budget — connectSocket carries
  // its own 10s connect timeout, inside this call's 12s. A connect-phase
  // failure arms the memo above; a successful connect clears it.
  let ws: WebSocket;
  try {
    ws = await ensureSocket();
  } catch (e) {
    clientEdgeDownUntil = Date.now() + CLIENT_EDGE_DOWN_MS;
    throw isClassified(e) ? e : networkError();
  }
  clientEdgeDownUntil = 0;
  if (remaining() <= 0) throw timeoutError();
  // send() on a CLOSING/CLOSED socket is silently dropped by browsers —
  // the request would then hang until its own timeout. Check first.
  if (ws.readyState !== WebSocket.OPEN) throw networkError();

  const requestId = randomHex(16);
  const frame =
    `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n` +
    buildSSML(escapeXml(text), voiceName, voiceLocale).trim();

  return new Promise<EdgeTtsResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (pending.delete(requestId)) reject(timeoutError());
    }, Math.max(1, remaining()));
    pending.set(requestId, { chunks: [], resolve, reject, timer });
    try {
      ws.send(frame);
    } catch {
      clearTimeout(timer);
      pending.delete(requestId);
      reject(networkError());
    }
  });
}

/** Unique's voice — Salman (ur-IN-SalmanNeural), synthesized in-browser. */
export async function synthesizeSalmanClientSide(
  text: string,
  timeoutMs = 12000,
): Promise<EdgeTtsResult> {
  return synthesizeEdgeVoiceClientSide(text, VOICE_NAME, VOICE_LOCALE, timeoutMs);
}

/**
 * Uniqa's voice — Uzma (ur-PK-UzmaNeural, female), synthesized
 * in-browser over the same shared socket. Used ONLY for Uniqa's turns;
 * her chain never substitutes Salman's voice (chat.tsx enforces the
 * separation; lib/persona.ts holds the picker proofs).
 */
export async function synthesizeUniqaClientSide(
  text: string,
  timeoutMs = 12000,
): Promise<EdgeTtsResult> {
  return synthesizeEdgeVoiceClientSide(text, UNIQA_VOICE_NAME, UNIQA_VOICE_LOCALE, timeoutMs);
}
