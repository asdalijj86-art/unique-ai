import { useEffect, useState } from "react";
import { checkSetupNeeded, login, setupOwner, type AuthUser } from "../lib/auth";

/**
 * LoginScreen — the gate in front of the whole app (security build
 * 2026-11-25). NO account = NO access: nothing behind this screen
 * loads until a session exists.
 *
 * Two modes:
 *  - SETUP (no accounts exist yet): the first account created IS the
 *    owner (admin). He creates it first, then creates guest accounts
 *    from the Security panel.
 *  - LOGIN: name + password. A wrong password gives ONE generic error
 *    — it never says whether the name exists.
 *
 * The password is handed to onDone exactly once (so the app can
 * unlock the encrypted memory vault with it) and is never stored
 * anywhere — not in state after the call, not in localStorage.
 */
export default function LoginScreen({ onDone, unlockFor }: { onDone: (user: AuthUser, password: string) => void; unlockFor?: AuthUser }) {
  const [mode, setMode] = useState<"loading" | "setup" | "login" | "unlock">(unlockFor ? "unlock" : "loading");
  const [name, setName] = useState(unlockFor?.name || "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (unlockFor) return; // unlock mode: name is fixed, no setup check
    let alive = true;
    checkSetupNeeded()
      .then((needed) => { if (alive) setMode(needed ? "setup" : "login"); })
      .catch(() => { if (alive) setMode("login"); });
    return () => { alive = false; };
  }, [unlockFor]);

  async function submit() {
    setError("");
    const n = name.trim();
    if (n.length < 2) { setError("نام کم از کم 2 حرف کا ہو۔"); return; }
    if (password.length < 8) { setError("پاسورڈ کم از کم 8 حرف کا ہو۔"); return; }
    if (mode === "setup" && password !== confirm) { setError("دونوں پاسورڈ ایک جیسے نہیں ہیں۔"); return; }
    setBusy(true);
    try {
      const result = mode === "setup"
        ? await setupOwner(n, password)
        : await login(n, password);
      const pw = password;
      setPassword("");
      setConfirm("");
      onDone(result.user, pw);
    } catch (e: any) {
      setError(e?.message || "لاگ اِن نہیں ہوا۔ دوبارہ کوشش کریں۔");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "loading") {
    return (
      <div className="ulogin">
        <div className="ulogin-card"><p>…کھل رہا ہے</p></div>
      </div>
    );
  }

  return (
    <div className="ulogin">
      <div className="ulogin-card">
        <div className="ulogin-logo">✦</div>
        <h1 className="ulogin-title">یونیک AI</h1>
        <p className="ulogin-sub">
          {mode === "setup"
            ? "پہلی بار — مالک اکاؤنٹ بنائیں۔ یہی اکاؤنٹ سب کا مالک ہو گا، اور اسی سے مہمان اکاؤنٹ بنیں گے۔"
            : mode === "unlock"
              ? "آپ لاگ اِن ہیں — اپنی خفیہ میموری کھولنے کے لیے اپنا پاسورڈ دوبارہ لکھیں۔"
              : "اپنے اکاؤنٹ سے لاگ اِن کریں۔ ہر شخص کی اپنی میموری اور اپنی key الگ رہتی ہے۔"}
        </p>
        <label className="ulogin-label">
          نام
          <input
            className="ulogin-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="اپنا نام لکھیں"
            autoComplete="username"
            disabled={busy || mode === "unlock"}
          />
        </label>
        <label className="ulogin-label">
          پاسورڈ
          <input
            className="ulogin-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="کم از کم 8 حرف"
            autoComplete={mode === "setup" ? "new-password" : "current-password"}
            disabled={busy}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          />
        </label>
        {mode === "setup" && (
          <label className="ulogin-label">
            پاسورڈ دوبارہ
            <input
              className="ulogin-input"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="پاسورڈ دوبارہ لکھیں"
              autoComplete="new-password"
              disabled={busy}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            />
          </label>
        )}
        {error && <p className="ulogin-error">{error}</p>}
        <button className="ulogin-btn" onClick={submit} disabled={busy}>
          {busy ? "…رک جائیں" : mode === "setup" ? "مالک اکاؤنٹ بنائیں" : mode === "unlock" ? "میموری کھولیں" : "لاگ اِن کریں"}
        </button>
        <p className="ulogin-note">
          آپ کا پاسورڈ ہی آپ کی میموری کی چابی ہے — وہ بھول جائے تو میموری نہیں کھلے گی۔
          پاسورڈ کہیں لکھ کر محفوظ رکھیں۔
        </p>
      </div>
    </div>
  );
}
