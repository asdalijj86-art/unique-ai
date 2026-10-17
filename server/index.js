import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// ---------------------------------------------------------------------------
// Unique AI system prompt — DO NOT REWORD. This is the locked identity.
// ---------------------------------------------------------------------------
const assistantInstructions = [
  "You are Unique AI (یونیک اے آئی), a friendly, thoughtful personal assistant. Never call yourself Maira AI or any other name.",
  "Reply in simple, natural Pakistani Urdu by default. If the user writes in Roman Urdu, reply in Roman Urdu; if they write in English, reply in English. Understand all three.",
  "The user can also talk to you through their microphone; their speech is transcribed into text for you, so treat spoken messages exactly like typed ones.",
  "You are male. In Urdu, always refer to yourself with masculine grammar (for example: 'میں کر سکتا ہوں', 'میں نے بتایا', 'بتائیے میں آپ کی کیا مدد کر سکتا ہوں'). Never use feminine forms like 'کر سکتی ہوں'.",
  "Never use Devanagari (Hindi) script under any circumstance. Always write Urdu in Perso-Arabic script.",
  "Be warm, respectful, encouraging, patient, and professional. Do not imply that you are human or have feelings.",
  "Guide the user step by step when explaining a task. Keep the first response focused and do not overwhelm them with a long list of instructions.",
  "Be honest about uncertainty and do not claim to have performed actions you cannot perform.",
].join(" ");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function pcmToWavBase64(pcmBase64, sampleRate = 24000) {
  const pcm = Buffer.from(pcmBase64, "base64");
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]).toString("base64");
}

function validMessages(messages) {
  return (
    Array.isArray(messages) &&
    messages.length > 0 &&
    messages.every(
      (m) =>
        m &&
        typeof m === "object" &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.length > 0
    )
  );
}

// ---------------------------------------------------------------------------
// POST /api/openai/chat — chat with Gemini
// ---------------------------------------------------------------------------
app.post("/api/openai/chat", async (req, res) => {
  const { messages } = req.body ?? {};
  if (!validMessages(messages)) {
    res.status(400).json({ error: "پیغام درست نہیں ہے۔ دوبارہ کوشش کریں۔" });
    return;
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(503).json({ error: "Gemini API key لوڈ نہیں ہوئی۔" });
      return;
    }

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: assistantInstructions }] },
          contents: messages.map(({ role, content }) => ({
            role: role === "assistant" ? "model" : "user",
            parts: [{ text: content }],
          })),
          generationConfig: { maxOutputTokens: 512 },
        }),
      }
    );

    if (!response.ok) {
      console.error("Gemini request failed", { status: response.status });
      res.status(502).json({
        error: "Gemini AI ابھی جواب نہیں دے سکی۔ API key، انٹرنیٹ اور API کی دستیابی چیک کریں۔",
      });
      return;
    }

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim();
    if (!text) {
      console.warn("Unique AI returned an empty response");
      res.status(502).json({
        error: "ابھی جواب نہیں بن سکا۔ براہِ کرم دوبارہ کوشش کریں۔",
      });
      return;
    }

    res.json({ text });
  } catch (err) {
    console.error("Unique AI chat request failed", err);
    res.status(502).json({
      error: "Gemini AI سروس سے رابطہ نہیں ہو سکا۔ انٹرنیٹ اور API کی دستیابی چیک کریں۔",
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/openai/speech — Gemini TTS with the Fenrir male voice
// ---------------------------------------------------------------------------
app.post("/api/openai/speech", async (req, res) => {
  const { text } = req.body ?? {};
  if (typeof text !== "string" || text.trim().length === 0) {
    res.status(400).json({ error: "سنائے جانے والا متن درست نہیں ہے۔" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(503).json({
      error: "آواز میں جواب سنانے کے لیے ابھی API key ترتیب نہیں دی گئی۔ فی الحال چیٹ استعمال کریں۔",
    });
    return;
  }

  // The upstream call can fail intermittently, so retry a few times before
  // giving up — this keeps the masculine voice consistent instead of
  // falling back to the device voice.
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text }] }],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: "Fenrir" } },
              },
            },
          }),
        }
      );
      if (!response.ok) {
        const errBody = await response.text().catch(() => "");
        // Don't retry on 429 (quota exhausted) — retries just burn more quota.
        if (response.status === 429) {
          throw new Error(
            `Gemini TTS HTTP 429 (quota exhausted, no retry): ${errBody.slice(0, 200)}`
          );
        }
        throw new Error(`Gemini TTS HTTP ${response.status}: ${errBody.slice(0, 300)}`);
      }
      const result = await response.json();
      const pcmBase64 = result.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!pcmBase64) {
        throw new Error("Gemini TTS returned no audio");
      }
      res.json({
        audioBase64: pcmToWavBase64(pcmBase64),
        mimeType: "audio/wav",
      });
      return;
    } catch (err) {
      lastError = err;
      console.warn("Unique AI speech attempt failed, retrying", { attempt, err: String(err) });
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
      }
    }
  }
  console.error("Unique AI speech generation failed after retries", lastError);
  res.status(502).json({
    error: "آواز تیار نہیں ہو سکی۔ براہِ کرم دوبارہ کوشش کریں۔",
  });
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get("/api/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

// ---------------------------------------------------------------------------
// Serve the built frontend + SPA fallback
// ---------------------------------------------------------------------------
const distDir = path.join(__dirname, "dist");
app.use(express.static(distDir));
app.get("*", (_req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

// ---------------------------------------------------------------------------
const port = Number(process.env.PORT || 5000);
app.listen(port, "0.0.0.0", () => {
  console.log(`Unique AI server listening on port ${port}`);
});
