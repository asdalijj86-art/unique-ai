// Unique AI — the brain's BUILDER capability (Phase 3, احمد's domain).
//
// This is NOT a tool and NOT the deleted website-builder. It is a
// background workshop behind the conversation: the user ORDERS a thing
// by voice or chat («کار والی گیم بنا دو», «سافٹ ویئر بنا دو», «ایک
// چھوٹا AI بنا دو») and the brain's classifier (brain.js: build_app)
// starts a job here. The job generates ONE complete, self-contained
// HTML file with the app's Gemini stack, VALIDATES it before anyone
// is told it exists, repairs it once if the first attempt is broken,
// and only then is the user told «آپ کی چیز ریڈی ہو گئی ہے» with an
// openable link + a file download. A broken build is NEVER delivered:
// after one failed repair the job ends honestly as "failed".
//
// Storage honesty: jobs live in an in-memory Map. On the free tier
// the server restarts often, and a restart forgets every built file —
// so the completion card always tells the user to DOWNLOAD the file
// to keep it forever; the link lives only while the server runs.
//
// The AI call is INJECTED (createBuilderService({ generate })) so the
// whole pipeline — job lifecycle, validation, repair, serving — can
// be verified end-to-end without spending quota; production wires in
// makeGeminiGenerator() below (same request/response shape as the
// proven /api/build-app endpoint in index.js).

import vm from "node:vm";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Validation — a build is "done" only when ALL of these pass.
// ---------------------------------------------------------------------------
export function validateHtml(html) {
  const errors = [];
  if (typeof html !== "string" || !html.trim()) {
    return { ok: false, errors: ["empty output"] };
  }
  const doc = html.trim();
  if (doc.length < 600) errors.push(`too small (${doc.length} bytes — a real app/game is never this tiny)`);
  if (!/^(<!doctype html>|<html)/i.test(doc)) errors.push("does not start with <!DOCTYPE html> or <html>");
  if (!/<head[\s>]/i.test(doc)) errors.push("missing <head>");
  if (!/<body[\s>]/i.test(doc)) errors.push("missing <body>");
  if (!/<\/html>\s*$/i.test(doc)) errors.push("truncated: no closing </html>");

  const count = (re) => (doc.match(re) || []).length;
  const scriptOpen = count(/<script(\s[^>]*)?>/gi);
  const scriptClose = count(/<\/script>/gi);
  if (scriptOpen !== scriptClose) errors.push(`unbalanced <script> tags (${scriptOpen} open / ${scriptClose} close)`);
  const styleOpen = count(/<style(\s[^>]*)?>/gi);
  const styleClose = count(/<\/style>/gi);
  if (styleOpen !== styleClose) errors.push(`unbalanced <style> tags (${styleOpen} open / ${styleClose} close)`);

  // Every INLINE script must at least parse. (External src= scripts
  // carry no body to check; the prompt forbids them anyway.)
  const inlineRe = /<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  let idx = 0;
  while ((m = inlineRe.exec(doc)) !== null) {
    idx += 1;
    const code = m[1].trim();
    if (!code) continue;
    try {
      new vm.Script(code);
    } catch (e) {
      errors.push(`inline script #${idx} does not parse: ${e.message}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Generation prompt — completeness is demanded, kind by kind.
// ---------------------------------------------------------------------------
const KIND_GUIDANCE = {
  game: [
    "This is a GAME and it must be genuinely PLAYABLE from start to finish:",
    "- A start screen with the game name and a big Start button; the game does not run before Start.",
    "- Real controls: keyboard (arrows / space) AND touch (on-screen buttons or swipe) — the user plays on a phone.",
    "- A score that visibly increases, increasing difficulty, a clear GAME OVER state, and a Restart button that truly resets and replays.",
    "- Draw with canvas or DOM + CSS only (no image files). Sound is optional (WebAudio beeps are fine).",
    "Named classics, when the request matches: CAR game — top-down road, the player's car steers left/right between lanes, traffic cars come down to dodge, coins to collect, speed and score rise, a crash ends the game. BIKE game — side view rider, accelerate/brake, jump or dodge obstacles, distance + score. PLANE game — side view plane flying up/down, dodge birds/clouds (or shoot them), collect stars, fuel or lives that can run out.",
  ].join("\n"),
  app: [
    "This is a small APP / TOOL and it must actually WORK:",
    "- Every button and control must do its real job (calculate, save, convert, track…) — no dead buttons, no placeholder screens.",
    "- Keep state in localStorage when persistence makes sense (notes, scores, settings).",
    "- Clear mobile-first layout, big touch targets, sensible sample content so it looks complete on first open.",
  ].join("\n"),
  ai: [
    "This is a small AI COMPANION chat page and it must actually TALK:",
    "- A friendly chat UI (message bubbles, input box, send button) with a warm built-in companion persona (it answers in Urdu by default, matching the user's language).",
    "- It talks through the Google Gemini API called DIRECTLY from the page: POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent with header 'x-goog-api-key' and a JSON body { contents: [{ role: 'user', parts: [{ text }] }], systemInstruction: { parts: [{ text: persona }] } }; the reply text is at candidates[0].content.parts[0].text.",
    "- The page carries its OWN settings field where the user pastes their own free Gemini API key once; store it in the page's localStorage and reuse it. While no key is saved, show a gentle Urdu notice inside the chat explaining the one step (paste your free Gemini key in Settings above) — never fake a reply.",
    "- Keep the conversation history in memory and send the last turns as context. Show a typing indicator while waiting and a kind error message if the call fails.",
  ].join("\n"),
  website: [
    "This is a complete WEBSITE in one page:",
    "- Hero section, the main content sections the request implies, and a footer — real written content throughout, never lorem ipsum.",
    "- Working navigation (anchor links / smooth scroll), a mobile-friendly responsive layout, and any small interactive touches (gallery, form with a friendly in-page confirmation) wired to real JS.",
  ].join("\n"),
  vpn_interface: [
    "This is a VPN APP INTERFACE + PRIVATE-SERVER SETUP GUIDE — and it must be HONEST about what it is:",
    "- A clear banner at the top states in Urdu that this page is the app's design and a setup guide, NOT a working VPN by itself: a real VPN needs servers, and this guide sets up the user's OWN private one.",
    "- The interface part: a polished VPN-app design (big connect button look, server list, status area) presented as the app's design preview.",
    "- The guide part: complete step-by-step instructions in simple Urdu to rent a small VPS, install WireGuard (or Algo) on it, create a config, and connect the phone's official WireGuard app with that config — numbered steps, exact commands in code blocks, and safety notes. This guide is the real deliverable.",
  ].join("\n"),
};

export const BUILDER_SYSTEM_PROMPT = [
  "You are an expert software developer inside Unique AI. You build ONE complete, self-contained HTML file for whatever the user ordered — a game, an app, a small AI, a website.",
  "OUTPUT RULES (absolute):",
  "- Output ONLY the HTML code. No explanations, no markdown fences, no text before or after.",
  "- Everything inline: CSS in <style>, JS in <script>. NO external files, images, fonts or CDN libraries — the file must work fully offline, opened from anywhere.",
  "- Start with <!DOCTYPE html> and END with </html>. A truncated file is a failed build: manage your length — write complete but efficient code, prefer compact helper functions over repetition.",
  "- Mobile-first and touch-friendly; looks polished: real colors, spacing, rounded cards, readable type.",
  "- The file's UI language matches the request language given below. Urdu content is written ONLY in Perso-Arabic script (NEVER Devanagari/Hindi script) and the layout is RTL for Urdu/Arabic.",
  "- Include <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">.",
  "- The result must WORK, not just look right: every control wired, every game loop complete, no TODOs, no stubs, no 'coming soon'.",
].join("\n");

export function builderUserPrompt({ description, kind, lang, repairNote }) {
  const langHint =
    lang === "en"
      ? "The request is in English — the file's UI should be in English."
      : lang === "roman"
        ? "The request is in Roman Urdu — the file's UI should be in Roman Urdu (Latin script)."
        : "The request is in Urdu — the file's UI should be in Urdu (Perso-Arabic script, RTL).";
  const parts = [
    `Build this, complete and working, as ONE self-contained HTML file: ${description}`,
    langHint,
    KIND_GUIDANCE[kind] || KIND_GUIDANCE.app,
  ];
  if (repairNote) {
    parts.push(
      `IMPORTANT — your previous attempt was REJECTED by automated validation: ${repairNote}. ` +
      "Regenerate the ENTIRE file from scratch, complete, fixing exactly those problems. Do not shorten the app to dodge them — finish the file properly with </html>."
    );
  }
  return parts.join("\n\n");
}

// ---------------------------------------------------------------------------
// The real generator — Gemini, wired in by index.js for production.
// Same endpoint/payload shape as the proven /api/build-app route.
// ---------------------------------------------------------------------------
export function makeGeminiGenerator({ fetchImpl = fetch, timeoutMs = 150000 } = {}) {
  return async function generate({ description, kind, lang, apiKey, repairNote }) {
    if (!apiKey) throw new Error("no API key available for building");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: BUILDER_SYSTEM_PROMPT }] },
            contents: [
              { role: "user", parts: [{ text: builderUserPrompt({ description, kind, lang, repairNote }) }] },
            ],
            generationConfig: { maxOutputTokens: 16384 },
          }),
          signal: ctrl.signal,
        }
      );
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      throw new Error(`Gemini build request failed (HTTP ${response.status})`);
    }
    const result = await response.json();
    let html = result.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim();
    if (!html) throw new Error("Gemini returned an empty build");
    html = html.replace(/^```html\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
    return html;
  };
}

// ---------------------------------------------------------------------------
// Job service — in-memory store, async lifecycle, ONE repair attempt.
// ---------------------------------------------------------------------------
const MAX_JOBS_KEPT = 25;

export function slugifyTitle(title) {
  const slug = String(title || "unique-ai-build")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "unique-ai-build";
}

export function createBuilderService({ generate }) {
  if (typeof generate !== "function") throw new Error("createBuilderService needs a generate function");
  const jobs = new Map();

  function prune() {
    if (jobs.size <= MAX_JOBS_KEPT) return;
    // Oldest finished jobs go first; never drop one still building.
    for (const job of jobs.values()) {
      if (jobs.size <= MAX_JOBS_KEPT) break;
      if (job.status === "done" || job.status === "failed") jobs.delete(job.id);
    }
  }

  async function runJob(job, apiKey) {
    const attempt = async (repairNote) => {
      const html = await generate({
        description: job.description,
        kind: job.kind,
        lang: job.lang,
        apiKey,
        repairNote,
      });
      return { html, check: validateHtml(html) };
    };
    // Exactly TWO attempts ever: the first build, and ONE regeneration
    // when the first was broken (failed validation) or died trying
    // (a transient generation error). The regeneration is told WHAT
    // was wrong. A second failure ends the job honestly — a broken
    // file is never delivered, and no fake link is ever shown.
    let firstProblem = null;
    try {
      const first = await attempt(null);
      if (first.check.ok) {
        job.html = first.html;
        job.status = "done";
        job.updatedAt = Date.now();
        return;
      }
      firstProblem = first.check.errors.join("; ");
      job.firstErrors = first.check.errors;
    } catch (err) {
      firstProblem = err && err.message ? err.message : String(err);
    }
    job.status = "repairing";
    job.updatedAt = Date.now();
    try {
      const second = await attempt(firstProblem);
      if (!second.check.ok) {
        job.status = "failed";
        job.error = second.check.errors.join("; ");
        job.updatedAt = Date.now();
        return;
      }
      job.html = second.html;
      job.status = "done";
      job.updatedAt = Date.now();
    } catch (err) {
      job.status = "failed";
      job.error = err && err.message ? err.message : String(err);
      job.updatedAt = Date.now();
    }
  }

  return {
    /** Create a job and start building in the background. Returns the job. */
    startBuild({ description, title, kind = "app", lang = "ur", apiKey }) {
      const job = {
        id: randomUUID().slice(0, 12),
        title: title || description,
        description,
        kind,
        lang,
        status: "building",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        html: null,
        error: null,
        firstErrors: null,
      };
      jobs.set(job.id, job);
      prune();
      // Background: the chat reply has already gone out ("احمد بنا رہا
      // ہے"); the job finishes whenever it finishes and the client card
      // learns the truth by polling. runJob never rejects.
      void runJob(job, apiKey);
      return job;
    },
    getJob(id) {
      return jobs.get(id) || null;
    },
    /** The most recently STARTED job — what «میرا کام کہاں تک پہنچا؟» asks about. */
    latestJob() {
      let latest = null;
      for (const job of jobs.values()) {
        if (!latest || job.createdAt > latest.createdAt) latest = job;
      }
      return latest;
    },
    /** Public view for the status endpoint — never leaks the HTML body. */
    publicJob(job) {
      if (!job) return null;
      return {
        id: job.id,
        title: job.title,
        kind: job.kind,
        status: job.status,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        ...(job.status === "done" ? { url: `/apps/${job.id}`, downloadUrl: `/apps/${job.id}/download` } : {}),
        ...(job.status === "failed" ? { error: job.error } : {}),
      };
    },
  };
}

// ---------------------------------------------------------------------------
// HTTP routes — registered by index.js BEFORE the SPA catch-all.
//   GET /apps/:id           → the built file itself (or a waiting page)
//   GET /apps/:id/download  → the same file as an attachment download
//   GET /api/build/status/:id → job state for the chat card's polling
// ---------------------------------------------------------------------------
const escapeHtml = (s) =>
  String(s || "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

export function registerBuilderRoutes(app, service) {
  app.get("/apps/:id/download", (req, res) => {
    const job = service.getJob(req.params.id);
    if (!job || job.status !== "done" || !job.html) {
      res.status(404).type("text/plain").send("یہ فائل نہیں مل سکی — شاید سرور ری اسٹارٹ ہو گیا ہے۔ دوبارہ بنا کر دیکھیں۔");
      return;
    }
    res.setHeader("Content-Disposition", `attachment; filename="${slugifyTitle(job.title)}.html"`);
    res.type("html").send(job.html);
  });

  app.get("/apps/:id", (req, res) => {
    const job = service.getJob(req.params.id);
    if (!job) {
      res.status(404).type("text/plain").send("یہ لنک نہیں مل سکا — شاید سرور ری اسٹارٹ ہو گیا ہے۔ دوبارہ بنا کر دیکھیں۔");
      return;
    }
    if (job.status === "failed") {
      res.status(404).type("text/plain").send("یہ چیز بن نہیں سکی تھی — چیٹ میں دوبارہ کہہ کر دیکھیں۔");
      return;
    }
    if (job.status !== "done" || !job.html) {
      // Still building: a tiny honest waiting page that refreshes itself.
      res.type("html").send(
        `<!DOCTYPE html><html lang="ur" dir="rtl"><head><meta charset="utf-8">` +
        `<meta http-equiv="refresh" content="4"><title>بنا رہا ہے…</title></head>` +
        `<body style="font-family:sans-serif;text-align:center;padding:48px 20px;background:#0f0a1e;color:#e9e4ff">` +
        `<h2>🛠️ احمد ابھی بنا رہا ہے…</h2><p>«${escapeHtml(job.title)}» تیار ہوتے ہی یہ صفحہ خود اسی میں بدل جائے گا۔</p></body></html>`
      );
      return;
    }
    res.type("html").send(job.html);
  });

  app.get("/api/build/status/:id", (req, res) => {
    const job = service.getJob(req.params.id);
    if (!job) {
      res.status(404).json({ error: "یہ تعمیر نہیں ملی — شاید سرور ری اسٹارٹ ہو گیا ہے۔" });
      return;
    }
    res.json(service.publicJob(job));
  });
}
