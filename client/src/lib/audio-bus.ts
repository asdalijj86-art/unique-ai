// Audio focus bus — one voice at a time across the whole app.
//
// The chat voice (chat.tsx) and the Quran reader (QuranReader.tsx) each own
// an independent audio pipeline. Before this bus, nothing stopped one when
// the other started, so a chat reply could talk OVER a playing tilawat
// translation and vice versa. Now every speech owner registers a stop
// callback here, and whoever is about to speak first silences the others.

export type AudioOwner = 'chat' | 'quran';

const stoppers = new Map<AudioOwner, () => void>();

/** Register owner's stop callback; returns an unregister function. */
export function registerAudioStop(owner: AudioOwner, stop: () => void): () => void {
  stoppers.set(owner, stop);
  return () => {
    if (stoppers.get(owner) === stop) stoppers.delete(owner);
  };
}

/** Silence every registered owner except the one about to speak. */
export function stopOtherAudio(except: AudioOwner): void {
  stoppers.forEach((stop, owner) => {
    if (owner !== except) {
      try { stop(); } catch { /* a broken stopper must never block speech */ }
    }
  });
}
