import { it, expect } from 'vitest';
import { S3Archive, hashBytes } from '@flux/storage';
import { S3Client } from '@aws-sdk/client-s3';
const bytes = Buffer.from('<Invoice/>');
const hash = hashBytes(bytes);
const key = `00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002/${hash}.xml`;
const retain = new Date('2040-01-01T00:00:00Z');
const kms = 'arn:aws:kms:eu-central-1:123456789012:key/fake-test-only';
function client(overrides: Record<string, unknown> = {}) {
  const calls: { name: string; input: Record<string, unknown> }[] = [];
  const instance = {
    send: async (command: {
      constructor: { name: string };
      input: Record<string, unknown>;
    }) => {
      calls.push({ name: command.constructor.name, input: command.input });
      const responses: Record<string, unknown> = {
        GetBucketVersioningCommand: { Status: 'Enabled' },
        GetObjectLockConfigurationCommand: {
          ObjectLockConfiguration: { ObjectLockEnabled: 'Enabled' },
        },
        GetBucketEncryptionCommand: {
          ServerSideEncryptionConfiguration: {
            Rules: [
              {
                ApplyServerSideEncryptionByDefault: { SSEAlgorithm: 'aws:kms' },
              },
            ],
          },
        },
        PutObjectCommand: { VersionId: 'v1' },
        HeadObjectCommand: {
          VersionId: 'v1',
          Metadata: { sha256: hash },
          ContentLength: bytes.length,
          ObjectLockMode: 'COMPLIANCE',
          ObjectLockRetainUntilDate: retain,
          ServerSideEncryption: 'aws:kms',
          SSEKMSKeyId: kms,
        },
        ...overrides,
      };
      const result = responses[command.constructor.name];
      if (result instanceof Error) throw result;
      return result;
    },
  };
  return { client: instance as unknown as S3Client, calls };
}
it('S3 contract requires conditional encrypted writes and compliance retention', async () => {
  const mock = client();
  const archive = new S3Archive(mock.client, 'archive-test', kms);
  const result = await archive.put(key, bytes, retain);
  expect(result).toEqual({
    key,
    version: 'v1',
    sha256: hash,
    size: bytes.length,
    mode: 'S3_OBJECT_LOCK',
  });
  expect(
    mock.calls.find((c) => c.name === 'PutObjectCommand')?.input,
  ).toMatchObject({
    IfNoneMatch: '*',
    ServerSideEncryption: 'aws:kms',
    SSEKMSKeyId: kms,
    ObjectLockMode: 'COMPLIANCE',
    ObjectLockRetainUntilDate: retain,
  });
});
it.each([
  'GetBucketVersioningCommand',
  'GetObjectLockConfigurationCommand',
  'GetBucketEncryptionCommand',
])(
  'fails closed when %s does not confirm archive prerequisites',
  async (name) => {
    const mock = client({ [name]: {} });
    await expect(
      new S3Archive(mock.client, 'test', kms).put(key, bytes, retain),
    ).rejects.toMatchObject({ code: 'ARCHIVE_CONFIGURATION' });
    expect(mock.calls.some((c) => c.name === 'PutObjectCommand')).toBe(false);
  },
);
it('accepts duplicate writes only after verifying the existing locked object metadata', async () => {
  const error = new Error('duplicate');
  error.name = 'PreconditionFailed';
  const mock = client({ PutObjectCommand: error });
  expect(
    (await new S3Archive(mock.client, 'test', kms).put(key, bytes, retain))
      .version,
  ).toBe('v1');
  const invalid = client({
    PutObjectCommand: error,
    HeadObjectCommand: {
      VersionId: 'v1',
      Metadata: { sha256: hash },
      ContentLength: bytes.length,
    },
  });
  await expect(
    new S3Archive(invalid.client, 'test', kms).put(key, bytes, retain),
  ).rejects.toMatchObject({ code: 'ARCHIVE_INTEGRITY' });
});
it('rejects traversal and bytes that do not match the content-addressed key', async () => {
  const mock = client();
  const archive = new S3Archive(mock.client, 'test', kms);
  await expect(archive.put('../../secret', bytes, retain)).rejects.toThrow();
  await expect(
    archive.put(key, Buffer.from('different'), retain),
  ).rejects.toMatchObject({ code: 'ARCHIVE_INTEGRITY' });
  expect(mock.calls).toHaveLength(0);
});
