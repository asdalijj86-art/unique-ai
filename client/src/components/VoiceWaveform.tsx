/**
 * VoiceWaveform — canvas-based symmetric voice visualizer (like the reference
 * image: glowing bars, brightest in the center, fading outward).
 *
 * Modes:
 *  - idle:      gentle low sine drift
 *  - listening: lively mid-energy bars (mic / continuous voice active)
 *  - speaking:  strong bright pulse (assistant TTS playing)
 *
 * Purely visual (Web Speech API exposes no audio stream), driven by mode.
 */
import { useEffect, useRef } from 'react';

export type WaveMode = 'idle' | 'listening' | 'speaking';

type VoiceWaveformProps = {
  mode?: WaveMode;
  height?: number;
  barCount?: number;
};

export default function VoiceWaveform({ mode = 'idle', height = 84, barCount = 56 }: VoiceWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const modeRef = useRef<WaveMode>(mode);
  modeRef.current = mode;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let t = 0;
    // Smooth energy transitions so mode changes don't jump.
    let energy = 0.18;

    const render = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const target = modeRef.current === 'speaking' ? 1 : modeRef.current === 'listening' ? 0.62 : 0.16;
      energy += (target - energy) * 0.06;
      t += 0.055 + energy * 0.09;

      const n = barCount;
      const gap = 3;
      const barW = Math.max(2, (w - gap * (n - 1)) / n);
      const midY = h / 2;

      for (let i = 0; i < n; i++) {
        // Center-weighted envelope: brightest/tallest in the middle.
        const centered = 1 - Math.abs(i - (n - 1) / 2) / ((n - 1) / 2);
        const envelope = 0.25 + 0.75 * centered * centered;
        const wave =
          Math.sin(t * 2 + i * 0.42) * 0.5 +
          Math.sin(t * 3.7 + i * 0.21) * 0.3 +
          Math.sin(t * 1.3 - i * 0.55) * 0.2;
        const bh = Math.max(2, Math.abs(wave) * envelope * energy * h * 0.92);
        const x = i * (barW + gap);
        const y = midY - bh / 2;

        const bright = 0.35 + 0.65 * centered;
        const alpha = 0.35 + 0.65 * bright * (0.4 + energy * 0.6);
        const hue = modeRef.current === 'speaking' ? '190, 240, 255' : '56, 224, 255';
        ctx.fillStyle = `rgba(${hue},${alpha.toFixed(3)})`;
        ctx.shadowColor = `rgba(34, 211, 238,${(0.55 * bright * energy + 0.1).toFixed(3)})`;
        ctx.shadowBlur = 8 * bright;

        const r = Math.min(barW / 2, 2.5);
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(x, y, barW, bh, r);
        } else {
          ctx.rect(x, y, barW, bh);
        }
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [barCount]);

  return (
    <canvas
      ref={canvasRef}
      className="voice-waveform"
      style={{ width: '100%', height }}
      aria-hidden="true"
    />
  );
}
