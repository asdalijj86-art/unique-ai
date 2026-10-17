# Unique AI — Clean Rebuild

Simple, clean version. No monorepo, no pnpm workspace, no TypeScript build step.

## Structure

```
unique-ai-clean/
├── package.json          # root scripts
├── .replit               # Replit config (nodejs-24)
├── server/
│   ├── package.json      # express + cors only
│   └── index.js          # API + static file server (plain JS)
└── client/
    ├── package.json      # React + Vite + Tailwind + shadcn deps
    ├── vite.config.js    # simple config, builds to ../server/dist
    ├── index.html        # title: "Unique AI"
    └── src/              # frontend source (Unique AI branding, avatar, voice)
    └── public/           # boy-avatar.webp, favicon.svg, robots.txt
```

## Setup (on Replit)

1. Upload/extract this tarball to the repl root.
2. Add secret: `GEMINI_API_KEY` = your Gemini API key.
3. Run in Shell:
   ```
   npm run install:all
   npm run build
   npm start
   ```
4. The app serves on `PORT` (Replit sets it automatically).

## API

- `POST /api/openai/chat` — body `{messages:[{role,content}]}` → `{text}`
- `POST /api/openai/speech` — body `{text}` → `{audioBase64, mimeType}`
- `GET /api/healthz` → `{status:"ok"}`

## Notes

- The system prompt (Unique AI identity, male grammar, Devanagari ban) is
  locked in `server/index.js` — do not reword.
- The boy auto-speaks every assistant reply via Gemini TTS (Fenrir male voice),
  with browser-voice fallback.
- Voice website commands ("یوٹیوب کھولو" etc.) are in `client/src/lib/voice-commands.ts`.
- Conversations are stored in browser localStorage only.
