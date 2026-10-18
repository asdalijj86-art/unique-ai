import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyIntent,
  detectLanguage,
  isMultiStep,
  websiteConfirmation,
  buildConfirmation,
  searchConfirmation,
  weatherConfirmation,
  calcConfirmation,
  youtubeSearchConfirmation,
  newsConfirmation,
  currencyConfirmation,
  timerConfirmation,
  noteSaveConfirmation,
  noteListConfirmation,
  prayerConfirmation,
  translateConfirmation,
  unitConvertConfirmation,
  qrConfirmation,
  videoIdeasConfirmation,
  clockConfirmation,
  readPageConfirmation,
  appBuildConfirmation,
  mediaToolConfirmation,
  videoCreatorConfirmation,
} from "./brain.js";
import {
  webSearch,
  getWeather,
  evaluateMath,
  youtubeSearch,
  getNews,
  parseCurrencyRequest,
  convertCurrency,
  getPrayerTimes,
  convertUnits,
  getWorldTime,
  videoIdeasPrompt,
  fetchPageText,
} from "./tools.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// ---------------------------------------------------------------------------
// Unique AI system prompt — DO NOT REWORD. This is the locked identity.
// ---------------------------------------------------------------------------
const assistantInstructions = [
  "You are Unique AI (یونیک اے آئی), a friendly, thoughtful personal assistant. Never call yourself Maira AI or any other name. Never call yourself مائرہ (Maira) in ANY script — your only name is Unique AI (یونیک اے آئی).",
  "Reply in simple, natural Pakistani Urdu by default — Urdu is always the main language. If the user writes in Roman Urdu, reply in Roman Urdu; if they write in English, reply in English; if they write in Arabic (العربية), reply in Arabic. Understand all four languages fluently. If the user asks the meaning of an English OR Arabic word, phrase or text, explain it clearly in Urdu.",
  "The user can also talk to you through their microphone; their speech is transcribed into text for you, so treat spoken messages exactly like typed ones.",
  "You are male. In Urdu, always refer to yourself with masculine grammar (for example: 'میں کر سکتا ہوں', 'میں نے بتایا', 'بتائیے میں آپ کی کیا مدد کر سکتا ہوں'). Never use feminine forms like 'کر سکتی ہوں'.",
  "Never use Devanagari (Hindi) script under any circumstance, not even a single character, not even in stories, jokes, quotes, or creative writing. Always write Urdu in Perso-Arabic script only.",
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
        m.content.length > 0 &&
        (m.image === undefined || (typeof m.image === "string" && /^data:(image|video)\//.test(m.image)))
    )
  );
}

// Convert a data-URL image/video to a Gemini inlineData part.
function imageToGeminiPart(dataUrl) {
  const match = /^data:((image|video)\/[a-zA-Z0-9+.-]+);base64,(.+)$/.exec(dataUrl || "");
  if (!match) return null;
  return { inlineData: { mimeType: match[1], data: match[3] } };
}

// ---------------------------------------------------------------------------
// POST /api/openai/chat — chat with Gemini (+ smart-brain intent actions)
// ---------------------------------------------------------------------------
app.post("/api/openai/chat", async (req, res) => {
  const { messages, stream } = req.body ?? {};
  if (!validMessages(messages)) {
    res.status(400).json({ error: "پیغام درست نہیں ہے۔ دوبارہ کوشش کریں۔" });
    return;
  }

  // --- Smart brain: classify the latest user message BEFORE spending quota.
  const latestUserText = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const c = classifyIntent(latestUserText);
  const lang = detectLanguage(latestUserText);
  const { intent } = c;

  if (intent === "open_website" && c.website) {
    res.json({
      text: websiteConfirmation(c.website, lang),
      action: { type: "open_url", url: c.website.url, displayName: c.website.displayName },
    });
    return;
  }

  if (intent === "build_project" && c.project) {
    res.json({
      text: buildConfirmation(c.project.description, lang),
      action: { type: "build_project", description: c.project.description },
    });
    return;
  }

  // --- Professional toolbox: rule-based tools (zero Gemini quota) -----------
  if (intent === "calculator" && c.expression) {
    const r = evaluateMath(c.expression);
    if (r.ok) {
      res.json({
        text: calcConfirmation(c.expression, r.result, lang),
        action: { type: "calc_result", expression: c.expression, result: r.result },
      });
      return;
    }
  }

  if (intent === "timer" && c.timer) {
    res.json({
      text: timerConfirmation(c.timer.seconds, c.timer.unitUr, lang),
      action: { type: "set_timer", seconds: c.timer.seconds, label: `${c.timer.amount} ${c.timer.unitUr}` },
    });
    return;
  }

  if (intent === "currency" && c.currency) {
    const { amount, from, to } = c.currency;
    const r = await convertCurrency(amount, from, to);
    if (r.ok) {
      res.json({
        text: currencyConfirmation(amount, from, to, r.result, lang),
        action: { type: "currency_result", amount, from, to, result: r.result, rate: r.rate },
      });
      return;
    }
    // fall through to chat on API failure
  }

  if (intent === "weather" && c.city) {
    const r = await getWeather(c.city);
    if (r.ok) {
      const text = lang === "roman"
        ? `${r.city} me aaj ${r.tempC}°C hai, ${r.conditionUr}.`
        : lang === "en"
          ? `It's ${r.tempC}°C in ${r.cityEn} right now, ${r.conditionEn}.`
          : `${r.city} میں آج ${r.tempC}°C ہے، ${r.conditionUr}۔`;
      res.json({
        text,
        action: {
          type: "weather", city: r.city, tempC: r.tempC, feelsLikeC: r.feelsLikeC,
          conditionUr: r.conditionUr, conditionEn: r.conditionEn,
          humidity: r.humidity, windKmph: r.windKmph,
        },
      });
      return;
    }
  }

  if (intent === "prayer_times" && c.city) {
    const r = await getPrayerTimes(c.city);
    if (r.ok) {
      res.json({
        text: prayerConfirmation(r.city, lang),
        action: { type: "prayer_times", city: r.city, date: r.date, hijri: r.hijri, times: r.times },
      });
      return;
    }
  }

  if (intent === "world_clock" && c.city) {
    const r = getWorldTime(c.city);
    if (r.ok) {
      const text = lang === "roman"
        ? `${r.city} me waqt: ${r.time}`
        : lang === "en"
          ? `Current time in ${r.city}: ${r.time}`
          : `${r.city} کا وقت: ${r.time} (${r.date})`;
      res.json({
        text,
        action: { type: "world_clock", city: r.city, time: r.time, date: r.date },
      });
      return;
    }
  }

  if (intent === "unit_convert" && c.unitConv) {
    const { amount, from, to } = c.unitConv;
    const r = convertUnits(amount, from, to);
    if (r.ok) {
      res.json({
        text: unitConvertConfirmation(amount, r.fromUr, r.result, r.toUr, lang),
        action: { type: "unit_convert", amount, fromUr: r.fromUr, result: r.result, toUr: r.toUr },
      });
      return;
    }
  }

  if (intent === "youtube_search" && c.query) {
    const r = await youtubeSearch(c.query);
    if (r.ok && !r.fallback) {
      res.json({
        text: youtubeSearchConfirmation(c.query, lang),
        action: { type: "youtube_results", query: c.query, videos: r.videos },
      });
      return;
    }
    if (r.ok && r.fallback) {
      res.json({
        text: youtubeSearchConfirmation(c.query, lang),
        action: { type: "open_url", url: r.searchUrl, displayName: "یوٹیوب تلاش" },
      });
      return;
    }
  }

  if (intent === "news") {
    const r = await getNews(c.topic || "");
    if (r.ok) {
      res.json({
        text: newsConfirmation(lang),
        action: { type: "news_results", headlines: r.headlines },
      });
      return;
    }
  }

  if (intent === "web_search" && c.query) {
    const r = await webSearch(c.query);
    if (r.ok) {
      res.json({
        text: searchConfirmation(c.query, lang),
        action: { type: "search_results", query: c.query, results: r.results },
      });
      return;
    }
  }

  if (intent === "notes_save" && c.noteText) {
    res.json({
      text: noteSaveConfirmation(lang),
      action: { type: "save_note", text: c.noteText },
    });
    return;
  }

  if (intent === "notes_list") {
    res.json({
      text: noteListConfirmation(lang),
      action: { type: "list_notes" },
    });
    return;
  }

  if (intent === "translate" && c.translate) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      try {
        const targetName = c.translate.target === "en" ? "English" : "Urdu (Perso-Arabic script, NEVER Devanagari)";
        const response = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: "You are a translator. Output ONLY the translation, no explanations." }] },
              contents: [{ role: "user", parts: [{ text: `Translate this to ${targetName}: ${c.translate.text}` }] }],
              generationConfig: { maxOutputTokens: 512 },
            }),
          }
        );
        if (response.ok) {
          const result = await response.json();
          const translated = result.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
          if (translated) {
            res.json({
              text: translateConfirmation(c.translate.target, lang),
              action: { type: "translate_result", original: c.translate.text, translated, target: c.translate.target },
            });
            return;
          }
        }
      } catch { /* fall through to chat */ }
    }
  }

  if (intent === "youtube_trending") {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      try {
        const response = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: "You are a YouTube Shorts strategist. Write in Urdu (Perso-Arabic script, never Devanagari). Be punchy, no fluff." }] },
              contents: [{ role: "user", parts: [{ text: videoIdeasPrompt(c.niche || "") }] }],
              generationConfig: { maxOutputTokens: 1024 },
            }),
          }
        );
        if (response.ok) {
          const result = await response.json();
          const ideas = result.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
          if (ideas) {
            res.json({
              text: videoIdeasConfirmation(lang),
              action: { type: "video_ideas", ideas },
            });
            return;
          }
        }
      } catch { /* fall through to chat */ }
    }
  }

  if (intent === "read_webpage" && c.url) {
    const page = await fetchPageText(c.url);
    if (page.ok) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (apiKey) {
        try {
          const langHint = lang === "en" ? "in English" : lang === "roman" ? "in Roman Urdu" : "in Urdu (Perso-Arabic script, never Devanagari)";
          const response = await fetch(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
            {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: `You summarize web pages briefly ${langHint}. 3-5 bullet points max.` }] },
                contents: [{ role: "user", parts: [{ text: `Summarize this page (title: ${page.title}):\n\n${page.text}` }] }],
                generationConfig: { maxOutputTokens: 512 },
              }),
            }
          );
          if (response.ok) {
            const result = await response.json();
            const summary = result.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
            if (summary) {
              res.json({
                text: readPageConfirmation(lang),
                action: { type: "page_summary", url: page.url, title: page.title, summary },
              });
              return;
            }
          }
        } catch { /* fall through to chat */ }
      }
    }
  }

  if (intent === "qr_code" && c.qrData) {
    res.json({
      text: qrConfirmation(lang),
      action: { type: "qr_code", data: c.qrData },
    });
    return;
  }

  if (intent === "android_app" && c.app) {
    res.json({
      text: appBuildConfirmation(c.app.description, lang),
      action: { type: "android_app", description: c.app.description },
    });
    return;
  }

  if (intent === "media_tool" && c.tool) {
    res.json({
      text: mediaToolConfirmation(c.tool, lang),
      action: { type: "open_tool", tool: c.tool, ...(c.phone ? { phone: c.phone } : {}) },
    });
    return;
  }

  if (intent === "video_creator") {
    res.json({
      text: videoCreatorConfirmation(lang),
      action: { type: "open_tool", tool: "video_creator" },
    });
    return;
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(503).json({ error: "Gemini API key لوڈ نہیں ہوئی۔" });
      return;
    }

    // Multi-step requests: ask for clearly numbered steps (the sacred prompt
    // above is untouched — this is a per-request task instruction only).
    const multiStep = isMultiStep(latestUserText);
    const systemText = multiStep
      ? `${assistantInstructions} The user gave a multi-step request. Structure your answer with clear numbered steps (1. 2. 3.), one step per line, then a brief closing line.`
      : assistantInstructions;

    const requestBody = {
      systemInstruction: { parts: [{ text: systemText }] },
      contents: messages.map(({ role, content, image }) => {
        const parts = [{ text: content }];
        // Vision: attach the user's image so Gemini can see it.
        if (role === "user" && image) {
          const imgPart = imageToGeminiPart(image);
          if (imgPart) parts.push(imgPart);
        }
        return {
          role: role === "assistant" ? "model" : "user",
          parts,
        };
      }),
      generationConfig: { maxOutputTokens: 512 },
    };

    // STREAMING MODE: pipe Gemini's SSE stream to the client for instant word-by-word display
    if (stream) {
      const streamResponse = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:streamGenerateContent?alt=sse",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify(requestBody),
        }
      );
      if (!streamResponse.ok) {
        console.error("Gemini stream request failed", { status: streamResponse.status });
        res.status(502).json({
          error: "Gemini AI ابھی جواب نہیں دے سکی۔ API key، انٹرنیٹ اور API کی دستیابی چیک کریں۔",
        });
        return;
      }
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");

      let fullText = "";
      const reader = streamResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const data = trimmed.slice(5).trim();
            if (data === "[DONE]") continue;
            try {
              const chunk = JSON.parse(data);
              const delta = chunk.candidates?.[0]?.content?.parts
                ?.map((p) => p.text ?? "")
                .join("") ?? "";
              if (delta) {
                fullText += delta;
                res.write(`data: ${JSON.stringify({ delta })}\n\n`);
              }
            } catch { /* skip malformed chunk */ }
          }
        }
      } catch (streamErr) {
        console.error("Gemini stream read failed", streamErr);
      }
      fullText = fullText.trim();
      // Send final metadata (plan extraction for multi-step)
      let plan;
      if (multiStep && fullText) {
        const steps = fullText
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => /^\d+[.)\-:]\s+/.test(line))
          .map((line) => line.replace(/^\d+[.)\-:]\s+/, "").trim())
          .filter(Boolean);
        if (steps.length >= 2) plan = steps;
      }
      res.write(`data: ${JSON.stringify({ done: true, text: fullText, ...(plan ? { multiStep: true, plan } : {}) })}\n\n`);
      res.end();
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
        body: JSON.stringify(requestBody),
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

    // Extract a structured plan for multi-step answers (numbered lines).
    let plan;
    if (multiStep) {
      const steps = text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => /^\d+[.)\-:]\s+/.test(line))
        .map((line) => line.replace(/^\d+[.)\-:]\s+/, "").trim())
        .filter(Boolean);
      if (steps.length >= 2) plan = steps;
    }

    res.json(plan ? { text, multiStep: true, plan } : { text });
  } catch (err) {
    console.error("Unique AI chat request failed", err);
    res.status(502).json({
      error: "Gemini AI سروس سے رابطہ نہیں ہو سکا۔ انٹرنیٹ اور API کی دستیابی چیک کریں۔",
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/build-project — Gemini generates a complete single-file website
// ---------------------------------------------------------------------------
const BUILD_SYSTEM_PROMPT = [
  "You are an expert front-end developer. Generate ONE complete, self-contained HTML file.",
  "Rules:",
  "- Output ONLY the HTML code, no explanations, no markdown fences.",
  "- Inline all CSS in <style> and all JS in <script> — no external files.",
  "- Mobile-responsive, clean modern design, RTL layout when the content is Urdu/Arabic.",
  "- Write all Urdu text in Perso-Arabic script. NEVER use Devanagari (Hindi) script, not even one character.",
  "- Match the site language to the user's request language (Urdu default for Urdu requests).",
  "- Include sensible placeholder content so the page looks complete immediately.",
].join("\n");

app.post("/api/build-project", async (req, res) => {
  const { description } = req.body ?? {};
  if (typeof description !== "string" || description.trim().length === 0) {
    res.status(400).json({ error: "پروجیکٹ کی تفصیل درست نہیں ہے۔" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "Gemini API key لوڈ نہیں ہوئی۔" });
    return;
  }

  try {
    const lang = detectLanguage(description);
    const langHint =
      lang === "en"
        ? "The site content should be in English."
        : lang === "roman"
          ? "The site content should be in Roman Urdu (Latin script)."
          : "The site content should be in Urdu (Perso-Arabic script, RTL).";

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: BUILD_SYSTEM_PROMPT }] },
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `Build a complete single-file website for: ${description.trim()}\n${langHint}`,
                },
              ],
            },
          ],
          generationConfig: { maxOutputTokens: 8192 },
        }),
      }
    );

    if (!response.ok) {
      console.error("Gemini build-project failed", { status: response.status });
      res.status(502).json({
        error: "ویب سائٹ بنانے میں مسئلہ ہوا۔ براہِ کرم دوبارہ کوشش کریں۔",
      });
      return;
    }

    const result = await response.json();
    let html = result.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim();
    if (!html) {
      res.status(502).json({ error: "ویب سائٹ تیار نہیں ہو سکی۔ دوبارہ کوشش کریں۔" });
      return;
    }
    // Strip markdown fences if the model added them despite instructions.
    html = html
      .replace(/^```html\s*/i, "")
      .replace(/^```\s*/, "")
      .replace(/\s*```$/g, "")
      .trim();
    if (!/^<!doctype html/i.test(html) && !/^<html/i.test(html)) {
      console.warn("build-project returned non-HTML content");
    }

    res.json({ html });
  } catch (err) {
    console.error("build-project request failed", err);
    res.status(502).json({
      error: "ویب سائٹ بنانے میں مسئلہ ہوا۔ انٹرنیٹ چیک کر کے دوبارہ کوشش کریں۔",
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/build-app — Gemini generates a PWA (installable "Android app"):
// { html, manifest, serviceWorker }. Install via Chrome → Add to Home Screen.
// ---------------------------------------------------------------------------
const APP_SYSTEM_PROMPT = [
  "You are an expert mobile app developer. Generate ONE complete, self-contained HTML file for a MOBILE APP (phone-first, max-width 480px centered, bottom tab bar, app-like cards).",
  "Rules:",
  "- Output ONLY the HTML code, no explanations, no markdown fences.",
  "- Inline all CSS in <style> and all JS in <script> — no external files except Google Fonts.",
  "- App-style UI: header bar, bottom navigation, cards, touch-friendly buttons (min 44px).",
  "- RTL layout when the content is Urdu/Arabic.",
  "- Write all Urdu text in Perso-Arabic script. NEVER use Devanagari (Hindi) script, not even one character.",
  "- Match the app language to the user's request language (Urdu default for Urdu requests).",
  "- Include sensible placeholder content so the app looks complete immediately.",
  "- Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">.",
  "- Register 'sw.js' as service worker if present (wrap in try/catch).",
  "- Add <link rel=\"manifest\" href=\"manifest.json\"> in <head>.",
].join("\n");

function buildManifest(appName) {
  const name = String(appName || "Unique AI App").slice(0, 40);
  return {
    name,
    short_name: name.slice(0, 12),
    description: `${name} — Unique AI سے بنائی گئی ایپ`,
    start_url: "./index.html",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0f0a1e",
    theme_color: "#7c3aed",
    icons: [
      {
        src: "data:image/svg+xml," + encodeURIComponent(
          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="120" fill="#7c3aed"/><text x="256" y="330" font-size="220" text-anchor="middle" fill="white" font-family="sans-serif">U</text></svg>`
        ),
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}

const APP_SERVICE_WORKER = `// Unique AI PWA service worker — cache-first for offline use.
const CACHE = 'unique-ai-app-v1';
const ASSETS = ['./', './index.html', './manifest.json'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
`;

app.post("/api/build-app", async (req, res) => {
  const { description } = req.body ?? {};
  if (typeof description !== "string" || description.trim().length === 0) {
    res.status(400).json({ error: "ایپ کی تفصیل درست نہیں ہے۔" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "Gemini API key لوڈ نہیں ہوئی۔" });
    return;
  }

  try {
    const lang = detectLanguage(description);
    const langHint =
      lang === "en"
        ? "The app content should be in English."
        : lang === "roman"
          ? "The app content should be in Roman Urdu (Latin script)."
          : "The app content should be in Urdu (Perso-Arabic script, RTL).";

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: APP_SYSTEM_PROMPT }] },
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `Build a complete mobile app (single HTML file) for: ${description.trim()}\n${langHint}`,
                },
              ],
            },
          ],
          generationConfig: { maxOutputTokens: 8192 },
        }),
      }
    );

    if (!response.ok) {
      console.error("Gemini build-app failed", { status: response.status });
      res.status(502).json({ error: "ایپ بنانے میں مسئلہ ہوا۔ براہِ کرم دوبارہ کوشش کریں۔" });
      return;
    }

    const result = await response.json();
    let html = result.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim();
    if (!html) {
      res.status(502).json({ error: "ایپ تیار نہیں ہو سکی۔ دوبارہ کوشش کریں۔" });
      return;
    }
    html = html
      .replace(/^```html\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    const appName = description.trim().split(/\s+/).slice(0, 4).join(" ");
    res.json({
      html,
      manifest: buildManifest(appName),
      serviceWorker: APP_SERVICE_WORKER,
      appName,
    });
  } catch (err) {
    console.error("build-app request failed", err);
    res.status(502).json({
      error: "ایپ بنانے میں مسئلہ ہوا۔ انٹرنیٹ چیک کر کے دوبارہ کوشش کریں۔",
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/translate — Gemini translation (Urdu ↔ English, Roman → Urdu)
// ---------------------------------------------------------------------------
app.post("/api/translate", async (req, res) => {
  const { text, target } = req.body ?? {};
  if (typeof text !== "string" || text.trim().length === 0) {
    res.status(400).json({ error: "ترجمے والا متن درست نہیں ہے۔" });
    return;
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "Gemini API key لوڈ نہیں ہوئی۔" });
    return;
  }
  try {
    const targetName = target === "en" ? "English" : "Urdu (Perso-Arabic script, NEVER Devanagari)";
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: "You are a translator. Output ONLY the translation, no explanations." }] },
          contents: [{ role: "user", parts: [{ text: `Translate this to ${targetName}: ${text.trim()}` }] }],
          generationConfig: { maxOutputTokens: 512 },
        }),
      }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    const translated = result.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
    if (!translated) throw new Error("empty");
    res.json({ translated });
  } catch (err) {
    console.error("translate request failed", err);
    res.status(502).json({ error: "ترجمہ نہیں ہو سکا۔ دوبارہ کوشش کریں۔" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/read-page — fetch a URL, strip to text, Gemini summarizes
// ---------------------------------------------------------------------------
app.post("/api/read-page", async (req, res) => {
  const { url } = req.body ?? {};
  const page = await fetchPageText(url);
  if (!page.ok) {
    res.status(400).json({ error: "صفحہ پڑھا نہیں جا سکا۔ لنک چیک کریں۔" });
    return;
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "Gemini API key لوڈ نہیں ہوئی۔" });
    return;
  }
  try {
    const lang = detectLanguage(page.text.slice(0, 500));
    const langHint = lang === "en" ? "in English" : "in Urdu (Perso-Arabic script, never Devanagari)";
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: `You summarize web pages briefly ${langHint}. 3-5 bullet points max.` }] },
          contents: [{ role: "user", parts: [{ text: `Summarize this page (title: ${page.title}):\n\n${page.text}` }] }],
          generationConfig: { maxOutputTokens: 512 },
        }),
      }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    const summary = result.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
    if (!summary) throw new Error("empty");
    res.json({ url: page.url, title: page.title, summary });
  } catch (err) {
    console.error("read-page request failed", err);
    res.status(502).json({ error: "خلاصہ نہیں بن سکا۔ دوبارہ کوشش کریں۔" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/draft-email — Gemini drafts a professional email
// ---------------------------------------------------------------------------
app.post("/api/draft-email", async (req, res) => {
  const { purpose, tone, language } = req.body ?? {};
  if (typeof purpose !== "string" || purpose.trim().length === 0) {
    res.status(400).json({ error: "ای میل کا مقصد درست نہیں ہے۔" });
    return;
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "Gemini API key لوڈ نہیں ہوئی۔" });
    return;
  }
  try {
    const langName = language === "en" ? "English" : language === "roman" ? "Roman Urdu" : language === "ar" ? "Arabic (العربية)" : "Urdu (Perso-Arabic script, never Devanagari)";
    const toneName = tone || "professional";
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: `You draft professional emails in ${langName}. Output subject line then the email body. Tone: ${toneName}.` }] },
          contents: [{ role: "user", parts: [{ text: `Draft an email for this purpose: ${purpose.trim()}` }] }],
          generationConfig: { maxOutputTokens: 1024 },
        }),
      }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    const draft = result.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
    if (!draft) throw new Error("empty");
    res.json({ draft });
  } catch (err) {
    console.error("draft-email request failed", err);
    res.status(502).json({ error: "ای میل نہیں بن سکی۔ دوبارہ کوشش کریں۔" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/transcribe — Gemini transcribes uploaded audio (base64)
// ---------------------------------------------------------------------------
app.post("/api/transcribe", async (req, res) => {
  const { audioBase64, mimeType } = req.body ?? {};
  if (typeof audioBase64 !== "string" || audioBase64.length === 0) {
    res.status(400).json({ error: "آڈیو درست نہیں ہے۔" });
    return;
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "Gemini API key لوڈ نہیں ہوئی۔" });
    return;
  }
  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: "Transcribe the audio exactly. Output ONLY the transcription text, no explanations. If the speech is Urdu, write it in Perso-Arabic script (never Devanagari)." }] },
          contents: [{
            role: "user",
            parts: [
              { inlineData: { mimeType: mimeType || "audio/webm", data: audioBase64 } },
              { text: "Transcribe this audio." },
            ],
          }],
          generationConfig: { maxOutputTokens: 2048 },
        }),
      }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
    if (!text) throw new Error("empty");
    res.json({ text });
  } catch (err) {
    console.error("transcribe request failed", err);
    res.status(502).json({ error: "آڈیو تحریر میں نہیں بدلی جا سکی۔ دوبارہ کوشش کریں۔" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/phone-lookup — Abstract API phone intelligence:
// returns carrier, line type, city, region, country for any international number.
// ---------------------------------------------------------------------------
app.post("/api/phone-lookup", async (req, res) => {
  const { phone } = req.body ?? {};
  if (typeof phone !== "string" || phone.trim().length === 0) {
    res.status(400).json({ error: "فون نمبر درست نہیں ہے۔" });
    return;
  }
  const apiKey = process.env.ABSTRACT_PHONE_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "فون تلاش کی سروس ابھی تیار نہیں۔" });
    return;
  }
  try {
    const response = await fetch(
      `https://phoneintelligence.abstractapi.com/v1/?api_key=${encodeURIComponent(apiKey)}&phone=${encodeURIComponent(phone.trim())}`,
      { method: "GET" }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const loc = data.phone_location || {};
    const carrier = data.phone_carrier || {};
    res.json({
      valid: data.phone_validation?.is_valid ?? true,
      city: loc.city || "",
      region: loc.region || "",
      country: loc.country_name || "",
      countryCode: loc.country_code || "",
      carrier: carrier.name || "",
      lineType: carrier.line_type || "",
    });
  } catch (err) {
    console.error("phone lookup failed", err);
    res.status(502).json({ error: "نمبر کی معلومات نہیں مل سکیں۔ دوبارہ کوشش کریں۔" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/create-video — Gemini generates a complete upload-ready package:
// script, title, description, hashtags, thumbnail texts, upload-time tip.
// Follows the user's TITLE+DESCRIPTION POWER RULE style.
// ---------------------------------------------------------------------------
const VIDEO_PACKAGE_PROMPT = [
  "You are a VIRAL YouTube/Facebook Shorts strategist for a Pakistani desi comedy/action channel. Everything must be optimized for MAXIMUM virality.",
  "Given the user's video idea, output a COMPLETE 100% ready-to-upload package as JSON with exactly these keys:",
  '{ "script": "...", "title": "...", "description": "...", "hashtags": ["#..."], "thumbnailTexts": ["...", "...", "..."], "trendingSounds": ["...", "..."], "uploadTip": "..." }',
  "VIRAL RULES (follow strictly):",
  "- HOOK-FIRST script: the FIRST 3 SECONDS must have an explosive hook (shocking line, bold claim, or visual jolt). Then fast-paced dialogue, audible spoken lines, emotional beats (love/pride/laughter/justice), and a CLIFFHANGER ending.",
  "- CTA: the script's last 2 lines MUST include a subscribe/follow call-to-action woven naturally into the dialogue (never a dry 'please subscribe').",
  "- TITLE: use proven viral formulas — curiosity gap ('X ہو گیا… مگر سچ ابھی باقی ہے'), numbers ('7 سال بعد…'), emotional hooks. Format: [Urdu hook + emoji] [tease] | English keywords. Policy-safe: no misleading clickbait, no spam.",
  "- HASHTAGS: AI picks everything, user does zero manual work. Mix: 3-4 high-volume tags (#viral #trending #shorts #fyp) + 4-6 niche tags matched to the video topic + 2-3 evergreen channel tags.",
  "- PLATFORM-SPECIFIC: if platform is YouTube Shorts → lean tags toward #shorts #ytshorts; if Facebook Reels → include #reels #facebookreels #fyp.",
  "- TRENDING SOUNDS: suggest 2-3 trending audio types that fit this video (e.g. 'dramatic dhol beat drop', 'emotional piano build-up') — describe the vibe, not a specific copyrighted song.",
  "- description: keyword-rich first 2 lines (searchable), then subscribe CTA line, then the hashtags.",
  "- thumbnailTexts: 3 short punchy options (max 5 words each), curiosity-driven.",
  "- uploadTip: best upload time for Pakistan audience, one line.",
  "- Write Urdu in Perso-Arabic script. NEVER use Devanagari (Hindi) script.",
  "- Output ONLY the JSON, no markdown fences, no explanations.",
].join("\n");

app.post("/api/create-video", async (req, res) => {
  const { idea, platform, language } = req.body ?? {};
  if (typeof idea !== "string" || idea.trim().length === 0) {
    res.status(400).json({ error: "ویڈیو کا آئیڈیا درست نہیں ہے۔" });
    return;
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "Gemini API key لوڈ نہیں ہوئی۔" });
    return;
  }
  try {
    const platformName = platform === "facebook" ? "Facebook Reels" : platform === "youtube" ? "YouTube Shorts" : "YouTube Shorts + Facebook Reels";
    const langName = language === "en" ? "English" : language === "roman" ? "Roman Urdu" : language === "ar" ? "Arabic (العربية)" : "Urdu (Perso-Arabic)";
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: VIDEO_PACKAGE_PROMPT }] },
          contents: [{
            role: "user",
            parts: [{ text: `Video idea: ${idea.trim()}\nPlatform: ${platformName}\nLanguage: ${langName}` }],
          }],
          generationConfig: { maxOutputTokens: 2048, responseMimeType: "application/json" },
        }),
      }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    let raw = result.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() || "";
    raw = raw.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    const pkg = JSON.parse(raw);
    if (!pkg.title || !pkg.script) throw new Error("incomplete-package");
    res.json({
      title: pkg.title,
      description: pkg.description || "",
      hashtags: Array.isArray(pkg.hashtags) ? pkg.hashtags : [],
      thumbnailTexts: Array.isArray(pkg.thumbnailTexts) ? pkg.thumbnailTexts : [],
      trendingSounds: Array.isArray(pkg.trendingSounds) ? pkg.trendingSounds : [],
      script: pkg.script,
      uploadTip: pkg.uploadTip || "",
    });
  } catch (err) {
    console.error("create-video request failed", err);
    res.status(502).json({ error: "ویڈیو پیکج نہیں بن سکا۔ دوبارہ کوشش کریں۔" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/openai/speech — Gemini TTS with the Charon male voice
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

  // Truncate the spoken text for speed: long replies take much longer to
  // synthesize. The full text is still displayed in chat — only the audio
  // is shortened.
  const ttsText = text.slice(0, 2000);

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
            contents: [{ parts: [{ text: ttsText }] }],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: "Charon" } },
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
        await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
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
