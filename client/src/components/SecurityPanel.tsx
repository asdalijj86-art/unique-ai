import { useEffect, useState } from "react";
import {
  adminCreateUser,
  adminListUsers,
  adminResetUserPassword,
  adminSetUserEnabled,
  fetchAlerts,
  fetchLoginLog,
  fetchRequestLog,
  markAlertsRead,
  type AuthUser,
  type SecurityEvent,
} from "../lib/auth";

/**
 * SecurityPanel — the OWNER-only security centre (security build
 * 2026-11-25). It shows:
 *   1. INTRUSION ALERTS — every attack the app could SEE (failed
 *      logins, new devices, token abuse, rate-limit hits, pairing
 *      brute force, bad tokens, key-use spikes). Each event names the
 *      account, the event, the time, and what was blocked.
 *   2. ACCOUNTS — create/disable/reset guest accounts (owner only).
 *   3. LOGINS — who logged in, when, from where.
 *   4. REQUESTS — who called which API, when (owner-visible log).
 *
 * HONEST LIMIT (shown on the panel itself, not hidden): the app can
 * only alert on attacks it can SEE — its own logins, API calls and
 * pairing. It CANNOT detect malware or hacking elsewhere on a device
 * outside the app. There is no push channel into Muse chat or to his
 * phone — this panel + the server log IS the alert delivery.
 */
function timeStr(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ur-PK", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

const SEV_LABEL: Record<string, string> = { high: "خطرہ", medium: "احتیاط", info: "خبر" };

export default function SecurityPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"alerts" | "users" | "logins" | "requests">("alerts");
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [unread, setUnread] = useState(0);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [logins, setLogins] = useState<SecurityEvent[]>([]);
  const [requests, setRequests] = useState<Array<{ t: string; userName: string; method: string; path: string; status: number }>>([]);
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");
  const [newPass, setNewPass] = useState("");
  const [resetPass, setResetPass] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function loadAll() {
    setError("");
    try {
      const [a, u, l, r] = await Promise.all([
        fetchAlerts(),
        adminListUsers(),
        fetchLoginLog(),
        fetchRequestLog(),
      ]);
      setEvents(a.events);
      setUnread(a.unread);
      setUsers(u);
      setLogins(l);
      setRequests(r);
    } catch (e: any) {
      setError(e?.message || "معلومات نہیں مل سکیں۔");
    }
  }

  useEffect(() => { void loadAll(); }, []);

  async function markRead() {
    try {
      await markAlertsRead();
      setUnread(0);
    } catch { /* ignore */ }
  }

  async function createUser() {
    if (newName.trim().length < 2 || newPass.length < 8) {
      setError("نام کم از کم 2 حرف، پاسورڈ کم از کم 8 حرف کا ہو۔");
      return;
    }
    setBusy(true);
    try {
      await adminCreateUser(newName.trim(), newPass);
      setNewName("");
      setNewPass("");
      await loadAll();
    } catch (e: any) {
      setError(e?.message || "اکاؤنٹ نہیں بنا۔");
    } finally {
      setBusy(false);
    }
  }

  async function toggleUser(u: AuthUser) {
    setBusy(true);
    try {
      await adminSetUserEnabled(u.id, !u.enabled);
      await loadAll();
    } catch (e: any) {
      setError(e?.message || "نہیں ہو سکا۔");
    } finally {
      setBusy(false);
    }
  }

  async function resetUser(u: AuthUser) {
    const pw = (resetPass[u.id] || "").trim();
    if (pw.length < 8) {
      setError("نیا پاسورڈ کم از کم 8 حرف کا ہو۔");
      return;
    }
    setBusy(true);
    try {
      await adminResetUserPassword(u.id, pw);
      setResetPass((prev) => ({ ...prev, [u.id]: "" }));
      setError("پاسورڈ بدل دیا گیا — اس مہمان کی پرانی خفیہ میموری نئے پاسورڈ سے نہیں کھلے گی؛ اگلی بار لاگ اِن پر وہ خالی شروع کرے گا۔");
      await loadAll();
    } catch (e: any) {
      setError(e?.message || "نہیں ہو سکا۔");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="usec-overlay" role="dialog" aria-label="سیکیورٹی">
      <div className="usec-panel">
        <div className="usec-head">
          <h2>🛡️ سیکیورٹی — صرف مالک</h2>
          <button className="usec-close" onClick={onClose} aria-label="بند کریں">✕</button>
        </div>
        <p className="usec-limit">
          ایمانداری سے: یہ پینل صرف وہ حملے دکھاتا ہے جو ایپ خود دیکھ سکتی ہے — اس کے اپنے
          لاگ اِن، API اور pairing۔ ڈیوائس کے باہر کا میلویئر یا ہیکنگ یہ نہیں دیکھ سکتی۔
          الرٹ یہیں ملتا ہے؛ فون یا چیٹ پر کوئی الگ پیغام نہیں آتا۔
        </p>
        <div className="usec-tabs">
          <button className={tab === "alerts" ? "usec-tab on" : "usec-tab"} onClick={() => setTab("alerts")}>
            الرٹس {unread > 0 && <span className="usec-badge">{unread}</span>}
          </button>
          <button className={tab === "users" ? "usec-tab on" : "usec-tab"} onClick={() => setTab("users")}>اکاؤنٹس</button>
          <button className={tab === "logins" ? "usec-tab on" : "usec-tab"} onClick={() => setTab("logins")}>لاگ اِن</button>
          <button className={tab === "requests" ? "usec-tab on" : "usec-tab"} onClick={() => setTab("requests")}>درخواستیں</button>
        </div>
        {error && <p className="usec-error">{error}</p>}

        {tab === "alerts" && (
          <div className="usec-body">
            <div className="usec-row">
              <span>{events.length === 0 ? "ابھی کوئی الرٹ نہیں — سب ٹھیک ہے۔" : `${events.length} واقعات (نئے پہلے)`}</span>
              {unread > 0 && <button className="usec-btn" onClick={markRead}>سب پڑھے ہوئے کریں</button>}
            </div>
            {events.map((e) => (
              <div key={e.id} className={`usec-event sev-${e.severity}`}>
                <div className="usec-event-top">
                  <span className="usec-sev">{SEV_LABEL[e.severity] || e.severity}</span>
                  <span className="usec-type">{e.type}</span>
                  <span className="usec-time">{timeStr(e.t)}</span>
                </div>
                <div className="usec-detail">{e.detail}</div>
                {e.accountName && <div className="usec-who">اکاؤنٹ: {e.accountName}</div>}
                {e.blocked && <div className="usec-blocked">روکا گیا: {e.blocked}</div>}
              </div>
            ))}
          </div>
        )}

        {tab === "users" && (
          <div className="usec-body">
            <div className="usec-create">
              <input
                className="usec-input"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="مہمان کا نام"
                disabled={busy}
              />
              <input
                className="usec-input"
                type="password"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                placeholder="پاسورڈ (8+ حرف)"
                disabled={busy}
              />
              <button className="usec-btn" onClick={createUser} disabled={busy}>مہمان اکاؤنٹ بنائیں</button>
            </div>
            <p className="usec-note">ہر مہمان کی اپنی key اور اپنی میموری ہوتی ہے — وہ آپ کی key یا میموری کبھی نہیں دیکھ سکتا۔</p>
            {users.map((u) => (
              <div key={u.id} className="usec-user">
                <div className="usec-user-main">
                  <strong>{u.name}</strong>
                  <span className="usec-role">{u.role === "owner" ? "مالک" : "مہمان"}</span>
                  <span className="usec-state">{u.enabled ? "چالو" : "بند"}</span>
                  <span className="usec-key">{u.hasKey ? `key: …${u.keyLast4}` : "key نہیں"}</span>
                </div>
                {u.role !== "owner" && (
                  <div className="usec-user-actions">
                    <button className="usec-btn small" onClick={() => toggleUser(u)} disabled={busy}>
                      {u.enabled ? "بند کریں" : "چالو کریں"}
                    </button>
                    <input
                      className="usec-input small"
                      type="password"
                      value={resetPass[u.id] || ""}
                      onChange={(e) => setResetPass((prev) => ({ ...prev, [u.id]: e.target.value }))}
                      placeholder="نیا پاسورڈ"
                      disabled={busy}
                    />
                    <button className="usec-btn small" onClick={() => resetUser(u)} disabled={busy}>پاسورڈ بدلیں</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === "logins" && (
          <div className="usec-body">
            {logins.length === 0 && <p>ابھی کوئی لاگ اِن ریکارڈ نہیں۔</p>}
            {logins.map((e) => (
              <div key={e.id} className={`usec-event sev-${e.severity}`}>
                <div className="usec-event-top">
                  <span className="usec-sev">{SEV_LABEL[e.severity] || e.severity}</span>
                  <span className="usec-type">{e.type}</span>
                  <span className="usec-time">{timeStr(e.t)}</span>
                </div>
                <div className="usec-detail">{e.detail}</div>
                {e.accountName && <div className="usec-who">اکاؤنٹ: {e.accountName}</div>}
                {e.blocked && <div className="usec-blocked">روکا گیا: {e.blocked}</div>}
              </div>
            ))}
          </div>
        )}

        {tab === "requests" && (
          <div className="usec-body">
            {requests.length === 0 && <p>ابھی کوئی درخواست ریکارڈ نہیں۔</p>}
            {requests.map((r, i) => (
              <div key={`${r.t}-${i}`} className="usec-req">
                <span className="usec-time">{timeStr(r.t)}</span>
                <span className="usec-who">{r.userName}</span>
                <span>{r.method} {r.path}</span>
                <span className={r.status >= 400 ? "usec-bad" : ""}>{r.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
