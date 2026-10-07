import { writeFile } from 'node:fs/promises';
import { validCases } from '../packages/einvoice/fixtures/corpus';
import { toSemantic, serializeUbl } from '@flux/einvoice';
for (const [name, invoice] of Object.entries(validCases))
  await writeFile(
    `packages/einvoice/fixtures/golden/3.0.2/${name}.xml`,
    serializeUbl(toSemantic(invoice, 'RE-2026-000001')),
  );
