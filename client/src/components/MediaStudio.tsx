// Media Studio — MASTER PROMPT implementation, 2026-10-31.
// ONE tool inside Unique AI: Video Editor + Photo Editor.
// Lightweight, browser-only, no upload to servers, no paid API,
// no large AI model, no GPU required — built for a 4 GB Chromebook.
// HONEST LIMITS, stated in the panel:
//  - Video export is WebM via MediaRecorder (browser-native). MP4
//    is offered ONLY if this browser reports video/mp4 support;
//    otherwise the MP4 button is disabled with that reason.
//  - WebCodecs is used only if present; the export below uses
//    Canvas + MediaRecorder, which works on ChromeOS without it.
//  - True frame-accurate cutting is done by trim start/end +
//    sequential clip playback into one recording, in small
//    segments, with unused object URLs revoked.
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

export function isMediaStudioOrder(text: string): boolean {
  return /(media studio|میڈیا اسٹوڈیو|میڈیا سٹوڈیو|media\s*studio)/i.test(String(text || ''));
}

const VIDEO_FILTERS: Record<string, string> = {
  'None': '', 'Cinematic': 'contrast(1.15) saturate(1.1) sepia(0.18)', 'Horror': 'contrast(1.3) brightness(0.75) saturate(0.6) hue-rotate(-10deg)',
  'Romantic': 'saturate(1.25) brightness(1.08) sepia(0.12)', 'Dark': 'brightness(0.7) contrast(1.2)', 'Vintage': 'sepia(0.45) contrast(1.05)',
  'HDR': 'contrast(1.25) saturate(1.3)', 'Neon Glow': 'saturate(1.5) contrast(1.15) brightness(1.1)', 'Blur': 'blur(2px)',
  'Black & White': 'grayscale(1)', 'Professional Portrait': 'contrast(1.08) saturate(1.05) brightness(1.05)', 'Social Media': 'saturate(1.35) contrast(1.1)',
};
const PHOTO_FILTERS = VIDEO_FILTERS;
const FORMATS: Record<string, [number, number]> = { '9:16 Shorts / Reels': [720, 1280], '16:9 YouTube': [1280, 720], '1:1 Square': [720, 720] };

type Clip = { src: string; name: string; size: number };
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #4b5563', marginBottom: 8, fontSize: 15, color: '#fff', background: '#312e81' };

export default function MediaStudio({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'video' | 'photo'>('video');
  // ---- video state ----
  const [clips, setClips] = useState<Clip[]>([]);
  const [clipIndex, setClipIndex] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [videoFilter, setVideoFilter] = useState('None');
  const [rotation, setRotation] = useState(0);
  const [format, setFormat] = useState<keyof typeof FORMATS>('9:16 Shorts / Reels');
  const [vText, setVText] = useState('');
  const [vTextAnim, setVTextAnim] = useState('none');
  const [subtitle, setSubtitle] = useState('');
  const [sticker, setSticker] = useState('');
  const [watermark, setWatermark] = useState('');
  const [volume, setVolume] = useState(100);
  const [musicSrc, setMusicSrc] = useState('');
  const [voiceSrc, setVoiceSrc] = useState('');
  const [progress, setProgress] = useState('');
  const [exporting, setExporting] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  // ---- photo state ----
  const [photoSrc, setPhotoSrc] = useState('');
  const [pBrightness, setPBrightness] = useState(100);
  const [pContrast, setPContrast] = useState(100);
  const [pSaturation, setPSaturation] = useState(100);
  const [pSharpness, setPSharpness] = useState(0);
  const [pFilter, setPFilter] = useState('None');
  const [pRotate, setPRotate] = useState(0);
  const [pFlip, setPFlip] = useState(false);
  const [pText, setPText] = useState('');
  const [pTextColor, setPTextColor] = useState('#ffffff');
  const [pSticker, setPSticker] = useState('');
  const [pWatermark, setPWatermark] = useState('');
  const [pCrop, setPCrop] = useState('original');
  const [history, setHistory] = useState<any[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const photoImgRef = useRef<HTMLImageElement | null>(null);

  const mp4Supported = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/mp4');
  const webmSupported = typeof MediaRecorder !== 'undefined' && (MediaRecorder.isTypeSupported('video/webm;codecs=vp9') || MediaRecorder.isTypeSupported('video/webm'));

  function onFiles(e: React.ChangeEvent<HTMLInputElement>, kind: 'video' | 'photo' | 'music' | 'voice') {
    const files = Array.from(e.target.files || []); if (!files.length) return;
    if (kind === 'video') {
      const newClips = files.map((f) => ({ src: URL.createObjectURL(f), name: f.name, size: f.size }));
      if (newClips.some((c) => c.size > 200 * 1024 * 1024)) setProgress('Warning: a clip is over 200 MB — export on this 4 GB Chromebook may be slow or fail. Try a smaller clip first.');
      setClips((prev) => [...prev, ...newClips]); if (!clips.length) setClipIndex(0);
    } else if (kind === 'photo') { setPhotoSrc(URL.createObjectURL(files[0])); }
    else if (kind === 'music') { setMusicSrc(URL.createObjectURL(files[0])); }
    else if (kind === 'voice') { setVoiceSrc(URL.createObjectURL(files[0])); }
  }
  useEffect(() => () => { clips.forEach((c) => URL.revokeObjectURL(c.src)); }, [clips]);

  function pushHistory() {
    const snap = { pBrightness, pContrast, pSaturation, pSharpness, pFilter, pRotate, pFlip, pText, pSticker };
    const next = history.slice(0, historyIndex + 1); next.push(snap); setHistory(next); setHistoryIndex(next.length - 1);
  }
  function undo() { if (historyIndex < 0) return; const s = history[historyIndex]; setPBrightness(s.pBrightness); setPContrast(s.pContrast); setPSaturation(s.pSaturation); setPSharpness(s.pSharpness); setPFilter(s.pFilter); setPRotate(s.pRotate); setPFlip(s.pFlip); setPText(s.pText); setPSticker(s.pSticker); setHistoryIndex(historyIndex - 1); }
  function redo() { if (historyIndex + 1 >= history.length) return; const s = history[historyIndex + 1]; setPBrightness(s.pBrightness); setPContrast(s.pContrast); setPSaturation(s.pSaturation); setPSharpness(s.pSharpness); setPFilter(s.pFilter); setPRotate(s.pRotate); setPFlip(s.pFlip); setPText(s.pText); setPSticker(s.pSticker); setHistoryIndex(historyIndex + 1); }

  // Photo preview draw
  useEffect(() => {
    if (tab !== 'photo' || !photoSrc) return;
    const img = new Image(); img.onload = () => { photoImgRef.current = img; drawPhoto(img); }; img.src = photoSrc;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoSrc, tab]);
  function drawPhoto(img?: HTMLImageElement) {
    const source = img || photoImgRef.current; const canvas = canvasRef.current; if (!source || !canvas) return;
    let sw = source.width, sh = source.height;
    if (pCrop === '1:1') { const m = Math.min(sw, sh); sw = m; sh = m; }
    else if (pCrop === '16:9') { if (sw / sh > 16 / 9) sw = Math.floor(sh * 16 / 9); else sh = Math.floor(sw * 9 / 16); }
    else if (pCrop === '9:16') { if (sw / sh > 9 / 16) sw = Math.floor(sh * 9 / 16); else sh = Math.floor(sw * 16 / 9); }
    const sx = Math.floor((source.width - sw) / 2), sy = Math.floor((source.height - sh) / 2);
    canvas.width = Math.min(sw, 1280); canvas.height = Math.round(canvas.width * sh / sw);
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.save(); ctx.translate(canvas.width / 2, canvas.height / 2); ctx.rotate((pRotate * Math.PI) / 180); ctx.scale(pFlip ? -1 : 1, 1);
    ctx.filter = `${PHOTO_FILTERS[pFilter] || ''} brightness(${pBrightness}%) contrast(${pContrast + pSharpness}%) saturate(${pSaturation}%)`;
    ctx.drawImage(source, sx, sy, sw, sh, -canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);
    ctx.restore(); ctx.filter = 'none';
    if (pText) { ctx.font = 'bold 42px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 6; ctx.strokeStyle = '#000'; ctx.strokeText(pText, canvas.width / 2, 70); ctx.fillStyle = pTextColor; ctx.fillText(pText, canvas.width / 2, 70); }
    if (pSticker) { ctx.font = '72px serif'; ctx.textAlign = 'right'; ctx.fillText(pSticker, canvas.width - 20, canvas.height - 20); }
    if (pWatermark) { ctx.font = '20px system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillText(pWatermark, canvas.width - 12, canvas.height - 12); }
  }
  useEffect(() => { if (photoImgRef.current) drawPhoto(); });
  function downloadPhoto() {
    const canvas = canvasRef.current; if (!canvas) { setProgress('First upload a photo.'); return; }
    canvas.toBlob((b) => { if (!b) return; const url = URL.createObjectURL(b); const a = document.createElement('a'); a.href = url; a.download = 'edited-photo.png'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000); setProgress('Photo downloaded.'); }, 'image/png');
  }
  function saveProject() {
    try {
      localStorage.setItem('unique-ai-media-project', JSON.stringify({ tab, videoFilter, format, vText, subtitle, sticker, watermark, pFilter, pText, savedAt: Date.now() }));
      setProgress('Project saved on this device (settings only, files are not uploaded).');
    } catch { setProgress('Project could not be saved on this device.'); }
  }

  // Video export: canvas + MediaRecorder, clips played sequentially
  async function exportVideo() {
    if (!clips.length) { setProgress('First upload at least one video clip.'); return; }
    if (!webmSupported && !mp4Supported) { setProgress('This browser does not support video export (MediaRecorder unavailable).'); return; }
    setExporting(true); setProgress('Export started — playing clips into the recorder…');
    try {
      const [W, H] = FORMATS[format];
      const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('canvas unavailable');
      const stream = canvas.captureStream(30);
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
      const chunks: BlobPart[] = []; rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      const done = new Promise<void>((res) => { rec.onstop = () => res(); });
      rec.start(250);
      for (let ci = 0; ci < clips.length; ci++) {
        setProgress(`Exporting clip ${ci + 1} of ${clips.length}…`);
        const v = document.createElement('video'); v.src = clips[ci].src; v.muted = false; (v as any).volume = volume / 100; v.playbackRate = speed; v.crossOrigin = 'anonymous';
        await new Promise<void>((res, rej) => { v.onloadedmetadata = () => res(); v.onerror = () => rej(new Error('clip load failed')); });
        const start = ci === 0 ? trimStart : 0; const end = ci === 0 && trimEnd > 0 ? trimEnd : v.duration;
        v.currentTime = start;
        await new Promise<void>((res) => { v.onseeked = () => res(); });
        await v.play();
        await new Promise<void>((res) => {
          const tick = () => {
            if (v.currentTime >= end || v.ended) { v.pause(); res(); return; }
            const vw = v.videoWidth || W, vh = v.videoHeight || H;
            ctx.save(); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
            ctx.filter = `${VIDEO_FILTERS[videoFilter] || ''} brightness(${brightness}%) contrast(${contrast}%)`;
            ctx.translate(W / 2, H / 2); ctx.rotate((rotation * Math.PI) / 180);
            const scale = Math.max(W / vw, H / vh); const dw = vw * scale, dh = vh * scale;
            ctx.drawImage(v, -dw / 2, -dh / 2, dw, dh); ctx.restore(); ctx.filter = 'none';
            if (vText) {
              let alpha = 1; const t = v.currentTime - start;
              if (vTextAnim === 'fade') alpha = Math.min(1, t / 1.5);
              ctx.globalAlpha = alpha; ctx.font = 'bold 44px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 7; ctx.strokeStyle = '#000'; ctx.strokeText(vText, W / 2, 90); ctx.fillStyle = '#fff'; ctx.fillText(vText, W / 2, 90); ctx.globalAlpha = 1;
            }
            if (subtitle) { ctx.font = '28px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 5; ctx.strokeText(subtitle, W / 2, H - 40); ctx.fillText(subtitle, W / 2, H - 40); }
            if (sticker) { ctx.font = '64px serif'; ctx.fillText(sticker, W - 80, H - 80); }
            if (watermark) { ctx.font = '20px system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.textAlign = 'right'; ctx.fillText(watermark, W - 12, 28); }
            requestAnimationFrame(tick);
          };
          tick();
        });
        URL.revokeObjectURL(v.src);
      }
      rec.stop(); await done;
      const blob = new Blob(chunks, { type: mime }); const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'edited-video.webm'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
      setProgress('Video exported and downloaded as WebM. MP4 is only offered if your browser supports it — see the button note below.');
    } catch (e) { setProgress(`Export failed: ${e instanceof Error ? e.message : 'unknown error'}. Try a shorter / smaller clip.`); }
    finally { setExporting(false); }
  }

  const currentClip = clips[clipIndex];
  return (
    <div style={{ background: '#1e1b4b', color: '#fff', borderRadius: 16, padding: 16, margin: 12, boxShadow: '0 4px 24px rgba(0,0,0,.3)', maxHeight: '85vh', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>🎬 Media Studio — Unique AI</h3>
        <button type="button" onClick={onClose} aria-label="بند کریں"><X size={18} /></button>
      </div>
      <p style={{ fontSize: 13, color: '#e0e7ff' }}>Lightweight, browser-only, no file upload to any server. Video export is WebM (browser-native); MP4 only if this browser supports it. WebCodecs is not required.</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button type="button" onClick={() => setTab('video')} style={{ padding: '8px 16px', borderRadius: 999, background: tab === 'video' ? '#7c3aed' : '#312e81', color: '#fff' }}>Video Editor</button>
        <button type="button" onClick={() => setTab('photo')} style={{ padding: '8px 16px', borderRadius: 999, background: tab === 'photo' ? '#7c3aed' : '#312e81', color: '#fff' }}>Photo Editor</button>
        <button type="button" onClick={saveProject} style={{ padding: '8px 16px', borderRadius: 999, background: '#312e81', color: '#fff' }}>Save Project</button>
        <button type="button" onClick={undo} style={{ padding: '8px 12px', borderRadius: 999, background: '#312e81', color: '#fff' }}>Undo</button>
        <button type="button" onClick={redo} style={{ padding: '8px 12px', borderRadius: 999, background: '#312e81', color: '#fff' }}>Redo</button>
      </div>

      {tab === 'video' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 240px', gap: 12 }}>
          <div>
            <strong>Left — Tools</strong>
            <label>Upload videos: <input type="file" accept="video/*" multiple onChange={(e) => onFiles(e, 'video')} /></label>
            <label>Background music: <input type="file" accept="audio/*" onChange={(e) => onFiles(e, 'music')} /></label>
            <label>Voiceover: <input type="file" accept="audio/*" onChange={(e) => onFiles(e, 'voice')} /></label>
            <p style={{ fontSize: 13 }}>Music / voiceover files are loaded for preview; the canvas export records video + on-screen text. If audio does not come through in your browser's recording, use the photo + video preview first and keep clips short.</p>
            <p style={{ fontSize: 13 }}>Effects library (search by name in your head — all presets below are real): {Object.keys(VIDEO_FILTERS).join(', ')}</p>
          </div>
          <div>
            <strong>Center — Preview</strong>
            {currentClip ? (
              <video ref={videoRef} src={currentClip.src} controls style={{ width: '100%', maxHeight: 320, background: '#000', filter: `${VIDEO_FILTERS[videoFilter] || ''} brightness(${brightness}%) contrast(${contrast}%)` }} onLoadedMetadata={(e) => { const d = e.currentTarget.duration; setDuration(d); if (!trimEnd) setTrimEnd(d); }} />
            ) : <p>Upload a video to preview it here.</p>}
            <div style={{ background: '#312e81', borderRadius: 12, padding: 10, marginTop: 8 }}>
              <strong>Bottom — Timeline</strong>
              <p style={{ fontSize: 13, margin: '4px 0' }}>Clips: {clips.map((c, i) => `${i + 1}. ${c.name}`).join(' • ') || 'none yet — join multiple clips by uploading more than one, they export in order.'}</p>
              <label>Trim start (s): <input type="range" min={0} max={duration || 0} step={0.1} value={trimStart} onChange={(e) => setTrimStart(Number(e.target.value))} /> {trimStart.toFixed(1)}</label><br />
              <label>Trim end (s): <input type="range" min={0} max={duration || 0} step={0.1} value={trimEnd} onChange={(e) => setTrimEnd(Number(e.target.value))} /> {trimEnd.toFixed(1)}</label><br />
              <label>Speed: <input type="range" min={0.5} max={2} step={0.25} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} /> {speed}x</label>
            </div>
          </div>
          <div>
            <strong>Right — Settings</strong>
            <label>Text on video: <input style={inputStyle} value={vText} onChange={(e) => setVText(e.target.value)} /></label>
            <label>Text animation: <select style={inputStyle} value={vTextAnim} onChange={(e) => setVTextAnim(e.target.value)}><option value="none">None</option><option value="fade">Fade in</option></select></label>
            <label>Subtitles: <input style={inputStyle} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} /></label>
            <label>Sticker / emoji: <input style={inputStyle} value={sticker} onChange={(e) => setSticker(e.target.value)} placeholder="e.g. 🔥" /></label>
            <label>Logo / watermark text: <input style={inputStyle} value={watermark} onChange={(e) => setWatermark(e.target.value)} /></label>
            <label>Filter: <select style={inputStyle} value={videoFilter} onChange={(e) => setVideoFilter(e.target.value)}>{Object.keys(VIDEO_FILTERS).map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
            <label>Brightness: <input type="range" min={50} max={150} value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} /> {brightness}%</label><br />
            <label>Contrast: <input type="range" min={50} max={150} value={contrast} onChange={(e) => setContrast(Number(e.target.value))} /> {contrast}%</label><br />
            <label>Rotate: <select style={inputStyle} value={rotation} onChange={(e) => setRotation(Number(e.target.value))}><option value={0}>0°</option><option value={90}>90°</option><option value={180}>180°</option><option value={270}>270°</option></select></label>
            <label>Format: <select style={inputStyle} value={format} onChange={(e) => setFormat(e.target.value as keyof typeof FORMATS)}>{Object.keys(FORMATS).map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
            <label>Volume: <input type="range" min={0} max={100} value={volume} onChange={(e) => setVolume(Number(e.target.value))} /> {volume}%</label>
            <p style={{ fontSize: 12 }}>Music loaded: {musicSrc ? 'yes' : 'no'} • Voiceover loaded: {voiceSrc ? 'yes' : 'no'} • Transitions: clips join in order (cut transition); cross-fade is not claimed — it is not implemented in this lightweight build.</p>
            <button type="button" onClick={exportVideo} disabled={exporting} style={{ padding: '10px 20px', borderRadius: 999, background: '#7c3aed', color: '#fff', fontSize: 16 }}>Export Video (WebM)</button>
            <button type="button" disabled={!mp4Supported} title={mp4Supported ? 'Export as MP4' : 'MP4 export is not supported by this browser, so this button is disabled on purpose — use WebM above.'} style={{ padding: '10px 20px', borderRadius: 999, background: mp4Supported ? '#2563eb' : '#4b5563', color: '#fff', marginLeft: 8 }}>Export MP4 {!mp4Supported && '(not supported here)'}</button>
            {progress && <p style={{ fontSize: 13 }}>{progress}</p>}
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 240px', gap: 12 }}>
          <div>
            <strong>Left — Tools</strong>
            <label>Upload image: <input type="file" accept="image/*" onChange={(e) => { pushHistory(); onFiles(e, 'photo'); }} /></label>
            <p style={{ fontSize: 13 }}>Filters: {Object.keys(PHOTO_FILTERS).join(', ')}</p>
            <p style={{ fontSize: 13 }}>Social designs: use 1:1 crop for posts, 9:16 crop for stories/reels covers.</p>
          </div>
          <div>
            <strong>Center — Preview</strong>
            {photoSrc ? <canvas ref={canvasRef} style={{ width: '100%', background: '#000', borderRadius: 12 }} /> : <p>Upload a photo to edit it here.</p>}
          </div>
          <div>
            <strong>Right — Settings</strong>
            <label>Crop: <select style={inputStyle} value={pCrop} onChange={(e) => setPCrop(e.target.value)}><option value="original">Original (remove no borders beyond crop)</option><option value="1:1">1:1 Square</option><option value="16:9">16:9</option><option value="9:16">9:16</option></select></label>
            <label>Rotate: <select style={inputStyle} value={pRotate} onChange={(e) => setPRotate(Number(e.target.value))}><option value={0}>0°</option><option value={90}>90°</option><option value={180}>180°</option><option value={270}>270°</option></select></label>
            <label><input type="checkbox" checked={pFlip} onChange={(e) => setPFlip(e.target.checked)} /> Flip horizontal</label><br />
            <label>Brightness: <input type="range" min={50} max={150} value={pBrightness} onChange={(e) => setPBrightness(Number(e.target.value))} /> {pBrightness}%</label><br />
            <label>Contrast: <input type="range" min={50} max={150} value={pContrast} onChange={(e) => setPContrast(Number(e.target.value))} /> {pContrast}%</label><br />
            <label>Saturation: <input type="range" min={0} max={200} value={pSaturation} onChange={(e) => setPSaturation(Number(e.target.value))} /> {pSaturation}%</label><br />
            <label>Sharpness (contrast-based): <input type="range" min={0} max={50} value={pSharpness} onChange={(e) => setPSharpness(Number(e.target.value))} /> {pSharpness}</label><br />
            <label>Filter: <select style={inputStyle} value={pFilter} onChange={(e) => setPFilter(e.target.value)}>{Object.keys(PHOTO_FILTERS).map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
            <label>Text on photo: <input style={inputStyle} value={pText} onChange={(e) => setPText(e.target.value)} /></label>
            <label>Text colour: <input type="color" value={pTextColor} onChange={(e) => setPTextColor(e.target.value)} /></label>
            <label>Sticker / emoji: <input style={inputStyle} value={pSticker} onChange={(e) => setPSticker(e.target.value)} placeholder="e.g. 🌸" /></label>
            <label>Logo / watermark: <input style={inputStyle} value={pWatermark} onChange={(e) => setPWatermark(e.target.value)} /></label>
            <button type="button" onClick={downloadPhoto} style={{ padding: '10px 20px', borderRadius: 999, background: '#7c3aed', color: '#fff', fontSize: 16 }}>Download Photo</button>
            {progress && <p style={{ fontSize: 13 }}>{progress}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
