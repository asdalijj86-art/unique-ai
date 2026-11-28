/**
 * pwa.ts — INSTALLABLE APP (Phase 2, Stonic: "Start with Windows" +
 * the app's own installer). A web app cannot install itself, but the
 * browser CAN offer it: this module captures the browser's
 * beforeinstallprompt event, reports honestly whether an install is
 * offered right now, and triggers the prompt on the user's tap.
 * Run-on-login is an OS setting on the INSTALLED app (the panel
 * explains where, in one line) — the web page cannot flip it itself,
 * and this module never pretends otherwise.
 */

export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: InstallPromptEvent | null = null;
let promptListenerAttached = false;

export function attachInstallPromptListener(): void {
  if (promptListenerAttached || typeof window === 'undefined') return;
  promptListenerAttached = true;
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    deferredPrompt = e as InstallPromptEvent;
    window.dispatchEvent(new CustomEvent('unique-ai:install-available'));
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    window.dispatchEvent(new CustomEvent('unique-ai:install-available'));
  });
}

export function canInstallNow(): boolean {
  return deferredPrompt !== null;
}

export function isInstalledApp(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    return (navigator as unknown as { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) return 'unavailable';
  try {
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    return choice.outcome;
  } catch {
    return 'unavailable';
  }
}
