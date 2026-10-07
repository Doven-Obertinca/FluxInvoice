import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import manifest from '../packages/einvoice/compliance/manifest.json';
const root = resolve(process.env.COMPLIANCE_HOME ?? '.local/compliance');
await mkdir(root, { recursive: true, mode: 0o700 });
for (const artifact of manifest.artifacts) {
  const file = resolve(root, artifact.name);
  let bytes: Buffer;
  try {
    bytes = await readFile(file);
  } catch {
    bytes = Buffer.alloc(0);
  }
  if (createHash('sha256').update(bytes).digest('hex') !== artifact.sha256) {
    const response = await fetch(artifact.url, {
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) throw new Error('Artifact download failed');
    bytes = Buffer.from(await response.arrayBuffer());
    if (createHash('sha256').update(bytes).digest('hex') !== artifact.sha256)
      throw new Error('Artifact checksum mismatch');
    await writeFile(file, bytes, { mode: 0o600 });
  }
}
await mkdir(resolve(root, 'rules'), { recursive: true });
execFileSync('unzip', [
  '-oq',
  resolve(root, 'bundle.zip'),
  '-d',
  resolve(root, 'rules'),
]);
for (const [file, sha] of Object.entries(manifest.rules)) {
  if (
    createHash('sha256')
      .update(await readFile(resolve(root, 'rules', file)))
      .digest('hex') !== sha
  )
    throw new Error('Ruleset checksum mismatch');
}
await writeFile(
  resolve(root, 'installation.json'),
  JSON.stringify(
    {
      profile: manifest.id,
      installedAt: new Date().toISOString(),
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      artifacts: manifest.artifacts.map((a) => ({
        name: a.name,
        sha256: a.sha256,
      })),
    },
    null,
    2,
  ),
  { mode: 0o600 },
);
console.log(`Verified ${manifest.id}; provide JAVA_BIN (Java 21 recommended).`);
