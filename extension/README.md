# Unique AI Companion — browser extension (Phase 2, 2026-11-28)

The find-a-way route for the two things a plain web page cannot do:

1. **Global push-to-talk** — `Ctrl+Shift+U` from ANY tab starts/stops
   talking to Unique AI (the app tab must be open — Chrome gives an
   extension no background mic, so a fully-closed app cannot hear
   anything; that is a Chrome limit, not an extension limit).
2. **Floating character on any page** — a small draggable 💛 dot on
   every site; a tap opens the Unique AI tab. (Inside the app itself
   the in-app floating character is used instead.)

Plus `Ctrl+Shift+Y` opens the app, and the popup picks live site vs
laptop (`localhost:5000`).

## Install (Chrome / Edge / Brave — unpacked, 1 minute)

1. Open `chrome://extensions` → turn **Developer mode** ON (top right).
2. **Load unpacked** → pick this `extension/` folder.
3. Pin the 💛 icon. Done — no account, no sign-in.

## What it asks for, and why (honest)

- `tabs` — find/activate the open Unique AI tab.
- `storage` — remember live-vs-localhost choice only.
- `scripting` — hand the push-to-talk toggle to a fresh app tab.
- Host access to all sites — ONLY so the 💛 dot can render on any
  page. The content script **reads nothing**: no page text, no
  passwords, no history, no recording. It is a button that opens
  the app. If that permission is too broad for you, remove the
  `https://*/*` / `http://*/*` matches from `manifest.json` —
  the extension still works inside the app tab (global hotkey +
  popup), just without the dot on other pages.

## What it cannot do (honest limits)

- Hear a wake word / hotkey while the app tab is fully closed.
- Drive other apps on the computer or click outside the browser
  (a desktop agent would need a native app, not an extension).
- Change the OS "start with Windows" setting — that lives on the
  INSTALLED PWA (Settings → «ایپ انسٹال کریں» explains where).

## Files

- `manifest.json` — MV3 manifest (commands, content scripts).
- `background.js` — service worker: commands + tab handling.
- `content.js` — app-tab bridge (forwards the toggle as a window
  event the app listens for) + the floating dot on other pages.
- `popup.html` / `popup.js` — the popup (open app, live/local).
- `icon.png` — the app logo (copied from `client/public/logo.png`).
