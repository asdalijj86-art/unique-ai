// builder-gate-unit-test.mjs — tests registerBuilderRoutes' visibleJob
// gate directly: a job owned by account A is served to A (200) and
// denied to account B (404, no leak), and anonymous callers get 404.
import express from "express";
import { createBuilderService, registerBuilderRoutes } from "./builder.js";

const service = createBuilderService({
  // Stub generator: always fails (fake key). The job record still
  // exists with its ownerId — which is what the gate checks.
  generate: async () => { throw new Error("fake key — no real Gemini call"); },
});
const app = express();

// Fake token resolver: "tok-owner" -> owner, "tok-guest" -> guest.
const USERS = {
  "tok-owner": { id: "owner-1", name: "Adeel", role: "owner" },
  "tok-guest": { id: "guest-1", name: "Guest1", role: "guest" },
};
function resolveUserFromToken(token) {
  const user = USERS[token];
  return user ? { user } : null;
}
registerBuilderRoutes(app, service, { resolveUserFromToken });

const server = app.listen(0);
await new Promise((r) => server.once("listening", r));
const BASE = `http://127.0.0.1:${server.address().port}`;

let pass = 0, fail = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
}

// A job owned by the owner (fake key — the background run fails, but
// the record exists with ownerId, which is what the gate checks).
const job = service.startBuild({
  description: "test app",
  title: "test app",
  kind: "app",
  lang: "ur",
  apiKey: "FAKE",
  ownerId: "owner-1",
});
// A job owned by the guest.
const guestJob = service.startBuild({
  description: "guest app",
  title: "guest app",
  kind: "app",
  lang: "ur",
  apiKey: "FAKE",
  ownerId: "guest-1",
});
// A legacy job with no owner (pre-upgrade): owner-only by the fallback.
const legacyJob = service.startBuild({
  description: "legacy app",
  title: "legacy app",
  kind: "app",
  lang: "ur",
  apiKey: "FAKE",
});

async function get(p, token) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${p}`, { headers });
  return { status: res.status, text: await res.text() };
}

let r = await get(`/api/build/status/${job.id}`, "tok-owner");
check("owner sees own job", r.status === 200, `got ${r.status}`);
r = await get(`/api/build/status/${job.id}`, "tok-guest");
check("guest denied owner's job (404)", r.status === 404, `got ${r.status}`);
r = await get(`/api/build/status/${job.id}`);
check("anonymous denied (404)", r.status === 404, `got ${r.status}`);
r = await get(`/api/build/status/${guestJob.id}`, "tok-guest");
check("guest sees own job", r.status === 200, `got ${r.status}`);
r = await get(`/api/build/status/${guestJob.id}`, "tok-owner");
check("owner denied guest's job (404)", r.status === 404, `got ${r.status}`);
r = await get(`/api/build/status/${legacyJob.id}`, "tok-owner");
check("owner sees legacy (no-owner) job", r.status === 200, `got ${r.status}`);
r = await get(`/api/build/status/${legacyJob.id}`, "tok-guest");
check("guest denied legacy job (404)", r.status === 404, `got ${r.status}`);
r = await get(`/apps/${job.id}?t=tok-guest`);
check("guest denied /apps/:id (404)", r.status === 404, `got ${r.status}`);
r = await get(`/apps/${job.id}`);
check("anonymous denied /apps/:id (404)", r.status === 404, `got ${r.status}`);
r = await get(`/apps/${job.id}?t=tok-owner`);
check("owner reaches own /apps/:id (failed-job message, not denial)", r.status === 404 && r.text.includes("بن نہیں سکی"), `got ${r.status} ${r.text.slice(0, 60)}`);

server.close();
console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail ? 1 : 0);
