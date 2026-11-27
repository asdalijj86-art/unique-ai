/**
 * auth.ts — client-side session for Unique AI's per-person login
 * (security build 2026-11-25).
 *
 * The session token lives in sessionStorage (dies with the tab) and is
 * sent as `Authorization: Bearer <token>` on EVERY /api call via
 * authFetch. A 401 means "not logged in / session expired" — the app
 * drops the token and shows the login screen.
 *
 * The token itself is NOT a secret worth guarding from the user (it IS
 * their session), but it must never be written into memory, notes or
 * backups. Device id is a random UUID stored in localStorage
 * (unique-ai-device-id) — it lets the owner see WHICH device logged in.
 */

export type AuthUser = {
  id: string;
  name: string;
  role: "owner" | "guest";
  enabled: boolean;
  hasKey: boolean;
  keyLast4: string | null;
  createdAt: string;
  lastLoginAt: string | null;
};

const TOKEN_KEY = "unique-ai-session-token";
const USER_KEY = "unique-ai-session-user";
const DEVICE_KEY = "unique-ai-device-id";
const VAULT_SALT_KEY = "unique-ai-vault-salt";

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = (globalThis.crypto?.randomUUID && crypto.randomUUID()) || `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return `dev-${Date.now()}`;
  }
}

export function getDeviceName(): string {
  try {
    return navigator.userAgent.includes("Mobile") ? "موبائل" : "لیپ ٹاپ";
  } catch {
    return "ڈیوائس";
  }
}

export function getAuthToken(): string | null {
  try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function getAuthUser(): AuthUser | null {
  try {
    const raw = sessionStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function isLoggedIn(): boolean {
  return !!getAuthToken() && !!getAuthUser();
}

export function saveSession(token: string, user: AuthUser, vaultSalt?: string) {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    if (vaultSalt) localStorage.setItem(VAULT_SALT_KEY, vaultSalt);
  } catch { /* storage unavailable — session still works in memory */ }
}

export function getVaultSalt(): string | null {
  try { return localStorage.getItem(VAULT_SALT_KEY); } catch { return null; }
}

export function clearSession() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
  } catch { /* ignore */ }
}

export async function logout() {
  const token = getAuthToken();
  if (token) {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch { /* server may be down — local logout still happens */ }
  }
  clearSession();
  window.dispatchEvent(new CustomEvent("unique-ai:logged-out"));
}

async function authJson(path: string, body: unknown): Promise<any> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "درخواست ناکام ہو گئی۔");
  return data;
}

export async function checkSetupNeeded(): Promise<boolean> {
  const res = await fetch("/api/auth/status");
  const data = await res.json().catch(() => ({}));
  return !!data.setupNeeded;
}

export async function setupOwner(name: string, password: string): Promise<{ user: AuthUser; vaultSalt: string }> {
  const data = await authJson("/api/auth/setup", {
    name, password, deviceId: getDeviceId(), deviceName: getDeviceName(),
  });
  saveSession(data.token, data.user, data.vaultSalt);
  return { user: data.user, vaultSalt: data.vaultSalt };
}

export async function login(name: string, password: string): Promise<{ user: AuthUser; vaultSalt: string }> {
  const data = await authJson("/api/auth/login", {
    name, password, deviceId: getDeviceId(), deviceName: getDeviceName(),
  });
  saveSession(data.token, data.user, data.vaultSalt);
  return { user: data.user, vaultSalt: data.vaultSalt };
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await authJson("/api/auth/password", { currentPassword, newPassword });
}

/**
 * Forgot password (locked-out user, no session).
 * Step 1 — check: always { ok: true } from the server (it never
 * reveals whether the name exists); the reset step validates it.
 * Step 2 — reset: requires the explicit confirmation flag, a new
 * password (>= 8), and returns a FRESH session under the new
 * password + a fresh vault salt. The OLD vault salt is preserved on
 * the server (user.vaultArchives) and the caller MUST archive the
 * old local vault blobs (archiveOldVault) before using the session —
 * the old encrypted memory is NEVER deleted, it just stays locked
 * without the old password.
 */
export async function forgotPassword(name: string): Promise<{ ok: boolean }> {
  return authJson("/api/auth/forgot-password", { name });
}

export async function resetPassword(name: string, newPassword: string): Promise<{ user: AuthUser; vaultSalt: string }> {
  const data = await authJson("/api/auth/reset-password", {
    name, newPassword, confirmed: true, deviceId: getDeviceId(), deviceName: getDeviceName(),
  });
  saveSession(data.token, data.user, data.vaultSalt);
  return { user: data.user, vaultSalt: data.vaultSalt };
}

export async function saveOwnKey(key: string): Promise<{ hasKey: boolean; keyLast4: string }> {
  const data = await authJson("/api/auth/key", { key });
  const user = getAuthUser();
  if (user) {
    user.hasKey = true;
    user.keyLast4 = data.keyLast4;
    saveSession(getAuthToken() || "", user);
  }
  return data;
}

/**
 * Owner-only, once: move legacy plaintext Gemini key(s) from
 * localStorage to the server (encrypted, per-account). Tries each
 * saved key in order until one validates. The plaintext copies are
 * deleted only after a successful save — if none validates, they
 * stay for the next login's retry. Guests never run this.
 */
export async function migrateLegacyKeyToServer(): Promise<boolean> {
  const user = getAuthUser();
  if (!user || user.role !== "owner") return false;
  let raw = "";
  try { raw = localStorage.getItem("unique-ai-gemini-key") || ""; } catch { return false; }
  const keys = raw.split(/[\n,]+/).map((k) => k.trim()).filter((k) => k.length > 10);
  if (keys.length === 0) return false;
  if (user.hasKey) {
    try { localStorage.removeItem("unique-ai-gemini-key"); localStorage.removeItem("unique-ai-gemini-key-index"); } catch { /* ignore */ }
    return false;
  }
  for (const key of keys) {
    try {
      await saveOwnKey(key);
      try { localStorage.removeItem("unique-ai-gemini-key"); localStorage.removeItem("unique-ai-gemini-key-index"); } catch { /* ignore */ }
      return true;
    } catch { /* try the next saved key */ }
  }
  return false;
}

export async function getOwnKeyStatus(): Promise<{ hasKey: boolean; keyLast4: string | null }> {
  const res = await authFetch("/api/auth/key");
  return res.json();
}

export async function deleteOwnKey(): Promise<void> {
  await authFetch("/api/auth/key", { method: "DELETE" });
  const user = getAuthUser();
  if (user) {
    user.hasKey = false;
    user.keyLast4 = null;
    saveSession(getAuthToken() || "", user);
  }
}

export async function adminListUsers(): Promise<AuthUser[]> {
  const res = await authFetch("/api/auth/admin/users");
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "فہرست نہیں ملی۔");
  return data.users || [];
}

export async function adminCreateUser(name: string, password: string): Promise<AuthUser> {
  const data = await authJsonAuthed("/api/auth/admin/users", { name, password });
  return data.user;
}

export async function adminSetUserEnabled(id: string, enabled: boolean): Promise<void> {
  await authFetch(`/api/auth/admin/users/${id}/${enabled ? "enable" : "disable"}`, { method: "POST" });
}

export async function adminResetUserPassword(id: string, password: string): Promise<void> {
  await authJsonAuthed(`/api/auth/admin/users/${id}/reset-password`, { password });
}

async function authJsonAuthed(path: string, body: unknown): Promise<any> {
  const res = await authFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "درخواست ناکام ہو گئی۔");
  return data;
}

export type SecurityEvent = {
  id: string;
  t: string;
  type: string;
  severity: string;
  accountId: string | null;
  accountName: string | null;
  deviceId: string | null;
  ip: string | null;
  detail: string;
  blocked: string;
};

export async function fetchAlerts(): Promise<{ events: SecurityEvent[]; unread: number }> {
  const res = await authFetch("/api/auth/admin/alerts");
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "الرٹس نہیں ملے۔");
  return { events: data.events || [], unread: data.unread || 0 };
}

export async function markAlertsRead(): Promise<void> {
  await authFetch("/api/auth/admin/alerts/read", { method: "POST" });
}

export async function fetchLoginLog(): Promise<SecurityEvent[]> {
  const res = await authFetch("/api/auth/admin/logins");
  const data = await res.json().catch(() => ({}));
  return data.events || [];
}

export async function fetchRequestLog(): Promise<Array<{ t: string; userId: string; userName: string; method: string; path: string; status: number }>> {
  const res = await authFetch("/api/auth/admin/requests");
  const data = await res.json().catch(() => ({}));
  return data.entries || [];
}

/**
 * Authenticated fetch. Attaches the session token to every /api call.
 * A 401 drops the session and fires the logout event (App.tsx shows
 * the login screen). The caller still gets the 401 response to handle.
 */
export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = getAuthToken();
  const headers = new Headers(init.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(input, { ...init, headers });
  if (res.status === 401) {
    clearSession();
    window.dispatchEvent(new CustomEvent("unique-ai:logged-out"));
  }
  return res;
}
