// Separate bounded child; no page rendering, active content, URL loading or OCR.
import { readFile } from 'node:fs/promises';
console.log = console.warn = console.info = () => {};
const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
try {
  const data = new Uint8Array(await readFile(process.argv[2]));
  const task = getDocument({
    data,
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
    stopAtErrors: true,
    maxImageSize: 1,
  });
  const pdf = await task.promise;
  try {
    const attachments = await pdf.getAttachments();
    const candidates = Array.from(attachments?.entries() ?? []).filter(
      ([, a]) =>
        /^(factur-x|zugferd-invoice|xrechnung)\.xml$/i.test(a.filename),
    );
    if (candidates.length !== 1)
      throw new Error('PDF_XML_MISSING_OR_AMBIGUOUS');
    const bytes = await pdf.getAttachmentContent(candidates[0][0]);
    if (bytes.length > 2 * 1024 * 1024) throw new Error('XML_TOO_LARGE');
    process.stdout.write(
      JSON.stringify({ xml: Buffer.from(bytes).toString('base64') }),
    );
  } finally {
    await task.destroy();
  }
} catch {
  process.exitCode = 1;
}
