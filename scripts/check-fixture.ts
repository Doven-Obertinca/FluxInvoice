import { writeFile } from 'node:fs/promises';
import { serializeUbl, toSemantic } from '@flux/einvoice';
import { localValidator } from '../packages/einvoice/src/validator';
import { fixture } from '../packages/einvoice/fixtures/supported';
const xml = serializeUbl(toSemantic(fixture, 'RE-2026-000001'));
await writeFile('.local/compliance/fixture.xml', xml);
const result = await localValidator().validate(xml);
console.log(JSON.stringify(result, null, 2));
if (!result.valid) process.exitCode = 1;
