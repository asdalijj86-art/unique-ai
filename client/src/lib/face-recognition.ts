/**
 * face-recognition.ts — the camera side of Face Lock (Phase 2).
 *
 * Real face recognition, entirely on this device: @vladmandic/face-api
 * (lazy dynamic import — it is NOT in the main bundle) with the
 * model weights vendored in client/public/models/face-api (loaded
 * from /models/face-api at runtime — no CDN, no network needed after
 * install). One enrolled face → one 128-d descriptor; unlock compares
 * a fresh descriptor against it (see lib/face-lock).
 *
 * The video element stays HIDDEN (the camera preview rule: his
 * picture never shows on screen) — the caller mounts an invisible
 * <video> and passes it here. No photo is ever saved: only the
 * descriptor numbers leave this module.
 */

import { FACE_DESCRIPTOR_LEN } from './face-lock';

const MODELS_URL = '/models/face-api';

type FaceApi = typeof import('@vladmandic/face-api');

let faceApiPromise: Promise<FaceApi> | null = null;
let modelsLoaded = false;

export function faceModelsLoaded(): boolean {
  return modelsLoaded;
}

/** Load face-api + the three nets (once). Throws with a plain Urdu
 *  message when the models cannot load (e.g. no local files). */
export async function loadFaceModels(): Promise<FaceApi> {
  if (!faceApiPromise) {
    faceApiPromise = (async () => {
      const api: FaceApi = await import('@vladmandic/face-api');
      await Promise.all([
        api.nets.tinyFaceDetector.loadFromUri(MODELS_URL),
        api.nets.faceLandmark68Net.loadFromUri(MODELS_URL),
        api.nets.faceRecognitionNet.loadFromUri(MODELS_URL),
      ]);
      modelsLoaded = true;
      return api;
    })().catch((e) => {
      faceApiPromise = null;
      throw e instanceof Error ? e : new Error('چہرہ پہچاننے والا ماڈل لوڈ نہیں ہوا۔');
    });
  }
  return faceApiPromise;
}

export type FaceCaptureResult =
  | { status: 'ok'; descriptor: number[] }
  | { status: 'no-face' }
  | { status: 'many-faces'; count: number }
  | { status: 'error'; message: string };

/**
 * Capture ONE face descriptor from a live (hidden) video element.
 * Exactly one face must be in frame — zero faces or several faces
 * are reported plainly, never guessed.
 */
export async function captureFaceDescriptor(video: HTMLVideoElement): Promise<FaceCaptureResult> {
  try {
    const api = await loadFaceModels();
    if (!video.videoWidth || !video.videoHeight) {
      return { status: 'error', message: 'کیمرہ ابھی تیار نہیں — تھوڑا رک کر دوبارہ کوشش کریں۔' };
    }
    const detections = await api
      .detectAllFaces(video, new api.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
      .withFaceLandmarks()
      .withFaceDescriptors();
    if (detections.length === 0) return { status: 'no-face' };
    if (detections.length > 1) return { status: 'many-faces', count: detections.length };
    const descriptor = Array.from(detections[0].descriptor as Float32Array);
    if (descriptor.length !== FACE_DESCRIPTOR_LEN) {
      return { status: 'error', message: 'چہرے کی پیمائش مکمل نہیں ہوئی۔' };
    }
    return { status: 'ok', descriptor };
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : 'چہرہ چیک نہیں ہو سکا۔' };
  }
}

/** Open the camera as an invisible stream (the caller owns the
 *  <video> element; this only supplies the stream). */
export async function openHiddenCamera(video: HTMLVideoElement): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false,
  });
  video.srcObject = stream;
  await video.play().catch(() => { /* play blocked — caller retries */ });
  return stream;
}

export function closeCameraStream(stream: MediaStream | null): void {
  try {
    stream?.getTracks().forEach((t) => t.stop());
  } catch { /* already stopped */ }
}
