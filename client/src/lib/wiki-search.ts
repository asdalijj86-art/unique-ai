/**
 * Live search for Uniqa's own side browser (user order 2026-11-28) —
 * the app's EXISTING live-search path, the same one the agent work
 * screen uses (StonicFront AgentWorkView `searchWiki`): Wikipedia's
 * public OpenSearch API, which is CORS-enabled, so the browser calls
 * it directly with no server key and no extra backend.
 *
 * Real results only: on any failure (no internet, non-200, bad
 * shape) this THROWS and the caller shows the honest "no connection"
 * message — never an invented result. The server's own `webSearch`
 * is a stub since the 2026-10-31 tools deletion (server/index.js),
 * so there is no server search to reuse; this client-side path IS
 * the live search in this app.
 */

export type WikiResult = { title: string; desc: string; url: string };

export async function searchWiki(query: string): Promise<WikiResult[]> {
  const trimmed = String(query || '').trim();
  if (!trimmed) return [];
  const isUrdu = /[\u0600-\u06FF]/.test(trimmed);
  const lang = isUrdu ? 'ur' : 'en';
  const url =
    `https://${lang}.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(trimmed)}` +
    `&limit=6&namespace=0&format=json&origin=*`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Wikipedia ${res.status}`);
  const data: unknown = await res.json();
  if (!Array.isArray(data) || !Array.isArray(data[1]) || !Array.isArray(data[2]) || !Array.isArray(data[3])) {
    return [];
  }
  const titles = data[1] as unknown[];
  const descs = data[2] as unknown[];
  const urls = data[3] as unknown[];
  return titles
    .map((t, i) => ({
      title: String(t ?? ''),
      desc: String(descs[i] ?? ''),
      url: String(urls[i] ?? ''),
    }))
    .filter((r) => r.title && r.url);
}
