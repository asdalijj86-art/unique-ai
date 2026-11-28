/**
 * content.js — Unique AI Companion (Phase 2, 2026-11-28).
 *
 * Runs in the Unique AI app tab AND (via the manifest's second
 * match, see README) as the floating overlay on other pages:
 *  - In the app tab: forwards the extension's push-to-talk toggle
 *    into the app as a window CustomEvent — the app owns the mic,
 *    so the toggle always matches the real recording state.
 *  - On other pages: a tiny draggable Uniqa dot (the floating
 *    character, outside the app). A tap opens the app tab.
 *
 * The overlay never reads page content, never touches passwords,
 * never records anything — it is a button that opens the app.
 */
(function () {
  'use strict';

  // ---- In the app tab: bridge the extension command into the app. ----
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'unique-ai:ptt-toggle') {
      window.dispatchEvent(new CustomEvent('unique-ai:ptt-toggle'));
    }
  });

  // ---- Floating character on other pages (not the app itself — the
  // app already has its own in-app floating character). ----
  const isAppPage =
    location.hostname === 'localhost' ||
    location.hostname.endsWith('onrender.com');
  if (isAppPage) return;

  function makeDot() {
    if (document.getElementById('unique-ai-float-dot')) return;
    const dot = document.createElement('div');
    dot.id = 'unique-ai-float-dot';
    dot.title = 'Unique AI کھولیں — یونیکا سے بات کریں';
    dot.setAttribute('role', 'button');
    dot.setAttribute('aria-label', 'Unique AI کھولیں');
    dot.style.cssText = [
      'position: fixed', 'right: 16px', 'bottom: 16px', 'z-index: 2147483647',
      'width: 52px', 'height: 52px', 'border-radius: 50%', 'cursor: pointer',
      'display: flex', 'align-items: center', 'justify-content: center',
      'font-size: 26px', 'color: #fff',
      'background: radial-gradient(circle at 35% 30%, #67e8f9, #0e7490 70%)',
      'border: 2px solid rgba(103, 232, 249, 0.8)',
      'box-shadow: 0 4px 18px rgba(14, 116, 144, 0.55)',
      'user-select: none', 'font-family: sans-serif',
    ].join(';');
    dot.textContent = '💛';
    let drag = null;
    dot.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX - dot.getBoundingClientRect().left, y: e.clientY - dot.getBoundingClientRect().top, moved: false };
      dot.setPointerCapture(e.pointerId);
    });
    dot.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x - dot.getBoundingClientRect().left;
      const dy = e.clientY - drag.y - dot.getBoundingClientRect().top;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      if (!drag.moved) return;
      dot.style.right = 'auto';
      dot.style.bottom = 'auto';
      dot.style.left = `${Math.max(0, Math.min(window.innerWidth - 52, e.clientX - drag.x))}px`;
      dot.style.top = `${Math.max(0, Math.min(window.innerHeight - 52, e.clientY - drag.y))}px`;
    });
    dot.addEventListener('pointerup', () => {
      if (drag && !drag.moved) chrome.runtime.sendMessage({ type: 'unique-ai:open-app' });
      drag = null;
    });
    document.documentElement.appendChild(dot);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', makeDot, { once: true });
  } else {
    makeDot();
  }
})();
