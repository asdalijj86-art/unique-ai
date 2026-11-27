import { useEffect, useState } from "react";
import { checkSetupNeeded, forgotPassword, getVaultSalt, login, resetPassword, setupOwner, type AuthUser } from "../lib/auth";
import { archiveOldVault } from "../lib/secure-app-storage";

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
 *
 * Password field: every password input has an eye button to show /
 * hide what is typed (2026-11-28).
 *
 * Forgot password (LOGIN mode only): name -> plain-Urdu warning ->
 * explicit confirmation -> new password. HONESTY RULE: the password
 * IS the memory key, so a reset can NEVER unlock the old encrypted
 * memory. The old vault is ARCHIVED (renamed, never deleted) with
 * its old salt, so if the old password is ever remembered the old
 * memories can be opened again; the reset starts a fresh memory
 * under the new password.
 */

function EyeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-6.5 0-10-8-10-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function PasswordField({
  label, value, onChange, placeholder, autoComplete, disabled, show, onToggleShow, onEnter, testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoComplete: string;
  disabled: boolean;
  show: boolean;
  onToggleShow: () => void;
  onEnter: () => void;
  testId?: string;
}) {
  return (
    <label className="ulogin-label">
      {label}
      <span className="ulogin-pw-wrap">
        <input
          className="ulogin-input"
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          disabled={disabled}
          onKeyDown={(e) => { if (e.key === "Enter") onEnter(); }}
          data-testid={testId}
        />
        <button
          type="button"
          className="ulogin-eye"
          onClick={onToggleShow}
          aria-label={show ? "پاسورڈ چھپائیں" : "پاسورڈ دکھائیں"}
          title={show ? "پاسورڈ چھپائیں" : "پاسورڈ دکھائیں"}
          disabled={disabled}
          data-testid={testId ? `${testId}-eye` : undefined}
        >
          {show ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </span>
    </label>
  );
}

const FORGOT_WARNING =
  "خبردار — نیا پاسورڈ پرانی میموری نہیں کھولے گا۔ آپ کا پاسورڈ ہی آپ کی میموری کی چابی ہے، اس لیے پرانا پاسورڈ بھول جانے سے پرانی یادیں بند رہیں گی۔ آپ کا پرانا ڈیٹا ڈیلیٹ نہیں ہو گا — وہ محفوظ رکھا جائے گا، اور اگر پرانا پاسورڈ کبھی یاد آ گیا تو پرانی میموری واپس کھولی جا سکے گی۔ نیا پاسورڈ لگانے سے آپ کا اکاؤنٹ تازہ میموری سے شروع ہو گا۔";

export default function LoginScreen({ onDone, unlockFor }: { onDone: (user: AuthUser, password: string) => void; unlockFor?: AuthUser }) {
  const [mode, setMode] = useState<"loading" | "setup" | "login" | "unlock">(unlockFor ? "unlock" : "loading");
  const [name, setName] = useState(unlockFor?.name || "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  // Forgot-password flow (login mode only): null = hidden.
  const [forgot, setForgot] = useState<null | "name" | "warn" | "new">(null);
  const [forgotName, setForgotName] = useState("");
  const [warnChecked, setWarnChecked] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [newPwConfirm, setNewPwConfirm] = useState("");

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

  async function submitForgotName() {
    setError("");
    const n = forgotName.trim();
    if (n.length < 2) { setError("نام کم از کم 2 حرف کا ہو۔"); return; }
    setBusy(true);
    try {
      await forgotPassword(n);
      setForgot("warn");
    } catch (e: any) {
      setError(e?.message || "درخواست ناکام ہو گئی۔ دوبارہ کوشش کریں۔");
    } finally {
      setBusy(false);
    }
  }

  async function submitForgotReset() {
    setError("");
    const n = forgotName.trim();
    if (newPw.length < 8) { setError("نیا پاسورڈ کم از کم 8 حرف کا ہو۔"); return; }
    if (newPw !== newPwConfirm) { setError("دونوں پاسورڈ ایک جیسے نہیں ہیں۔"); return; }
    // Capture the OLD vault salt BEFORE the reset overwrites it —
    // the archive below needs it so the old vault stays openable.
    const oldSalt = getVaultSalt();
    setBusy(true);
    try {
      const result = await resetPassword(n, newPw);
      // Archive the old encrypted vault + old account data (rename,
      // never delete) BEFORE the fresh session is used.
      archiveOldVault(result.user.id, oldSalt);
      const pw = newPw;
      setNewPw("");
      setNewPwConfirm("");
      setForgot(null);
      onDone(result.user, pw);
    } catch (e: any) {
      setError(e?.message || "ری سیٹ نہیں ہوا۔ دوبارہ کوشش کریں۔");
    } finally {
      setBusy(false);
    }
  }

  function openForgot() {
    setError("");
    setForgotName(name.trim());
    setWarnChecked(false);
    setNewPw("");
    setNewPwConfirm("");
    setForgot("name");
  }

  if (mode === "loading") {
    return (
      <div className="ulogin">
        <div className="ulogin-card"><p>…کھل رہا ہے</p></div>
      </div>
    );
  }

  // --- Forgot-password card (replaces the login form) -------------------
  if (forgot) {
    return (
      <div className="ulogin">
        <div className="ulogin-card">
          <div className="ulogin-logo">✦</div>
          <h1 className="ulogin-title">پاسورڈ بھول گئے؟</h1>
          {forgot === "name" && (
            <>
              <p className="ulogin-sub">اپنا اکاؤنٹ نام لکھیں — اسی نام سے نیا پاسورڈ سیٹ ہو گا۔</p>
              <label className="ulogin-label">
                نام
                <input
                  className="ulogin-input"
                  value={forgotName}
                  onChange={(e) => setForgotName(e.target.value)}
                  placeholder="اپنا نام لکھیں"
                  autoComplete="username"
                  disabled={busy}
                  onKeyDown={(e) => { if (e.key === "Enter") submitForgotName(); }}
                />
              </label>
              {error && <p className="ulogin-error">{error}</p>}
              <button className="ulogin-btn" onClick={submitForgotName} disabled={busy}>
                {busy ? "…رک جائیں" : "آگے"}
              </button>
            </>
          )}
          {forgot === "warn" && (
            <>
              <div className="ulogin-warn" data-testid="forgot-warning" role="alert">{FORGOT_WARNING}</div>
              <label className="ulogin-check">
                <input
                  type="checkbox"
                  checked={warnChecked}
                  onChange={(e) => setWarnChecked(e.target.checked)}
                  disabled={busy}
                  data-testid="forgot-confirm-check"
                />
                <span>میں سمجھ گیا ہوں — پرانی میموری نئے پاسورڈ سے نہیں کھلے گی۔</span>
              </label>
              {error && <p className="ulogin-error">{error}</p>}
              <button className="ulogin-btn" onClick={() => setForgot("new")} disabled={busy || !warnChecked}>
                نیا پاسورڈ سیٹ کریں
              </button>
            </>
          )}
          {forgot === "new" && (
            <>
              <p className="ulogin-sub">اکاؤنٹ: {forgotName} — نیا پاسورڈ لکھیں۔</p>
              <PasswordField
                label="نیا پاسورڈ"
                value={newPw}
                onChange={setNewPw}
                placeholder="کم از کم 8 حرف"
                autoComplete="new-password"
                disabled={busy}
                show={showPw}
                onToggleShow={() => setShowPw((v) => !v)}
                onEnter={submitForgotReset}
                testId="forgot-new-password"
              />
              <PasswordField
                label="نیا پاسورڈ دوبارہ"
                value={newPwConfirm}
                onChange={setNewPwConfirm}
                placeholder="نیا پاسورڈ دوبارہ لکھیں"
                autoComplete="new-password"
                disabled={busy}
                show={showPw}
                onToggleShow={() => setShowPw((v) => !v)}
                onEnter={submitForgotReset}
                testId="forgot-new-password-confirm"
              />
              {error && <p className="ulogin-error">{error}</p>}
              <button className="ulogin-btn" onClick={submitForgotReset} disabled={busy}>
                {busy ? "…رک جائیں" : "پاس ورڈ بدل کر لاگ ان کریں"}
              </button>
            </>
          )}
          <button type="button" className="ulogin-forgot" onClick={() => { setForgot(null); setError(""); }} disabled={busy}>
            واپس لاگ ان پر
          </button>
        </div>
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
        <PasswordField
          label="پاسورڈ"
          value={password}
          onChange={setPassword}
          placeholder="کم از کم 8 حرف"
          autoComplete={mode === "setup" ? "new-password" : "current-password"}
          disabled={busy}
          show={showPw}
          onToggleShow={() => setShowPw((v) => !v)}
          onEnter={submit}
          testId="login-password"
        />
        {mode === "setup" && (
          <PasswordField
            label="پاسورڈ دوبارہ"
            value={confirm}
            onChange={setConfirm}
            placeholder="پاسورڈ دوبارہ لکھیں"
            autoComplete="new-password"
            disabled={busy}
            show={showPw}
            onToggleShow={() => setShowPw((v) => !v)}
            onEnter={submit}
            testId="login-password-confirm"
          />
        )}
        {mode === "login" && (
          <button type="button" className="ulogin-forgot" onClick={openForgot} disabled={busy} data-testid="forgot-link">
            پاس ورڈ بھول گئے؟
          </button>
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
