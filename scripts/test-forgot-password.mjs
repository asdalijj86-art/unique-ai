/**
 * test-forgot-password.mjs — forgot-password + eye-toggle checks.
 *
 * Part A (static): the eye toggle, forgot link, honest warning,
 * archive helper and reset endpoints exist in the source, with the
 * right guards (rate limit, generic error, session invalidation,
 * old-salt preservation, never-delete archive).
 *
 * Part B (live HTTP): an isolated copy of server/ on PORT=5001 with
 * a FRESH data dir. Creates an account, then proves:
 *   - forgot-password never reveals whether the name exists;
 *   - reset without confirmation / with a short password fails;
 *   - reset with a wrong name fails with the generic login error;
 *   - a real reset returns a fresh session + fresh vault salt, keeps
 *     the OLD salt in user.vaultArchives, invalidates the old
 *     session, the old password stops working and the new one works;
 *   - 5 failed resets lock the name (6th attempt -> 429).
 *
 * Run: node scripts/test-forgot-password.mjs   (from the repo root)
 * Exit 0 = all checks pass.
 */
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let pass = 0;
let fail = 0;
function check(name, ok, extra = "") {
  if (ok) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
}
function src(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

// ---------------------------------------------------------------- Part A
const authJs = src("server/auth.js");
const loginTsx = src("client/src/components/LoginScreen.tsx");
const authTs = src("client/src/lib/auth.ts");
const storageTs = src("client/src/lib/secure-app-storage.ts");
const css = src("client/src/index.css");

check("A1 server has forgot-password endpoint", authJs.includes('"/forgot-password"'));
check("A2 server has reset-password endpoint", authJs.includes('"/reset-password"'));
check("A3 reset preserves old salt in vaultArchives", authJs.includes("vaultArchives") && authJs.includes("oldSalt"));
check("A4 reset invalidates all sessions", authJs.includes("invalidateUserSessions(user.id)"));
check("A5 reset logs HIGH security event", authJs.includes("auth.password_reset_forgot"));
check("A6 reset is rate-limited like login", authJs.includes("isLoginLocked(name, ip)"));
check("A7 reset requires explicit confirmation", authJs.includes("confirmed !== true"));
check("A8 forgot-password never reveals existence", authJs.includes("Deliberately always ok"));
check("A9 login screen has forgot link", loginTsx.includes("پاس ورڈ بھول گئے؟") && loginTsx.includes('data-testid="forgot-link"'));
check("A10 warning says new password cannot open old memory", loginTsx.includes("نیا پاسورڈ پرانی میموری نہیں کھولے گا"));
check("A11 warning says old data is never deleted", loginTsx.includes("ڈیلیٹ نہیں ہو گا"));
check("A12 warning requires explicit checkbox", loginTsx.includes("forgot-confirm-check") && loginTsx.includes("disabled={busy || !warnChecked}"));
check("A13 eye toggle switches input type", loginTsx.includes('type={show ? "text" : "password"}'));
check("A14 eye button has Urdu labels", loginTsx.includes("پاسورڈ دکھائیں") && loginTsx.includes("پاسورڈ چھپائیں"));
check("A15 eye on login + setup-confirm + forgot-new fields", (loginTsx.match(/testId="(login-password|login-password-confirm|forgot-new-password|forgot-new-password-confirm)"/g) || []).length === 4);
check("A16 reset archives old vault before login", loginTsx.includes("archiveOldVault(result.user.id, oldSalt)"));
check("A17 client has forgot/reset helpers", authTs.includes("forgotPassword") && authTs.includes("resetPassword"));
check("A18 archive helper renames with timestamp, never deletes", storageTs.includes("archiveOldVault") && storageTs.includes("-archived-") && storageTs.includes("unique-ai-vault-archive-"));
check("A19 archive keeps old salt in the record", storageTs.includes("salt: oldSalt"));
check("A20 CSS has eye / forgot / warning styles", css.includes(".ulogin-eye") && css.includes(".ulogin-forgot") && css.includes(".ulogin-warn"));

// ---------------------------------------------------------------- Part B
const BASE = "http://127.0.0.1:5001";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "forgot-test-server-"));
let server = null;
async function j(method, p, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

try {
  // Isolated server copy with a FRESH data dir.
  execSync(`cp -r ${path.join(ROOT, "server")} ${tmp}/server`, { stdio: "pipe" });
  fs.rmSync(path.join(tmp, "server", "data"), { recursive: true, force: true });
  server = spawn("node", ["index.js"], {
    cwd: path.join(tmp, "server"),
    env: { ...process.env, PORT: "5001" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  server.stdout.on("data", (d) => { out += d.toString(); });
  server.stderr.on("data", (d) => { out += d.toString(); });
  const started = await new Promise((resolve) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (out.includes("listening on port 5001")) { clearInterval(iv); resolve(true); }
      else if (Date.now() - t0 > 20000) { clearInterval(iv); resolve(false); }
    }, 200);
  });
  check("B0 isolated test server starts on 5001", started, out.slice(-300));

  if (started) {
    const s0 = await j("GET", "/api/auth/status");
    check("B1 fresh server needs setup", s0.status === 200 && s0.data.setupNeeded === true);

    const setup = await j("POST", "/api/auth/setup", { name: "ForgotTest", password: "oldpass123", deviceId: "t1", deviceName: "test" });
    check("B2 setup creates owner account", setup.status === 200 && !!setup.data.token && !!setup.data.vaultSalt);
    const oldToken = setup.data.token;
    const oldSalt = setup.data.vaultSalt;

    const fpWrong = await j("POST", "/api/auth/forgot-password", { name: "NoSuchName" });
    check("B3 forgot-password with wrong name still returns ok (no leak)", fpWrong.status === 200 && fpWrong.data.ok === true);

    const fpOk = await j("POST", "/api/auth/forgot-password", { name: "ForgotTest" });
    check("B4 forgot-password with right name returns ok", fpOk.status === 200 && fpOk.data.ok === true);

    const rNoConfirm = await j("POST", "/api/auth/reset-password", { name: "ForgotTest", newPassword: "newpass123" });
    check("B5 reset without confirmation is refused", rNoConfirm.status === 400);

    const rShort = await j("POST", "/api/auth/reset-password", { name: "ForgotTest", newPassword: "short", confirmed: true });
    check("B6 reset with short password is refused", rShort.status === 400);

    const rWrong = await j("POST", "/api/auth/reset-password", { name: "NoSuchName", newPassword: "newpass123", confirmed: true });
    check("B7 reset with wrong name fails with generic error", rWrong.status === 401 && rWrong.data.error === "نام یا پاسورڈ غلط ہے۔");

    const reset = await j("POST", "/api/auth/reset-password", { name: "ForgotTest", newPassword: "newpass123", confirmed: true, deviceId: "t1", deviceName: "test" });
    check("B8 reset succeeds with fresh session + fresh salt", reset.status === 200 && !!reset.data.token && !!reset.data.vaultSalt && reset.data.vaultSalt !== oldSalt && reset.data.archived === true);
    const newToken = reset.data.token;

    const users = JSON.parse(fs.readFileSync(path.join(tmp, "server", "data", "users.json"), "utf8"));
    const u = users.users.find((x) => x.name === "ForgotTest");
    check("B9 old salt preserved in vaultArchives", !!u && Array.isArray(u.vaultArchives) && u.vaultArchives.length === 1 && u.vaultArchives[0].salt === oldSalt);

    const meOld = await j("GET", "/api/auth/me", undefined, oldToken);
    check("B10 old session is invalidated", meOld.status === 401);

    const loginOld = await j("POST", "/api/auth/login", { name: "ForgotTest", password: "oldpass123", deviceId: "t1", deviceName: "test" });
    check("B11 old password no longer works", loginOld.status === 401);

    const loginNew = await j("POST", "/api/auth/login", { name: "ForgotTest", password: "newpass123", deviceId: "t1", deviceName: "test" });
    check("B12 new password logs in", loginNew.status === 200 && !!loginNew.data.token);

    const meNew = await j("GET", "/api/auth/me", undefined, newToken);
    check("B13 fresh reset session works", meNew.status === 200 && meNew.data.user?.name === "ForgotTest");

    const log = fs.readFileSync(path.join(tmp, "server", "data", "security.log"), "utf8");
    check("B14 reset event in security log", log.includes("auth.password_reset_forgot"));

    // Rate limit: 5 failures on a fresh name, then the 6th is locked.
    for (let i = 0; i < 5; i++) {
      const r = await j("POST", "/api/auth/reset-password", { name: "BruteTest", newPassword: "newpass123", confirmed: true });
      if (r.status !== 401) check(`B15.${i} failed reset ${i + 1} is 401`, false, `got ${r.status}`);
    }
    const locked = await j("POST", "/api/auth/reset-password", { name: "BruteTest", newPassword: "newpass123", confirmed: true });
    check("B15 six failed resets lock the name (429)", locked.status === 429);
  }
} catch (e) {
  check("B live test ran without harness error", false, String(e && e.message || e));
} finally {
  if (server) { try { server.kill("SIGKILL"); } catch { /* already dead */ } }
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
}

console.log(`\nforgot-password: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
