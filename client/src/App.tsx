import { useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import ChatPage from '@/pages/chat';
import LoginScreen from '@/components/LoginScreen';
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
  const [gate, setGate] = useState<"login" | "unlock" | "ready">(() => {
    if (!isLoggedIn()) return "login";
    return isVaultUnlocked() ? "ready" : "unlock";
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
    setGate("ready");
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
