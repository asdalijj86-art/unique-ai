/**
 * popup.js — Unique AI Companion popup: open the app + pick which
 * app URL the extension uses (live site or the laptop's localhost).
 */
const LIVE = 'https://unique-ai-n4p3.onrender.com/';
const LOCAL = 'http://localhost:5000/';

const liveBtn = document.getElementById('live');
const localBtn = document.getElementById('local');

async function refresh() {
  const stored = await chrome.storage.sync.get(['uniqueAiUrl']);
  const useLocal = stored.uniqueAiUrl === 'local';
  liveBtn.classList.toggle('active', !useLocal);
  localBtn.classList.toggle('active', useLocal);
}

liveBtn.addEventListener('click', async () => {
  await chrome.storage.sync.set({ uniqueAiUrl: 'live' });
  await refresh();
});
localBtn.addEventListener('click', async () => {
  await chrome.storage.sync.set({ uniqueAiUrl: 'local' });
  await refresh();
});
document.getElementById('open').addEventListener('click', async () => {
  const stored = await chrome.storage.sync.get(['uniqueAiUrl']);
  const url = stored.uniqueAiUrl === 'local' ? LOCAL : LIVE;
  const tabs = await chrome.tabs.query({ url: ['http://localhost:5000/*', 'https://unique-ai-n4p3.onrender.com/*'] });
  if (tabs[0]) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    await chrome.windows.update(tabs[0].windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
  window.close();
});
void refresh();
