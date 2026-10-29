// VideoMaker — a REAL rendered-video maker inside Unique AI.
//
// ONE-PROMPT AUTOMATIC by default: prompt/story/dialogue in →
// scenes, characters, voices, audio, animation, subtitles,
// transitions, export and a download link out. The build button click
// is the only user gesture the browser needs; after that the maker
// never stops to ask a per-scene question or a fresh permission.
//   1. Dialogue FIRST: each scene's audio is generated (app's existing
//      TTS legs: Gemini speech, then free Edge Salman/Uzma) and checked
//      non-empty + fitting its 10s scene BEFORE any frame is drawn.
//   2. ONLY then the finished audio drives the animation: a clearly
//      VISIBLE jaw + head bob from the audio's RMS envelope, mouth
//      shut in pauses, one speaker per shot.
//   3. Scenes are assembled in order with crossfade transitions,
//      slow Ken Burns framing on photos, continuous background
//      ambience under dialogue (no silent gaps), exact subtitles,
//      and exported with MediaRecorder.
//
// HONEST LIMITS, printed on the panel itself:
// - The mouth is audio-ENVELOPE driven (jaw opens with loudness), NOT
//   phoneme-matched lip-sync. No free engine in this stack does Urdu
//   syllable shapes, for humans or animals — claiming otherwise would
//   repeat the empty-promise failure this feature exists to fix.
// - Characters without an uploaded photo get a deterministic cartoon
//   face drawn in-browser (same hue/voice/face every time, saved as a
//   lock). It looks stylised, not like a movie star — an uploaded
//   reference photo always replaces it and is then locked.
// - Export is WebM (the browser recorder's format). It is NEVER
//   labelled MP4. The file lives only in this browser session until
//   downloaded, so the panel says so plainly.

import { useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { synthesizeMairaSpeech, synthesizeEdgeSpeech } from '@/lib/api';
import {
  type CharacterLock,
  type VideoJobState,
  type VideoScene,
  NARRATOR_NAME,
  VIDEO_JOB_KEY,
  VIDEO_SCENE_SECONDS,
  autoHueFor,
  autoSpeciesFor,
  autoVoiceFor,
  computeEnvelope,
  ensureCharacterLocks,
  loadCharacterLocks,
  loadVideoMakerJob,
  mouthOpen,
  parseDialogue,
  saveVideoMakerJob,
  sceneMotion,
  speakingCharacters,
  upsertCharacterLock,
  videoMakerStatusText,
  wrapLines,
} from '@/lib/video-maker';

const CANVAS_W = 540;
const CANVAS_H = 960;
const FPS = 30;
const PLAYBACK_RATE = 1.1; // FAST-BUT-CLEAR LOCK (2026-10-29): speech is
// slightly fast so dialogue fits its scene and never feels late, but
// never sped to unintelligibility and never shortened — every word
// spoken, exactly as written. MediaRecorder itself is real-time, so
// recording a 60s video still takes ~60s; everything around it
// (audio, setup, UI, export) is kept snappy with no slow fades.

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image-load'));
    img.src = src;
  });
}

// --- drawn cartoon face (automatic characters) ----------------------------
// Deterministic per character: same species shape + hue every video.
// The mouth IS the animated jaw: its height follows the audio envelope.
function drawAutoFace(
  ctx: CanvasRenderingContext2D,
  name: string,
  mouth: number,
  blink: boolean,
  cx: number,
  cy: number,
  r: number,
): void {
  const species = autoSpeciesFor(name);
  const hue = autoHueFor(name);
  const main = `hsl(${hue}, 55%, 55%)`;
  const dark = `hsl(${hue}, 45%, 38%)`;
  const light = `hsl(${hue}, 70%, 78%)`;
  ctx.save();
  ctx.translate(cx, cy);
  // Ears / mane
  if (species === 'lion') {
    ctx.fillStyle = 'hsl(38, 75%, 42%)';
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.35, 0, Math.PI * 2);
    ctx.fill();
  } else if (species === 'fox') {
    ctx.fillStyle = main;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * r * 0.45, -r * 0.75);
      ctx.lineTo(s * r * 0.95, -r * 1.45);
      ctx.lineTo(s * r * 1.0, -r * 0.6);
      ctx.closePath();
      ctx.fill();
    }
  } else if (species === 'elephant') {
    ctx.fillStyle = main;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(s * r * 1.05, 0, r * 0.45, r * 0.7, s * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = main;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(s * r * 0.7, -r * 0.8, r * 0.38, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Head
  ctx.fillStyle = main;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  if (species === 'deer') {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (const [x, y] of [[-0.4, -0.5], [0.35, -0.6], [0.1, -0.35]] as const) {
      ctx.beginPath();
      ctx.arc(x * r, y * r, r * 0.09, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Eyes (blink = closed lids)
  for (const s of [-1, 1]) {
    if (blink) {
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = Math.max(2, r * 0.04);
      ctx.beginPath();
      ctx.moveTo(s * r * 0.55 - r * 0.14, -r * 0.25);
      ctx.lineTo(s * r * 0.55 + r * 0.14, -r * 0.25);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#141414';
      ctx.beginPath();
      ctx.arc(s * r * 0.4, -r * 0.25, r * 0.11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(s * r * 0.4 + r * 0.04, -r * 0.29, r * 0.035, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Snout + nose
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.ellipse(0, r * 0.35, r * 0.5, r * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
  if (species === 'elephant') {
    ctx.fillStyle = main;
    ctx.beginPath();
    ctx.ellipse(0, r * 0.7, r * 0.22, r * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.18, r * 0.14, r * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  // THE JAW: height follows the finished audio's envelope, and only
  // while this character speaks. Closed (a line) in every pause.
  const mouthH = Math.max(2, mouth * r * 0.55);
  ctx.fillStyle = '#3d0a12';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.55, r * 0.3, mouthH / 2 + 2, 0, 0, Math.PI * 2);
  ctx.fill();
  if (mouth > 0.25) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(-r * 0.22, r * 0.55 - mouthH / 2 + 1, r * 0.44, Math.max(2, mouthH * 0.25));
  }
  ctx.restore();
  void dark;
}

type RenderScene = {
  scene: VideoScene;
  audio: AudioBuffer;
  envelope: number[]; // 60fps over the SOURCE audio
  image: HTMLImageElement | null;
};

export default function VideoMaker({ onClose, embedded = false }: { onClose: () => void; embedded?: boolean }) {
  const [prompt, setPrompt] = useState('');
  const [locks, setLocks] = useState<CharacterLock[]>(() => {
    try {
      return loadCharacterLocks(window.localStorage);
    } catch {
      return [];
    }
  });
  const [job, setJob] = useState<VideoJobState | null>(() => {
    try {
      return loadVideoMakerJob(window.localStorage);
    } catch {
      return null;
    }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoFormat, setVideoFormat] = useState('');
  const [previewScenes, setPreviewScenes] = useState<VideoScene[] | null>(null);
  const runRef = useRef(0);

  useEffect(() => () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
  }, [videoUrl]);

  function updateJob(next: VideoJobState) {
    setJob(next);
    try {
      saveVideoMakerJob(window.localStorage, next);
    } catch {
      // status answers fall back to the live card
    }
  }

  function refreshLocks() {
    try {
      setLocks(loadCharacterLocks(window.localStorage));
    } catch {
      // ignore
    }
  }

  function onImageFile(name: string, file: File) {
    if (file.size > 2 * 1024 * 1024) {
      setError('تصویر 2MB سے بڑی ہے — چھوٹی تصویر چنیں، ورنہ یہ محفوظ نہیں ہوگی۔');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const current = locks.find((c) => c.name === name);
      upsertCharacterLock(window.localStorage, {
        name,
        voice: current?.voice ?? autoVoiceFor(name),
        imageDataUrl: dataUrl,
      });
      refreshLocks();
    };
    reader.readAsDataURL(file);
  }

  function setVoice(name: string, voice: 'male' | 'female') {
    const current = locks.find((c) => c.name === name);
    upsertCharacterLock(window.localStorage, {
      name,
      voice,
      imageDataUrl: current?.imageDataUrl ?? null,
    });
    refreshLocks();
  }

  const parsed = parseDialogue(prompt);
  const characters = speakingCharacters(parsed);

  async function synthesizeScene(text: string, female: boolean): Promise<AudioBuffer> {
    // Leg 1: the app's existing Gemini speech path (Settings keys, untouched).
    // Leg 2: free Edge Salman/Uzma via the server — no key, no quota.
    // A scene whose every leg fails FAILS the whole build plainly;
    // it is never replaced by silence or a fake link.
    let lastErr: unknown = null;
    try {
      const r = await synthesizeMairaSpeech({ text, female });
      if (r?.audioBase64) {
        const ctx = new AudioContext();
        const buf = await ctx.decodeAudioData(base64ToBytes(r.audioBase64).buffer as ArrayBuffer);
        await ctx.close();
        if (buf.duration > 0.3) return buf;
      }
    } catch (e) {
      lastErr = e;
    }
    try {
      const r = await synthesizeEdgeSpeech({ text, voice: female ? 'uniqa' : undefined });
      if (r?.audioBase64) {
        const ctx = new AudioContext();
        const buf = await ctx.decodeAudioData(base64ToBytes(r.audioBase64).buffer as ArrayBuffer);
        await ctx.close();
        if (buf.duration > 0.3) return buf;
      }
    } catch (e) {
      lastErr = e;
    }
    throw lastErr || new Error('tts-failed');
  }

  async function build() {
    const runId = ++runRef.current;
    const scenes = parseDialogue(prompt);
    if (scenes.length === 0) {
      setError('پہلے پرامپٹ یا مکالمہ لکھیں — خالی پرامپٹ سے ویڈیو نہیں بن سکتی۔');
      return;
    }
    setError('');
    setVideoUrl(null);
    setBusy(true);
    // FAST START: progress shows at once, before any audio call, so
    // the user never stares at a stuck panel while TTS works.
    setProgress('شروع ہو رہا ہے — پہلی آواز بن رہی ہے…');
    const title = prompt.trim().slice(0, 40);
    const jobBase = {
      id: `${Date.now()}`,
      title,
      sceneTotal: scenes.length,
      format: 'video/webm',
      updatedAt: new Date().toISOString(),
    };
    // AUTOMATIC locks: every character gets a lock without asking.
    let allLocks: CharacterLock[];
    try {
      allLocks = ensureCharacterLocks(window.localStorage, scenes);
      refreshLocks();
    } catch {
      allLocks = locks;
    }
    const lockByName = new Map(allLocks.map((c) => [c.name, c]));

    // --- STEP 1 (dialogue-first): audio for every scene, checked. ---
    const rendered: RenderScene[] = [];
    try {
      for (let i = 0; i < scenes.length; i++) {
        if (runRef.current !== runId) return;
        const scene = scenes[i];
        updateJob({ ...jobBase, status: 'building', sceneIndex: i, stage: `آڈیو بن رہی ہے: ${scene.speaker}`, error: '' });
        setProgress(`آڈیو بن رہی ہے — سین ${i + 1}/${scenes.length} (${scene.speaker})…`);
        const lock = lockByName.get(scene.speaker);
        const female = lock?.voice === 'female';
        const audio = await synthesizeScene(scene.text, female);
        const effective = audio.duration / PLAYBACK_RATE;
        if (effective > VIDEO_SCENE_SECONDS) {
          throw new Error(
            `سین ${i + 1} کا مکالمہ ${effective.toFixed(1)} سیکنڈ کا ہے، سین صرف ${VIDEO_SCENE_SECONDS} سیکنڈ کا ہے — الفاظ چھوڑے بغیر یہ فٹ نہیں ہو سکتا۔ جملہ چھوٹا کریں۔`,
          );
        }
        const envelope = computeEnvelope(audio.getChannelData(0), audio.sampleRate, 60, audio.duration);
        let image: HTMLImageElement | null = null;
        const imageUrl = lock?.imageDataUrl;
        if (imageUrl) {
          try {
            image = await loadImage(imageUrl);
          } catch {
            image = null; // a broken locked photo falls back to the drawn face, never fails the build
          }
        }
        rendered.push({ scene, audio, envelope, image });
      }
    } catch (e) {
      const msg = e instanceof Error && e.message && e.message !== 'tts-failed'
        ? e.message
        : 'آواز تیار نہیں ہو سکی — شاید آواز کی سروس یا نیٹ میں مسئلہ ہے۔ کوئی لنک نہیں دیا جا رہا۔';
      updateJob({ ...jobBase, status: 'failed', sceneIndex: 0, stage: 'ناکام', error: msg });
      setError(msg);
      setBusy(false);
      return;
    }

    // --- STEP 2: render + record in real time, with transitions. ---
    updateJob({ ...jobBase, status: 'rendering', sceneIndex: 0, stage: 'ویڈیو رینڈر ہو رہی ہے', error: '' });
    setProgress('ویڈیو رینڈر ہو رہی ہے… (یہ اتنی ہی دیر لے گی جتنی ویڈیو لمبی ہے)');
    try {
      const totalSeconds = scenes.length * VIDEO_SCENE_SECONDS;
      const canvas = document.createElement('canvas');
      canvas.width = CANVAS_W;
      canvas.height = CANVAS_H;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas-unavailable');
      const audioCtx = new AudioContext();
      const dest = audioCtx.createMediaStreamDestination();
      // Continuous brown-noise bed under dialogue: no silent gaps.
      const bedLen = audioCtx.sampleRate * 2;
      const bedBuf = audioCtx.createBuffer(1, bedLen, audioCtx.sampleRate);
      const bedData = bedBuf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < bedLen; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        bedData[i] = last * 3.5;
      }
      const bed = audioCtx.createBufferSource();
      bed.buffer = bedBuf;
      bed.loop = true;
      const bedGain = audioCtx.createGain();
      bedGain.gain.value = 0.04;
      bed.connect(bedGain);
      bedGain.connect(dest);
      bed.start();
      for (let i = 0; i < rendered.length; i++) {
        const src = audioCtx.createBufferSource();
        src.buffer = rendered[i].audio;
        src.playbackRate.value = PLAYBACK_RATE;
        src.connect(dest);
        src.start(i * VIDEO_SCENE_SECONDS);
      }

      const drawFrame = (sceneIdx: number, tInScene: number, absTime: number) => {
        const rs = rendered[sceneIdx];
        const scene = rs.scene;
        // Background: per-scene hue so scenes read as different places.
        const hue = (sceneIdx * 47 + 215) % 360;
        const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
        grad.addColorStop(0, `hsl(${hue}, 45%, 16%)`);
        grad.addColorStop(1, `hsl(${(hue + 40) % 360}, 50%, 8%)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        // CapCut/Flow-STYLE motion (in-browser, free — no proprietary
        // CapCut or Veo engine is embedded): per-scene Ken Burns
        // zoom + pan, scene-intro scale-in, and a speaking bob, so
        // still pictures never sit static. Voice matching: the
        // scene's audio starts exactly at the scene start (src.start
        // at i × 10s above), never late, and the jaw below is driven
        // by that finished audio's envelope, not by imagined speech.
        const motion = sceneMotion(sceneIdx, tInScene, VIDEO_SCENE_SECONDS);
        const envIdx = Math.min(rs.envelope.length - 1, Math.floor(tInScene * FPS * PLAYBACK_RATE * 2));
        const mouth = mouthOpen(rs.envelope[envIdx] || 0);
        // Character area (upper 2/3)
        const cy = CANVAS_H * 0.38;
        if (rs.image) {
          const iw = rs.image.width;
          const ih = rs.image.height;
          const scale = Math.max((CANVAS_W * motion.zoom) / iw, (CANVAS_H * 0.72 * motion.zoom) / ih);
          const dw = iw * scale;
          const dh = ih * scale;
          const sway = !scene.isNarrator && mouth > 0 ? Math.sin(absTime * 6) * 4 : 0;
          ctx.drawImage(rs.image, (CANVAS_W - dw) / 2 + motion.panX * CANVAS_W, cy - dh / 2 + CANVAS_H * 0.05 + motion.panY * CANVAS_H + sway, dw, dh);
          // Visible speaking jaw over the photo's lower face: the
          // envelope-driven mouth, big enough to see on a phone.
          if (!scene.isNarrator && mouth > 0) {
            ctx.fillStyle = 'rgba(40, 8, 14, 0.9)';
            ctx.beginPath();
            ctx.ellipse(CANVAS_W / 2 + motion.panX * CANVAS_W, cy + CANVAS_H * 0.14 + sway, 52, 8 + mouth * 34, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (scene.isNarrator) {
          // Narrator scene: animated gradient + waveform bars, no face.
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          for (let b = 0; b < 24; b++) {
            const h = 20 + Math.abs(Math.sin(absTime * 2 + b * 0.7)) * 60;
            ctx.fillRect(20 + b * 21, cy - h / 2, 12, h);
          }
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 44px sans-serif';
          ctx.textAlign = 'center';
          ctx.direction = 'rtl';
          ctx.fillText('🎙️ راوی', CANVAS_W / 2, cy + 110);
        } else {
          // Speaking character, no photo: the deterministic cartoon
          // face is LARGE and centred (r≈165 on a 540-wide canvas, so
          // it fills the frame, not a small waveform) with a head bob
          // while speaking — this is the part the live test never saw,
          // because the speaking scene had been merged away by the
          // parser. Mouth is envelope-driven only, never phoneme-matched.
          const blink = (absTime % 3.7) < 0.15;
          const bob = mouth > 0 ? Math.sin(absTime * 6) * 5 : 0;
          const faceR = 155 * motion.zoom;
          drawAutoFace(ctx, scene.speaker, mouth, blink, CANVAS_W / 2 + motion.panX * CANVAS_W, cy + bob, faceR);
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 34px sans-serif';
          ctx.textAlign = 'center';
          ctx.direction = 'rtl';
          ctx.fillText(scene.speaker, CANVAS_W / 2, cy + faceR + 50);
        }
        // Subtitles: the EXACT dialogue, wrapped, high contrast, and
        // TIMED to the dialogue itself — visible while the scene's
        // audio plays (audio starts at the scene start, at 1.1×), then
        // a quick 0.5s fade, not for the whole 10s scene. No words
        // are dropped or rewritten to fit.
        const audioSeconds = rs.audio.duration / PLAYBACK_RATE;
        const subAlpha = tInScene < audioSeconds ? 1 : tInScene < audioSeconds + 0.5 ? (audioSeconds + 0.5 - tInScene) / 0.5 : 0;
        if (subAlpha > 0) {
          ctx.save();
          ctx.globalAlpha = subAlpha;
          const lines = wrapLines(scene.text, 26);
          ctx.font = 'bold 30px sans-serif';
          ctx.textAlign = 'center';
          ctx.direction = 'rtl';
          const lineH = 42;
          const boxH = lines.length * lineH + 24;
          const boxY = CANVAS_H - boxH - 30;
          ctx.fillStyle = 'rgba(0,0,0,0.65)';
          ctx.beginPath();
          ctx.roundRect(24, boxY, CANVAS_W - 48, boxH, 14);
          ctx.fill();
          ctx.fillStyle = '#fff';
          lines.forEach((line, li) => {
            ctx.strokeStyle = 'rgba(0,0,0,0.9)';
            ctx.lineWidth = 4;
            ctx.strokeText(line, CANVAS_W / 2, boxY + 34 + li * lineH);
            ctx.fillText(line, CANVAS_W / 2, boxY + 34 + li * lineH);
          });
          ctx.restore();
        }
        // Title card on the first scene's first 2 seconds (snappy
        // 0.5s in, 0.5s out — no slow fade).
        if (sceneIdx === 0 && tInScene < 2) {
          ctx.globalAlpha = Math.min(1, tInScene / 0.5) * (tInScene > 1.5 ? (2 - tInScene) / 0.5 : 1);
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 36px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(title, CANVAS_W / 2, 90);
          ctx.globalAlpha = 1;
        }
        // End card: last scene's last 2 seconds, fading in fast.
        if (sceneIdx === rendered.length - 1 && tInScene > VIDEO_SCENE_SECONDS - 2) {
          const a = Math.min(1, (tInScene - (VIDEO_SCENE_SECONDS - 2)) / 0.5) * 0.85;
          ctx.fillStyle = `rgba(0,0,0,${a})`;
          ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
          ctx.globalAlpha = Math.min(1, (tInScene - (VIDEO_SCENE_SECONDS - 2)) / 0.5);
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 38px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('شکریہ!', CANVAS_W / 2, CANVAS_H / 2 - 10);
          ctx.font = 'bold 28px sans-serif';
          ctx.fillText('سبسکرائب کریں', CANVAS_W / 2, CANVAS_H / 2 + 40);
          ctx.globalAlpha = 1;
        }
      };

      const renderLoop = (startTime: number) => {
        let lastSceneIdx = -1;
        const draw = () => {
          const elapsed = (performance.now() - startTime) / 1000;
          if (elapsed >= totalSeconds) return;
          const sceneIdx = Math.min(rendered.length - 1, Math.floor(elapsed / VIDEO_SCENE_SECONDS));
          const tInScene = elapsed - sceneIdx * VIDEO_SCENE_SECONDS;
          // Crossfade transition: previous scene under the new one.
          if (tInScene < 0.6 && sceneIdx > 0) {
            drawFrame(sceneIdx - 1, VIDEO_SCENE_SECONDS, elapsed);
            ctx.save();
            ctx.globalAlpha = tInScene / 0.6;
            drawFrame(sceneIdx, tInScene, elapsed);
            ctx.restore();
          } else {
            drawFrame(sceneIdx, tInScene, elapsed);
          }
          // Persist job state only on scene change, not every frame.
          if (sceneIdx !== lastSceneIdx) {
            lastSceneIdx = sceneIdx;
            updateJob({ ...jobBase, status: 'rendering', sceneIndex: sceneIdx, stage: 'ویڈیو رینڈر ہو رہی ہے', error: '' });
          }
          requestAnimationFrame(draw);
        };
        draw();
      };

      const stream = canvas.captureStream(FPS);
      const combined = new MediaStream([...stream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
      const mimeCandidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
      const mimeType = mimeCandidates.find((m) => {
        try {
          return MediaRecorder.isTypeSupported(m);
        } catch {
          return false;
        }
      }) || '';
      const recorder = new MediaRecorder(combined, mimeType ? { mimeType } : undefined);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      const donePromise = new Promise<Blob>((resolve, reject) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType || 'video/webm' }));
        recorder.onerror = () => reject(new Error('recorder-failed'));
      });
      const startTime = performance.now();
      recorder.start(1000);
      renderLoop(startTime);
      setTimeout(() => {
        try {
          if (recorder.state !== 'inactive') recorder.stop();
        } catch {
          // already stopped
        }
      }, totalSeconds * 1000 + 400);
      const blob = await donePromise;
      try {
        bed.stop();
      } catch {
        // ignore
      }
      await audioCtx.close();
      if (runRef.current !== runId) return;
      if (!blob || blob.size < 1000) throw new Error('empty-video');
      const url = URL.createObjectURL(blob);
      setVideoUrl(url);
      setVideoFormat(mimeType || 'video/webm');
      updateJob({ ...jobBase, status: 'done', sceneIndex: scenes.length - 1, stage: 'تیار', error: '' });
      setProgress('✅ ویڈیو تیار ہے — نیچے سے ڈاؤن لوڈ کر لیں۔');
    } catch (e) {
      const msg = e instanceof Error && e.message === 'empty-video'
        ? 'ویڈیو خالی بنی — ریکارڈنگ میں مسئلہ ہوا، کوئی لنک نہیں دیا جا رہا۔'
        : 'ویڈیو رینڈر نہیں ہو سکی — دوبارہ کوشش کریں۔ کوئی لنک نہیں دیا جا رہا۔';
      updateJob({ ...jobBase, status: 'failed', sceneIndex: 0, stage: 'ناکام', error: msg });
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  const content = (
    <>
      <div className="tool-small-note" style={{ textAlign: 'right' }}>
        🎬 <b>ایک پرامپٹ، پوری ویڈیو — خودکار:</b> پرامپٹ یا مکالمہ لکھیں، «ویڈیو بنائیں» دبائیں، باقی سب
        خود ہوگا — سین، کردار، آواز، سب ٹائٹل، ٹرانزیشن، ڈاؤن لوڈ۔ بیچ میں کوئی سوال نہیں پوچھا جائے گا۔
      </div>
      <div className="tool-small-note" style={{ textAlign: 'right' }}>
        ⚠️ <b>سچائی:</b> ہونٹ آڈیو کی طاقت سے ہلتے ہیں (منہ کھلتا/بند ہوتا ہے) — یہ ہر حرف کی شکل والا
        فونیم لپ سنک <b>نہیں</b> ہے، اور کوئی مفت ٹول اس وقت اردو جانوروں کے لیے وہ نہیں دیتا۔ ایکسپورٹ WebM
        ہے، MP4 نہیں۔ فائل صرف اس سیشن میں رہتی ہے — بنتے ہی ڈاؤن لوڈ کر لیں۔ رفتار: آواز تھوڑی تیز مگر
        صاف ہے، اور ریکارڈنگ خود ریئل ٹائم ہے — 60 سیکنڈ کی ویڈیو ریکارڈ ہونے میں تقریباً 60 سیکنڈ لگیں گے۔
      </div>
      <div className="tool-small-note" style={{ textAlign: 'right' }}>
        🎬 <b>ایڈیٹنگ (CapCut/Flow انداز، مفت، اسی ایپ میں):</b> ہر سین میں زوم + پین، سین کی شروعاتی حرکت،
        بولتے کردار کا ہلنا، 0.6 سیکنڈ کراس فیڈ، ٹائٹل کارڈ، اینڈ کارڈ، مکالمے سے ملے ہوئے سب ٹائٹل، اور
        مکالمے کے نیچے ہلکی بیک گراؤنڈ آواز۔ اصل CapCut یا Google Flow/Veo انجن اس میں نہیں ہے — وہ
        بند، پیسے والے انجن ہیں — یہ ان کے انداز کی مفت، براؤزر میں چلنے والی ایڈیٹنگ ہے۔
      </div>

      <div className="tool-label">پرامپٹ / کہانی / مکالمہ (ہر لائن: «نام: مکالمہ» — بغیر نام کی لائن راوی بن جاتی ہے):</div>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        className="tool-textarea"
        dir="auto"
        rows={5}
        placeholder={'مثلاً:\nشاہ: یاد رکھو! اس جنگل میں میری اجازت کے بغیر کوئی فیصلہ نہیں ہوگا!\nزال: بادشاہ سلامت! آپ کی حکومت کا سورج اب ڈوبنے والا ہے!'}
        data-testid="input-video-maker-prompt"
      />
      {parsed.length > 0 && (
        <div className="tool-small-note" data-testid="text-video-maker-scenes">
          {parsed.length} سین × {VIDEO_SCENE_SECONDS} سیکنڈ = {parsed.length * VIDEO_SCENE_SECONDS} سیکنڈ، عمودی 9:16
          {parsed.length >= 6 ? ' (زیادہ سے زیادہ 6 سین)' : ''}
        </div>
      )}

      {characters.length > 0 && (
        <div>
          <div className="tool-label">کردار لاک (خودکار: آواز + رنگ ہر بار ایک جیسے رہیں گے — تصویر دیں گے تو وہی لاک ہو جائے گی):</div>
          {characters.map((name) => {
            const lock = locks.find((c) => c.name === name);
            return (
              <div key={name} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '6px 0' }}>
                <strong>{name}</strong>
                <select
                  value={lock?.voice ?? autoVoiceFor(name)}
                  onChange={(e) => setVoice(name, e.target.value as 'male' | 'female')}
                  className="tool-select"
                  aria-label={`${name} کی آواز`}
                >
                  <option value="male">مرد آواز</option>
                  <option value="female">عورت آواز</option>
                </select>
                <label className="tool-action-button" style={{ cursor: 'pointer' }}>
                  {lock?.imageDataUrl ? '🖼️ تصویر بدلیں' : '🖼️ تصویر لگائیں (اختیاری)'}
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onImageFile(name, f);
                      e.target.value = '';
                    }}
                  />
                </label>
                {lock?.imageDataUrl && <span className="tool-small-note">✅ تصویر لاک ہے</span>}
                {!lock?.imageDataUrl && <span className="tool-small-note">بغیر تصویر: خودکار کارٹون چہرہ بنے گا</span>}
              </div>
            );
          })}
          <div className="tool-label">
            راوی کی آواز:
            <select
              value={locks.find((c) => c.name === NARRATOR_NAME)?.voice ?? 'male'}
              onChange={(e) => setVoice(NARRATOR_NAME, e.target.value as 'male' | 'female')}
              className="tool-select"
              style={{ marginInlineStart: 8 }}
            >
              <option value="male">مرد آواز</option>
              <option value="female">عورت آواز</option>
            </select>
          </div>
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        <button
          type="button"
          className="tool-action-button"
          onClick={() => {
            setPreviewScenes(parsed);
            void build();
          }}
          disabled={busy || parsed.length === 0}
          data-testid="button-video-make"
        >
          {busy ? <><Loader2 size={15} className="spin" /> بن رہی ہے…</> : '🎬 ویڈیو بنائیں — خودکار'}
        </button>
        <button
          type="button"
          className="tool-action-button"
          onClick={() => {
            runRef.current++;
            setBusy(false);
            setProgress('');
          }}
          disabled={!busy}
        >
          ✕ روکیں
        </button>
      </div>

      {busy && progress && (
        <div className="tool-small-note" data-testid="text-video-maker-status">⏳ {progress}</div>
      )}
      {job && (
        <div className="tool-small-note" data-testid="text-video-maker-job">
          آخری کام کی اصل حالت: {videoMakerStatusText(job)}
        </div>
      )}
      {error && <div className="tool-error" data-testid="text-video-maker-error">{error}</div>}

      {videoUrl && (
        <div data-testid="video-maker-result">
          <div className="tool-label">✅ آپ کی ویڈیو تیار ہے — یہی اصل ڈاؤن لوڈ لنک ہے:</div>
          <video src={videoUrl} controls style={{ width: '100%', maxWidth: 320, aspectRatio: '9 / 16', background: '#000' }} data-testid="video-maker-preview" />
          <div style={{ marginTop: 8 }}>
            <a href={videoUrl} download={`unique-ai-video-${Date.now()}.webm`} className="tool-action-button" data-testid="button-video-download">
              📥 ویڈیو ڈاؤن لوڈ کریں ({videoFormat || 'video/webm'})
            </a>
          </div>
          <div className="tool-small-note">فارمیٹ WebM ہے (MP4 نہیں) — زیادہ تر پلیئر اور CapCut اسے کھول لیتے ہیں۔ فائل اس سیشن میں ہی رہتی ہے، ابھی ڈاؤن لوڈ کر لیں۔</div>
        </div>
      )}
      {previewScenes && !videoUrl && !busy && (
        <div className="tool-small-note">سین کی فہرست: {previewScenes.map((s) => `${s.speaker}: ${s.text.slice(0, 30)}…`).join(' | ')}</div>
      )}
    </>
  );

  if (embedded) {
    return <div data-testid="panel-video-maker">{content}</div>;
  }
  return (
    <div className="tool-results" dir="rtl" data-testid="panel-video-maker" role="region" aria-label="ویڈیو میکر">
      <div className="tool-results-head">
        <span className="tool-results-title">🎬 ویڈیو میکر — بولتی ہوئی ویڈیو</span>
        <button type="button" className="tool-results-close" onClick={onClose} aria-label="بند کریں">
          <X size={16} />
        </button>
      </div>
      <div className="tool-results-body">{content}</div>
    </div>
  );
}

export { VIDEO_JOB_KEY };
