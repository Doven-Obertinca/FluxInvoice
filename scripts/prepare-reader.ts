import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
// All runtime assets come from lockfile-integrity-pinned npm packages, never a CDN.
const root = resolve(import.meta.dirname, '..');
const destination = join(root, 'apps/web/public/reader');
await mkdir(destination, { recursive: true });
const entries: Record<string, string> = {};
async function copy(source: string, target: string) {
  const out = join(destination, target);
  await mkdir(resolve(out, '..'), { recursive: true });
  await cp(join(root, 'node_modules', source), out);
  entries[target] = createHash('sha256')
    .update(await readFile(out))
    .digest('hex');
}
await copy('tesseract.js/dist/worker.min.js', 'ocr/worker.min.js');
for (const file of await readdir(
  join(root, 'node_modules/tesseract.js-core'),
)) {
  if (/\.wasm(?:\.js)?$/.test(file))
    await copy(`tesseract.js-core/${file}`, `ocr/${file}`);
}
await copy(
  '@tesseract.js-data/deu/4.0.0_best_int/deu.traineddata.gz',
  'ocr/deu.traineddata.gz',
);
await copy('pdfjs-dist/build/pdf.worker.min.mjs', 'pdf/pdf.worker.min.mjs');
for (const dir of ['cmaps', 'standard_fonts', 'wasm']) {
  for (const file of await readdir(
    join(root, 'node_modules/pdfjs-dist', dir),
  )) {
    await copy(`pdfjs-dist/${dir}/${file}`, `pdf/${dir}/${file}`);
  }
}
for (const pkg of [
  'pdfjs-dist',
  'tesseract.js',
  'tesseract.js-core',
  '@tesseract.js-data/deu',
]) {
  const files = await readdir(join(root, 'node_modules', pkg));
  for (const file of files.filter((name) => /^license/i.test(name)))
    await copy(
      `${pkg}/${file}`,
      `licenses/${pkg.replaceAll('/', '-')}-${file}`,
    );
}
await writeFile(
  join(destination, 'manifest.json'),
  JSON.stringify(entries, null, 2) + '\n',
);
console.log('Local document-reader assets prepared.');
