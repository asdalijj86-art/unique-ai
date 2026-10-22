/**
 * Document → PDF, fully client-side (CV / invoice / assignment tools).
 *
 * Why rasterize? The document tools build standalone HTML with Urdu
 * (Nastaleeq/RTL) text. A text-layer PDF library cannot shape Urdu —
 * the letters would come out disconnected. So the document is rendered
 * in a hidden iframe (the browser paints the text itself, exactly as
 * on screen), rasterized with html2canvas, and the raster is packed
 * into A4 pages with pdf-lib (already a project dependency). The
 * result is a REAL .pdf file download on Android Chrome and ChromeOS
 * alike — no server, no external file hosting, no print dialog.
 *
 * The module also remembers the LAST generated document (localStorage)
 * so the chat can answer «ڈاؤن لوڈ لنک دو» / «PDF دو» with an actual
 * download card instead of the old dead end ("permission نہیں ہے").
 */

export type SavedDocument = {
  kind: 'resume' | 'invoice' | 'assignment';
  /** Human title shown on the chat download card, e.g. «ریزیومے — احمد». */
  title: string;
  /** Download filename, ending in .pdf. */
  filename: string;
  /** The standalone document HTML exactly as the tool built it. */
  html: string;
  savedAt: number;
};

const LAST_DOC_KEY = 'unique-ai-last-document';

export function saveLastDocument(doc: Omit<SavedDocument, 'savedAt'>): void {
  try {
    const full: SavedDocument = { ...doc, savedAt: Date.now() };
    localStorage.setItem(LAST_DOC_KEY, JSON.stringify(full));
  } catch {
    // Storage full/blocked — the in-tool download buttons still work;
    // only the chat shortcut loses its memory.
  }
}

export function loadLastDocument(): SavedDocument | null {
  try {
    const raw = localStorage.getItem(LAST_DOC_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedDocument;
    if (!parsed || typeof parsed.html !== 'string' || !parsed.html) return null;
    return parsed;
  } catch {
    return null;
  }
}

// A4 at CSS 96dpi and in PDF points.
const PAGE_W_PX = 794;
const PAGE_W_PT = 595.28;
const PAGE_H_PT = 841.89;

/**
 * Render a standalone HTML document and pack it into a PDF blob.
 * Rejects on failure so callers can fall back to the HTML download.
 */
export async function documentHtmlToPdfBlob(html: string): Promise<Blob> {
  const { default: html2canvas } = await import('html2canvas');
  const { PDFDocument } = await import('pdf-lib');

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${PAGE_W_PX}px;height:600px;border:0;background:#ffffff;`;
  iframe.srcdoc = html;
  document.body.appendChild(iframe);
  try {
    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => { if (!settled) { settled = true; resolve(); } };
      iframe.onload = done;
      setTimeout(done, 4000); // never hang the button on a stuck frame
    });
    const doc = iframe.contentDocument;
    if (!doc || !doc.body) throw new Error('document frame unavailable');
    // Grow the frame to the document's full height so the capture
    // below sees every page of the document, not just the first screen.
    const fullHeight = Math.max(doc.body.scrollHeight, doc.documentElement?.scrollHeight || 0);
    if (fullHeight > 0) iframe.style.height = `${fullHeight}px`;
    try { await doc.fonts?.ready; } catch { /* fonts are best-effort */ }

    const scale = 2; // ~192dpi — crisp print without a giant file
    const canvas = await html2canvas(doc.body, {
      scale,
      backgroundColor: '#ffffff',
      logging: false,
      width: PAGE_W_PX,
      windowWidth: PAGE_W_PX,
    });

    // Slice the tall raster into A4-proportioned pages.
    const slicePx = Math.floor(canvas.width * (PAGE_H_PT / PAGE_W_PT));
    const pdf = await PDFDocument.create();
    for (let y = 0; y < canvas.height; y += slicePx) {
      const h = Math.min(slicePx, canvas.height - y);
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = h;
      const ctx = pageCanvas.getContext('2d');
      if (!ctx) throw new Error('canvas unavailable');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, pageCanvas.width, h);
      ctx.drawImage(canvas, 0, -y);
      const dataUrl = pageCanvas.toDataURL('image/jpeg', 0.92);
      const bytes = Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(',') + 1)), (c) => c.charCodeAt(0));
      const img = await pdf.embedJpg(bytes);
      const page = pdf.addPage([PAGE_W_PT, PAGE_H_PT]);
      // Fill the page width; the height follows the slice's aspect
      // (a short final slice simply leaves white space below it).
      const drawH = PAGE_W_PT * (h / canvas.width);
      page.drawImage(img, { x: 0, y: PAGE_H_PT - drawH, width: PAGE_W_PT, height: drawH });
    }
    const pdfBytes = await pdf.save();
    return new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
  } finally {
    iframe.remove();
  }
}

/** Generate the PDF for `html` and trigger the browser download. */
export async function downloadDocumentPdf(html: string, filename: string): Promise<void> {
  const blob = await documentHtmlToPdfBlob(html);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
