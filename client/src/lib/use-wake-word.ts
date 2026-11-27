/**
 * use-wake-word.ts — the live "Hey Unique" listener (user order
 * 2026-11-28). Owns ONE SpeechRecognition, continuous, restarting
 * itself after each end — exactly like the app's continuous-voice
 * listener, but it ONLY listens for the wake phrase and never sends
 * anything to the chat on its own.
 *
 * Rules (hard):
 *  - Runs ONLY while `enabled` and NOT `paused` (paused while the
 *    user is recording, continuous voice is on, she is speaking, or
 *    a turn is in flight — the wake listener never fights the main
 *    mic for the same audio).
 *  - On a wake phrase: stops its own recogniser FIRST (so the mic
 *    is free), reports status 'heard', then calls onWake. It stays
 *    quiet for a cooldown afterwards so the greeting/listening that
 *    follows is not re-triggered by its own echo.
 *  - Chrome needs a user gesture before the mic starts: until the
 *    first pointer/key gesture (or an explicit start() call from a
 *    click, e.g. the indicator or the Settings toggle), status is
 *    'waiting-gesture' and nothing is faked as listening.
 *  - No SpeechRecognition → status 'unsupported' with the reason;
 *    mic denied → 'error' with the reason. Both are shown honestly.
 *  - When the app is FULLY CLOSED nothing here can run — that limit
 *    is stated in wake-word.ts and in the UI, never claimed away.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getWakeWordSupport, isWakeWord, wakeWordLang } from './wake-word';

export type WakeWordStatus =
  | 'unsupported'
  | 'off'
  | 'waiting-gesture'
  | 'listening'
  | 'heard'
  | 'error';

export type WakeWordState = {
  status: WakeWordStatus;
  /** Plain reason when status is 'unsupported' | 'error' | 'off'. */
  reason: string;
  /** True while the browser reports SpeechRecognition exists. */
  supported: boolean;
  /** True while the recogniser is actually running. */
  listening: boolean;
  /** When the last wake phrase was heard (ms epoch), or null. */
  heardAt: number | null;
  /** The transcript that woke her (for the flash line). */
  heardText: string;
};

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { results: ArrayLike<{ 0: { transcript: string; isFinal: boolean } }> }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: new () => BrowserSpeechRecognition;
  webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
};

/** Quiet gap after a wake before the listener may restart. */
const HEARD_COOLDOWN_MS = 4000;

export function useWakeWord({
  enabled,
  paused,
  onWake,
}: {
  enabled: boolean;
  paused: boolean;
  onWake: (heardText: string) => void;
}): WakeWordState & { start: () => void; stop: () => void } {
  const support = getWakeWordSupport();
  const [status, setStatus] = useState<WakeWordStatus>(() =>
    !support.supported ? 'unsupported' : enabled ? 'waiting-gesture' : 'off',
  );
  const [reason, setReason] = useState<string>(() =>
    !support.supported ? (support as { reason: string }).reason : enabled ? 'waiting-gesture' : 'off',
  );
  const [heardAt, setHeardAt] = useState<number | null>(null);
  const [heardText, setHeardText] = useState('');

  const recRef = useRef<BrowserSpeechRecognition | null>(null);
  const runningRef = useRef(false);
  const gestureSeenRef = useRef(false);
  const cycleRef = useRef(0);
  const heardAtRef = useRef<number | null>(null);
  const restartTimerRef = useRef<number | null>(null);
  const enabledRef = useRef(enabled);
  const pausedRef = useRef(paused);
  const onWakeRef = useRef(onWake);
  const statusRef = useRef(status);
  enabledRef.current = enabled;
  pausedRef.current = paused;
  onWakeRef.current = onWake;
  statusRef.current = status;

  const clearRestartTimer = () => {
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  };

  const stopRec = useCallback(() => {
    clearRestartTimer();
    const rec = recRef.current;
    recRef.current = null;
    runningRef.current = false;
    if (rec) {
      try { rec.onresult = null; rec.onerror = null; rec.onend = null; rec.stop(); } catch { /* already stopped */ }
    }
  }, []);

  const startRec = useCallback(() => {
    if (!support.supported) return;
    if (!enabledRef.current || pausedRef.current) return;
    if (runningRef.current) return;
    const browserWindow = window as SpeechRecognitionWindow;
    const Recognition = browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setStatus('unsupported');
      setReason('no-speech-recognition');
      return;
    }
    let rec: BrowserSpeechRecognition;
    try {
      rec = new Recognition();
    } catch {
      setStatus('error');
      setReason('no-mic');
      return;
    }
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = wakeWordLang(cycleRef.current);
    cycleRef.current += 1;
    rec.onresult = (e) => {
      for (let i = 0; i < e.results.length; i += 1) {
        const transcript = e.results[i]?.[0]?.transcript ?? '';
        if (!transcript) continue;
        if (isWakeWord(transcript)) {
          // Stop OUR recogniser first — the mic belongs to the
          // greeting + command listening that follows now.
          stopRec();
          const now = Date.now();
          heardAtRef.current = now;
          setHeardAt(now);
          setHeardText(transcript.trim());
          setStatus('heard');
          onWakeRef.current(transcript.trim());
          return;
        }
      }
    };
    rec.onerror = (e) => {
      const err = e?.error ?? '';
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        stopRec();
        setStatus('error');
        setReason('not-allowed');
        return;
      }
      if (err === 'aborted' || err === 'no-speech' || err === 'audio-capture') {
        // Transient: let onend restart us (or restart directly when
        // onend never fires). 'audio-capture' with no mic at all
        // settles into the honest error below via repeated ends.
        if (err === 'audio-capture') {
          stopRec();
          setStatus('error');
          setReason('no-mic');
        }
        return;
      }
      // 'network' and friends: keep trying — the status stays
      // 'listening' only while the recogniser is actually running.
    };
    rec.onend = () => {
      runningRef.current = false;
      recRef.current = null;
      if (!enabledRef.current || pausedRef.current) {
        if (statusRef.current === 'listening') {
          setStatus(enabledRef.current ? 'waiting-gesture' : 'off');
        }
        return;
      }
      // She may still be in the post-wake cooldown — wait it out.
      const sinceHeard = heardAtRef.current ? Date.now() - heardAtRef.current : Infinity;
      const wait = sinceHeard < HEARD_COOLDOWN_MS ? HEARD_COOLDOWN_MS - sinceHeard : 350;
      clearRestartTimer();
      restartTimerRef.current = window.setTimeout(() => {
        restartTimerRef.current = null;
        if (enabledRef.current && !pausedRef.current && !runningRef.current) startRec();
      }, wait);
    };
    recRef.current = rec;
    try {
      rec.start();
      runningRef.current = true;
      setStatus('listening');
      setReason('');
    } catch {
      runningRef.current = false;
      recRef.current = null;
      setStatus('error');
      setReason('no-mic');
    }
  }, [stopRec, support.supported]);

  /** Start listening from a user gesture (indicator / toggle click). */
  const start = useCallback(() => {
    if (!support.supported || !enabledRef.current) return;
    gestureSeenRef.current = true;
    if (pausedRef.current) {
      setStatus('waiting-gesture');
      setReason('waiting-gesture');
      return;
    }
    startRec();
  }, [startRec, support.supported]);

  const stop = useCallback(() => {
    stopRec();
    setStatus(enabledRef.current ? 'waiting-gesture' : 'off');
    setReason(enabledRef.current ? 'waiting-gesture' : 'off');
  }, [stopRec]);

  // Enabled / paused changes: start when allowed, stop when not.
  useEffect(() => {
    if (!support.supported) {
      setStatus('unsupported');
      setReason((support as { reason: string }).reason);
      return;
    }
    if (!enabled) {
      stopRec();
      setStatus('off');
      setReason('off');
      return;
    }
    if (paused) {
      stopRec();
      if (statusRef.current === 'listening') {
        setStatus('waiting-gesture');
        setReason('waiting-gesture');
      }
      return;
    }
    if (gestureSeenRef.current) {
      if (!runningRef.current) {
        // After a wake, the listener restarts only once the
        // greeting + command turn is over (paused false) AND the
        // cooldown has passed — otherwise it would re-trigger on
        // its own echo. Without this branch status stuck on
        // 'heard' forever after the first wake.
        const sinceHeard = heardAtRef.current ? Date.now() - heardAtRef.current : Infinity;
        if (statusRef.current === 'heard' && sinceHeard < HEARD_COOLDOWN_MS) {
          clearRestartTimer();
          restartTimerRef.current = window.setTimeout(() => {
            restartTimerRef.current = null;
            if (enabledRef.current && !pausedRef.current && !runningRef.current) startRec();
          }, HEARD_COOLDOWN_MS - sinceHeard);
        } else {
          startRec();
        }
      }
    } else {
      setStatus('waiting-gesture');
      setReason('waiting-gesture');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, paused]);

  // First user gesture anywhere unlocks the mic (Chrome policy).
  useEffect(() => {
    if (!support.supported) return;
    const onGesture = () => {
      if (gestureSeenRef.current) return;
      gestureSeenRef.current = true;
      if (enabledRef.current && !pausedRef.current && !runningRef.current) startRec();
    };
    window.addEventListener('pointerdown', onGesture);
    window.addEventListener('keydown', onGesture);
    return () => {
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Unmount: always release the mic.
  useEffect(() => () => stopRec(), [stopRec]);

  return {
    status,
    reason,
    supported: support.supported,
    listening: status === 'listening',
    heardAt,
    heardText,
    start,
    stop,
  };
}
