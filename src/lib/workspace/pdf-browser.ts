/** Loaded only after a user selects a PDF. The file never crosses a server's
 * request-size limit; extracted text is persisted in browser IndexedDB.
 */
export async function extractBrowserPdf(file: File) {
  if (file.size === 0) throw new Error("This PDF is empty. Choose another file.");
  if (file.size > 15 * 1024 * 1024) throw new Error("Choose a PDF smaller than 15 MB.");
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (!new TextDecoder().decode(bytes.slice(0, 5)).startsWith("%PDF")) {
    throw new Error("This file is not a PDF. Choose a file with a PDF text layer.");
  }
  // Hash before PDF.js can transfer/detach the binary buffer.
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const hash = Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, "0")).join("");
  const { getDocumentProxy } = await import("unpdf");
  let pdf;
  try {
    pdf = await getDocumentProxy(bytes);
  } catch {
    throw new Error("This PDF could not be opened. It may be password-protected or damaged.");
  }
  try {
    const count = Math.min(pdf.numPages, 500);
    const pages: Array<{ page: number; text: string }> = [];
    let clipped = pdf.numPages > count;
    for (let page = 1; page <= count; page++) {
      const source = await pdf.getPage(page);
      const content = await source.getTextContent();
      const text = content.items.map((item) => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join("")
        .replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").trim();
      if (text.length > 24000) clipped = true;
      pages.push({ page, text: text.slice(0, 24000) });
      source.cleanup();
    }
    if (!pages.some((page) => page.text.trim())) {
      throw new Error("This PDF has no selectable text. Scanned papers need OCR before you can capture passages.");
    }
    return { name: file.name.slice(0, 300), hash, pages, truncated: clipped };
  } finally {
    await pdf.loadingTask.destroy();
  }
}
