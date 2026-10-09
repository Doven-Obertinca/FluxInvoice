import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
export async function extractIncomingXml(
  bytes: Buffer,
  kind: 'xml' | 'pdf',
): Promise<Buffer> {
  if (kind === 'xml') return bytes;
  const dir = await mkdtemp(join(tmpdir(), 'flux-incoming-'));
  try {
    const input = join(dir, 'original.pdf');
    await writeFile(input, bytes, { mode: 0o600 });
    return await new Promise<Buffer>((done, reject) => {
      const child = spawn(
        process.execPath,
        [
          '--max-old-space-size=128',
          resolve('packages/incoming/src/pdf-child.mjs'),
          input,
        ],
        {
          stdio: ['ignore', 'pipe', 'ignore'],
          env: { PATH: process.env.PATH ?? '', NODE_ENV: 'production' },
        },
      );
      const chunks: Buffer[] = [];
      let size = 0;
      const timer = setTimeout(() => child.kill('SIGKILL'), 10000);
      child.stdout.on('data', (b: Buffer) => {
        size += b.length;
        if (size > 3 * 1024 * 1024) child.kill('SIGKILL');
        else chunks.push(b);
      });
      child.on('error', () => {
        clearTimeout(timer);
        reject(new Error('PDF_EXTRACTION_FAILED'));
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        try {
          if (code !== 0 || size > 3 * 1024 * 1024) throw new Error();
          const result = JSON.parse(Buffer.concat(chunks).toString()) as {
            xml: string;
          };
          const xml = Buffer.from(result.xml, 'base64');
          if (!xml.length || xml.length > 2 * 1024 * 1024) throw new Error();
          done(xml);
        } catch {
          reject(new Error('PDF_EXTRACTION_FAILED'));
        }
      });
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
