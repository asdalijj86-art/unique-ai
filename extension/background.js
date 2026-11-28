/**
 * background.js — Unique AI Companion (Phase 2, 2026-11-28).
 *
 * The companion browser extension: the find-a-way route for the two
 * things a plain web page cannot do — a GLOBAL push-to-talk hotkey
 * (Ctrl+Shift+U, works from any tab while the app tab is open) and a
 * floating character that lives on ANY page, not just inside the app.
 *
 * Honest scope: the extension cannot hear the mic when the app tab
 * is CLOSED (Chrome gives extensions no background mic), and it
 * cannot drive other apps on the computer. What it CAN do: find the
 * open app tab, wake it, and hand it a push-to-talk toggle — the app
 * itself owns the mic and the recording, so the state never desyncs.
 */

const LIVE_URL = 'https://unique-ai-n4p3.onrender.com/';
const LOCAL_URL = 'http://localhost:5000/';

async function getAppUrl() {
  try {
    const stored = await chrome.storage.sync.get(['uniqueAiUrl']);
    const url = stored.uniqueAiUrl || LIVE_URL;
    return url === 'local' ? LOCAL_URL : LIVE_URL;
  } catch {
    return LIVE_URL;
  }
}

async function findAppTab() {
  const tabs = await chrome.tabs.query({ url: ['http://localhost:5000/*', 'https://unique-ai-n4p3.onrender.com/*'] });
  return tabs[0] || null;
}

async function openAppTab() {
  const existing = await findAppTab();
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
    return existing;
  }
  const url = await getAppUrl();
  return chrome.tabs.create({ url });
}

/** Toggle push-to-talk in the app tab (start if idle, send if
 *  recording). The app owns the real recording state. */
async function togglePushToTalk() {
  let tab = await findAppTab();
  if (!tab) {
    tab = await openAppTab();
    // Give the app a moment to mount before toggling.
    await new Promise((r) => setTimeout(r, 1500));
  }
  await chrome.tabs.update(tab.id, { active: true });
  await chrome.tabs.sendMessage(tab.id, { type: 'unique-ai:ptt-toggle' }).catch(() => {
    // Content script not ready yet (fresh tab) — inject and retry once.
    return chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js'],
    }).then(() => chrome.tabs.sendMessage(tab.id, { type: 'unique-ai:ptt-toggle' }).catch(() => {}));
  });
}

chrome.commands.onCommand.addListener((command) => {
  if (command === 'push-to-talk') void togglePushToTalk();
  else if (command === 'open-unique') void openAppTab();
});

chrome.runtime.onMessage.addListener((message, sender) => {
  // The floating overlay on any page asks for the app.
  if (message?.type === 'unique-ai:open-app') {
    void openAppTab();
  }
});
