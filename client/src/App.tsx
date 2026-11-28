import { useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import ChatPage from '@/pages/chat';
import LoginScreen from '@/components/LoginScreen';
import FaceLockScreen from '@/components/FaceLockScreen';
import { faceLockReady, loadFaceLock } from '@/lib/face-lock';
import { secureAppStorage } from '@/lib/secure-app-storage';
import {
  getAuthUser,
  isLoggedIn,
  migrateLegacyKeyToServer,
  type AuthUser,
} from '@/lib/auth';
import {
  isVaultUnlocked,
  lockVault,
  migrateLegacyMemory,
  migrateLegacyStorage,
  unlockVault,
} from '@/lib/secure-app-storage';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={ChatPage} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  // SECURITY GATE (2026-11-25): no session = no app. The login screen
  // is the whole front until an account logs in. After a page reload
  // the session survives (sessionStorage) but the encrypted memory
  // vault is locked — the user re-enters only their password to
  // unlock it (unlock mode), never a full re-login.
  // FACE LOCK (Phase 2, 2026-11-28): when armed (enabled + passcode
  // + face enrolled), the face/passcode screen sits AFTER the vault
  // unlock and BEFORE the app — the passcode always unlocks, so the
  // user is never locked out.
  const [gate, setGate] = useState<"login" | "unlock" | "facelock" | "ready">(() => {
    if (!isLoggedIn()) return "login";
    if (!isVaultUnlocked()) return "unlock";
    const fl = loadFaceLock(secureAppStorage);
    return fl.enabled && faceLockReady(fl) ? "facelock" : "ready";
  });
  const [gateUser, setGateUser] = useState<AuthUser | null>(() => getAuthUser());
  const [vaultNote, setVaultNote] = useState<string | null>(null);

  useEffect(() => {
    const onLogout = () => {
      lockVault();
      setGateUser(null);
      setGate("login");
    };
    window.addEventListener("unique-ai:logged-out", onLogout);
    return () => window.removeEventListener("unique-ai:logged-out", onLogout);
  }, []);

  async function handleLoggedIn(user: AuthUser, password: string) {
    // The password is used ONCE here, in memory, to unlock the
    // encrypted memory vault — it is never stored anywhere.
    const unlocked = await unlockVault(password);
    setGateUser(user);
    if (unlocked) {
      // 1) Legacy Gemini key(s) first: move them to the server
      //    (encrypted, per-account) BEFORE the memory migration
      //    deletes the plaintext copies.
      await migrateLegacyKeyToServer();
      // 2) Bare settings/conversations/etc. into this account's
      //    namespaced store — BEFORE the memory migration sets the
      //    "migrated" flag (it skips vault keys; this skips them too).
      await migrateLegacyStorage();
      // 3) Owner-only, once: encrypt the old plaintext memory under
      //    the owner's account and delete the plaintext keys.
      const report = await migrateLegacyMemory();
      if (report.migrated > 0) setVaultNote(report.note);
    } else {
      setVaultNote("میموری نہیں کھل سکی — پاسورڈ چیک کریں۔ میموری خالی دکھے گی، ختم نہیں ہوئی۔");
    }
    // Face Lock gate (Phase 2): armed only when enabled + passcode
    // + face enrolled; the passcode always unlocks.
    const fl = loadFaceLock(secureAppStorage);
    setGate(fl.enabled && faceLockReady(fl) ? "facelock" : "ready");
  }

  if (gate === "login") {
    return <LoginScreen onDone={handleLoggedIn} />;
  }
  if (gate === "unlock") {
    return (
      <LoginScreen
        unlockFor={gateUser || undefined}
        onDone={handleLoggedIn}
      />
    );
  }
  if (gate === "facelock") {
    return <FaceLockScreen onUnlock={() => setGate("ready")} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {vaultNote && (
          <div className="uvault-note" role="status">
            <span>{vaultNote}</span>
            <button onClick={() => setVaultNote(null)}>ٹھیک ہے</button>
          </div>
        )}
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
