// ── Minimal client-side JPEG → PDF packer ────────────────────────────
// Builds a valid multi-page PDF that embeds each page image as a full-bleed
// JPEG XObject, entirely in the browser — no external library. Intentionally
// basic (one raster image per page, no text layer, no compression beyond the
// JPEG's own) which is all a "photo catalog" export needs.

async function blobToUint8Array(blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * pages: [{ blob: Blob (image/jpeg), width: number, height: number }]
 * Returns a Blob (application/pdf).
 *
 * Object layout (per page i, 0-indexed):
 *   1            Catalog
 *   2            Pages
 *   3 + i*3      Page
 *   3 + i*3 + 1  Content stream ("draw the image full-bleed")
 *   3 + i*3 + 2  Image XObject (raw JPEG bytes, DCTDecode)
 */
export async function buildPdfFromJpegPages(pages) {
  const enc = new TextEncoder();
  const parts = []; // Uint8Array chunks, concatenated at the end
  const offsets = []; // byte offset of each object, index = object number (1-based)
  let pos = 0;

  const write = (bytes) => { parts.push(bytes); pos += bytes.length; };
  const writeText = (text) => write(enc.encode(text));
  const beginObj = (num) => { offsets[num] = pos; writeText(`${num} 0 obj\n`); };
  const endObj = () => writeText('endobj\n');

  writeText('%PDF-1.4\n');

  const n = pages.length;
  const pageObjNum = (i) => 3 + i * 3;
  const contentObjNum = (i) => 3 + i * 3 + 1;
  const imgObjNum = (i) => 3 + i * 3 + 2;
  const totalObjects = 2 + n * 3;

  // 1. Catalog
  beginObj(1);
  writeText('<< /Type /Catalog /Pages 2 0 R >>\n');
  endObj();

  // 2. Pages
  const kids = Array.from({ length: n }, (_, i) => `${pageObjNum(i)} 0 R`).join(' ');
  beginObj(2);
  writeText(`<< /Type /Pages /Kids [${kids}] /Count ${n} >>\n`);
  endObj();

  for (let i = 0; i < n; i++) {
    const { blob, width, height } = pages[i];

    // Page
    beginObj(pageObjNum(i));
    writeText(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] ` +
      `/Resources << /XObject << /Im0 ${imgObjNum(i)} 0 R >> >> ` +
      `/Contents ${contentObjNum(i)} 0 R >>\n`
    );
    endObj();

    // Content stream — scale the 1x1 image space to the full page and paint it.
    const content = `q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`;
    const contentBytes = enc.encode(content);
    beginObj(contentObjNum(i));
    writeText(`<< /Length ${contentBytes.length} >>\nstream\n`);
    write(contentBytes);
    writeText('\nendstream\n');
    endObj();

    // Image XObject — raw JPEG bytes embedded directly (DCTDecode = "this is
    // already a JPEG, don't re-encode").
    const imgBytes = await blobToUint8Array(blob);
    beginObj(imgObjNum(i));
    writeText(
      `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imgBytes.length} >>\nstream\n`
    );
    write(imgBytes);
    writeText('\nendstream\n');
    endObj();
  }

  // xref table
  const xrefStart = pos;
  writeText(`xref\n0 ${totalObjects + 1}\n`);
  writeText('0000000000 65535 f \n');
  for (let num = 1; num <= totalObjects; num++) {
    writeText(`${String(offsets[num]).padStart(10, '0')} 00000 n \n`);
  }
  writeText(`trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  return new Blob(parts, { type: 'application/pdf' });
}
