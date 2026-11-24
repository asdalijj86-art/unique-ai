// vault-test.mjs — tests the REAL client vault (secure-app-storage.ts)
// bundled with esbuild: PBKDF2 unlock, AES-GCM at-rest encryption,
// wrong-password lockout, and the legacy plaintext migration.
//
// Run: node scripts/vault-test.mjs   (from the repo root)
// It bundles the TS modules itself into a temp dir first.
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "unique-vault-test-"));
execSync(
  `"${path.join(repoRoot, "client", "node_modules", ".bin", "esbuild")}" "${path.join(repoRoot, "client", "src", "lib", "secure-app-storage.ts")}" --bundle --format=esm --outfile="${path.join(tmpDir, "vault-bundle.mjs")}" --log-level=error`,
  { stdio: "inherit" },
);
execSync(
  `"${path.join(repoRoot, "client", "node_modules", ".bin", "esbuild")}" "${path.join(repoRoot, "client", "src", "lib", "auth.ts")}" --bundle --format=esm --outfile="${path.join(tmpDir, "auth-bundle.mjs")}" --log-level=error`,
  { stdio: "inherit" },
);

// --- Minimal browser storage polyfills (before importing the bundle) ---
function makeStore() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    key: (i) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
    _keys: () => [...map.keys()],
    _raw: (k) => map.get(k),
  };
}
globalThis.localStorage = makeStore();
globalThis.sessionStorage = makeStore();
globalThis.window = globalThis;

const mod = await import(`file://${path.join(tmpDir, "vault-bundle.mjs")}`);
const auth = await import(`file://${path.join(tmpDir, "auth-bundle.mjs")}`);
const { secureAppStorage, unlockVault, lockVault, migrateLegacyMemory, migrationDone } = mod;

let pass = 0, fail = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Seed a logged-in owner session + vault salt (as /api/auth/login returns).
const user = { id: "owner-1", name: "Adeel", role: "owner", enabled: true, hasKey: false, keyLast4: null, createdAt: "", lastLoginAt: null };
auth.saveSession("tok", user, "AAAAAAAAAAAAAAAAAAAAAA=="); // 16 zero bytes b64
check("session seeded", auth.getAuthUser()?.id === "owner-1");

// 1. Unlock with the right password.
let ok = await unlockVault("ownerpass123");
check("unlock with right password", ok === true);

// 2. Write memory — the RAW stored value must NOT be plaintext.
secureAppStorage.setItem("unique-ai-notes", JSON.stringify([{ text: "میری پسند چائے ہے", id: "1" }]));
await sleep(300);
const rawKeys = globalThis.localStorage._keys().filter((k) => k.startsWith("unique-ai-vault-") && k !== "unique-ai-vault-salt");
check("vault key written", rawKeys.length === 1, rawKeys.join(","));
const rawVal = globalThis.localStorage._raw(rawKeys[0]);
check("stored value is encrypted, not plaintext", typeof rawVal === "string" && !rawVal.includes("چائے") && !rawVal.includes("میری پسند"), rawVal?.slice(0, 60));
check("sync read returns plaintext", secureAppStorage.getItem("unique-ai-notes")?.includes("چائے") === true);

// 3. Non-vault keys are namespaced per account, not bare.
secureAppStorage.setItem("unique-ai-settings", JSON.stringify({ voice: true }));
await sleep(50);
const acctKeys = globalThis.localStorage._keys().filter((k) => k.startsWith("unique-ai-acct-"));
check("settings namespaced per account", acctKeys.length === 1 && !globalThis.localStorage._raw("unique-ai-settings"), acctKeys.join(","));
check("settings read back", secureAppStorage.getItem("unique-ai-settings")?.includes("voice") === true);

// 4. Lock + wrong password: memory is unreadable (null), not empty-plaintext.
lockVault();
ok = await unlockVault("WRONGPASSWORD");
check("wrong password unlock returns true (key derives) but memory stays unreadable", ok === true);
check("wrong password -> memory null (locked, not empty)", secureAppStorage.getItem("unique-ai-notes") === null);
// Right password again restores it.
lockVault();
ok = await unlockVault("ownerpass123");
check("right password restores memory", ok === true && secureAppStorage.getItem("unique-ai-notes")?.includes("چائے") === true);

// 5. Legacy migration: seed plaintext memory, migrate, verify.
globalThis.localStorage.setItem("unique-ai-learnings", JSON.stringify([{ text: "سیکھی ہوئی بات", kind: "fact" }]));
globalThis.localStorage.setItem("unique-ai-gemini-key", "AIzaLEGACYKEY1234567890");
const report = await migrateLegacyMemory();
check("migration moved the legacy learning", report.migrated >= 1, JSON.stringify(report));
check("plaintext learning key deleted", globalThis.localStorage.getItem("unique-ai-learnings") === null);
check("plaintext gemini key deleted", globalThis.localStorage.getItem("unique-ai-gemini-key") === null);
check("migrated learning readable from vault", secureAppStorage.getItem("unique-ai-learnings")?.includes("سیکھی ہوئی بات") === true);
check("migration flag set", migrationDone() === true);

// 6. Second migration is a no-op (idempotent).
const report2 = await migrateLegacyMemory();
check("second migration no-op", report2.migrated === 0, JSON.stringify(report2));

console.log(`\n${pass}/${pass + fail} checks passed.`);
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
process.exit(fail ? 1 : 0);
