/**
 * FloatingCharacter — the in-app floating character + living
 * wallpaper (Phase 2, Stonic v3.1.19: "Live on desktop" floating
 * character + "Living wallpaper turns your desktop into a calm,
 * deep-space scene").
 *
 * HONEST SCOPE: a web page cannot float above OTHER windows or
 * change the OS wallpaper — that needs the companion extension
 * (see extension/README.md). What IS real here: a small draggable
 * Uniqa silhouette that floats INSIDE the app (above the chat, the
 * panels, everything), with a mic button that starts listening, and
 * a living-wallpaper animated background INSIDE the app. Both are
 * toggles in Settings.
 */

import { useRef, useState } from 'react';

export default function FloatingCharacter({
  onMicClick,
  onClose,
}: {
  onMicClick?: () => void;
  onClose: () => void;
}) {
  const [pos, setPos] = useState({ x: window.innerWidth - 120, y: window.innerHeight - 180 });
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  function onPointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest('button')) return;
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    setPos({
      x: Math.max(0, Math.min(window.innerWidth - 90, e.clientX - dragRef.current.dx)),
      y: Math.max(0, Math.min(window.innerHeight - 130, e.clientY - dragRef.current.dy)),
    });
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  return (
    <div
      className="ufloat-char"
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      data-testid="floating-character"
      role="dialog"
      aria-label="تیرتا ہوا کردار — یونیکا"
    >
      <div className="ufloat-char-face" aria-hidden="true">
        <svg viewBox="20 20 360 320" className="ufloat-char-svg">
          <defs>
            <linearGradient id="ufloat-hair" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#67e8f9" />
              <stop offset="100%" stopColor="#0e7490" />
            </linearGradient>
          </defs>
          <path
            d="M200 46 C228 46 248 72 247 106 C246 136 234 160 214 169 C202 174 188 171 179 160 C165 144 158 120 160 96 C162 68 176 46 200 46 Z"
            fill="#0e3a4d"
            stroke="#67e8f9"
            strokeWidth="3"
          />
          <path
            d="M200 36 C172 36 152 58 148 90 C147 104 149 118 148 132 C156 116 158 96 168 80 C178 66 188 58 200 56 C214 58 226 68 234 84 C242 100 244 118 252 132 C252 116 254 100 250 84 C242 54 224 36 200 36 Z"
            fill="url(#ufloat-hair)"
          />
          <path
            d="M52 340 C56 288 84 252 122 232 C148 219 172 210 186 200 L218 200 C232 211 256 220 282 232 C318 252 346 288 350 340 Z"
            fill="url(#ufloat-hair)"
            opacity="0.95"
          />
        </svg>
      </div>
      <div className="ufloat-char-bar" dir="ltr">
        <button
          type="button"
          onClick={() => onMicClick?.()}
          data-testid="button-floating-mic"
          aria-label="آواز سے بولیں"
          title="آواز سے بولیں"
        >
          🎙️
        </button>
        <span className="ufloat-char-name">یونیکا</span>
        <button
          type="button"
          onClick={onClose}
          data-testid="button-floating-close"
          aria-label="تیرتا ہوا کردار بند کریں"
          title="بند کریں"
        >
          ✕
        </button>
      </div>
      <span className="ufloat-char-hint">کھینچ کر کہیں بھی لے جائیں</span>
    </div>
  );
}
