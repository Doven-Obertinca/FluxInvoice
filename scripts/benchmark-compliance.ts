import { writeFile } from 'node:fs/promises';
import { cpus, platform, arch } from 'node:os';
import { validCases } from '../packages/einvoice/fixtures/corpus';
import { toSemantic, serializeUbl, manifest } from '@flux/einvoice';
import { localValidator } from '../packages/einvoice/src/validator';
const validator = localValidator();
const durations: number[] = [];
const samples: {
  fixture: string;
  bytes: number;
  serializationMs: number;
  validationMs: number;
}[] = [];
for (let iteration = 0; iteration < 3; iteration++)
  for (const [name, invoice] of Object.entries(validCases)) {
    const started = performance.now();
    const bytes = serializeUbl(toSemantic(invoice, 'RE-2026-000001'));
    const serializationMs = performance.now() - started;
    const result = await validator.validate(bytes);
    if (!result.valid) throw new Error(`BENCHMARK_FIXTURE_FAILED:${name}`);
    samples.push({
      fixture: name,
      bytes: bytes.length,
      serializationMs: Math.round(serializationMs * 100) / 100,
      validationMs: result.durationMs,
    });
    durations.push(result.durationMs);
  }
const sorted = [...durations].sort((a, b) => a - b);
const result = {
  timestamp: new Date().toISOString(),
  platform: platform(),
  arch: arch(),
  cpu: cpus()[0]?.model,
  node: process.version,
  profile: manifest.id,
  samples,
  validation: {
    count: durations.length,
    p50Ms: sorted[Math.floor(sorted.length * 0.5)],
    p95Ms:
      sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)],
    maxMs: sorted.at(-1),
  },
  method:
    'Sequential fresh JVM per document; four fictional supported fixtures, three iterations; includes process startup, rule verification on first request and temp cleanup. Not a production capacity guarantee.',
};
await writeFile(
  'docs/COMPLIANCE-BENCHMARK.json',
  JSON.stringify(result, null, 2) + '\n',
);
console.log(JSON.stringify(result.validation));
