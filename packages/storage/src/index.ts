import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, open, link, unlink, lstat, chmod } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  GetBucketVersioningCommand,
  GetObjectLockConfigurationCommand,
  GetBucketEncryptionCommand,
} from '@aws-sdk/client-s3';
export const hashBytes = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');
export class ArchiveError extends Error {
  constructor(
    public readonly code:
      | 'ARCHIVE_UNAVAILABLE'
      | 'ARCHIVE_CONFIGURATION'
      | 'ARCHIVE_MISSING'
      | 'ARCHIVE_INTEGRITY',
  ) {
    super(code);
  }
}
export interface ArchivedObject {
  key: string;
  version: string;
  sha256: string;
  size: number;
  mode: 'LOCAL' | 'S3_OBJECT_LOCK';
}
export interface Archive {
  put(key: string, bytes: Buffer, retainUntil: Date): Promise<ArchivedObject>;
  get(key: string, version: string): Promise<Buffer>;
}
export function validateKey(key: string) {
  if (!/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9]{64}\.xml$/.test(key))
    throw new ArchiveError('ARCHIVE_CONFIGURATION');
}
export class LocalArchive implements Archive {
  constructor(private readonly root: string) {}
  private async file(key: string) {
    validateKey(key);
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    let path = resolve(this.root);
    if ((await lstat(path)).isSymbolicLink())
      throw new ArchiveError('ARCHIVE_CONFIGURATION');
    const segments = key.split('/');
    for (const segment of segments.slice(0, -1)) {
      path = resolve(path, segment);
      await mkdir(path, { recursive: true, mode: 0o700 });
      if ((await lstat(path)).isSymbolicLink())
        throw new ArchiveError('ARCHIVE_CONFIGURATION');
    }
    return resolve(path, segments.at(-1)!);
  }
  async put(
    key: string,
    bytes: Buffer,
    retainUntil: Date,
  ): Promise<ArchivedObject> {
    if (!Number.isFinite(retainUntil.getTime()))
      throw new ArchiveError('ARCHIVE_CONFIGURATION');
    const target = await this.file(key);
    const digest = hashBytes(bytes);
    if (!key.endsWith(`${digest}.xml`))
      throw new ArchiveError('ARCHIVE_INTEGRITY');
    const temp = resolve(dirname(target), `.${randomUUID()}.tmp`);
    const handle = await open(temp, 'wx', 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await link(temp, target);
      await chmod(target, 0o400);
    } catch (error) {
      if (!(
        error instanceof Error &&
        'code' in error &&
        error.code === 'EEXIST'
      ))
        throw new ArchiveError('ARCHIVE_UNAVAILABLE');
    } finally {
      await unlink(temp);
    }
    const stored = await this.get(key, digest);
    if (hashBytes(stored) !== digest)
      throw new ArchiveError('ARCHIVE_INTEGRITY');
    return {
      key,
      version: digest,
      sha256: digest,
      size: bytes.length,
      mode: 'LOCAL',
    };
  }
  async get(key: string, version: string) {
    let handle;
    try {
      handle = await open(
        await this.file(key),
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
      const stat = await handle.stat();
      if (stat.size > 2 * 1024 * 1024 || !stat.isFile())
        throw new ArchiveError('ARCHIVE_INTEGRITY');
      const bytes = await handle.readFile();
      if (hashBytes(bytes) !== version)
        throw new ArchiveError('ARCHIVE_INTEGRITY');
      return bytes;
    } catch (error) {
      if (error instanceof ArchiveError) throw error;
      throw new ArchiveError('ARCHIVE_MISSING');
    } finally {
      await handle?.close();
    }
  }
}
export class S3Archive implements Archive {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
    private readonly kmsKeyArn: string,
  ) {}
  private async configuration() {
    const [version, lock, encryption] = await Promise.all([
      this.client.send(
        new GetBucketVersioningCommand({ Bucket: this.bucket }),
        { abortSignal: AbortSignal.timeout(10000) },
      ),
      this.client.send(
        new GetObjectLockConfigurationCommand({ Bucket: this.bucket }),
        { abortSignal: AbortSignal.timeout(10000) },
      ),
      this.client.send(
        new GetBucketEncryptionCommand({ Bucket: this.bucket }),
        { abortSignal: AbortSignal.timeout(10000) },
      ),
    ]);
    if (
      version.Status !== 'Enabled' ||
      lock.ObjectLockConfiguration?.ObjectLockEnabled !== 'Enabled' ||
      !encryption.ServerSideEncryptionConfiguration?.Rules?.some(
        (r) => r.ApplyServerSideEncryptionByDefault?.SSEAlgorithm === 'aws:kms',
      )
    )
      throw new ArchiveError('ARCHIVE_CONFIGURATION');
  }
  async put(
    key: string,
    bytes: Buffer,
    retainUntil: Date,
  ): Promise<ArchivedObject> {
    validateKey(key);
    if (!Number.isFinite(retainUntil.getTime()) || retainUntil <= new Date())
      throw new ArchiveError('ARCHIVE_CONFIGURATION');
    const digest = hashBytes(bytes);
    if (!key.endsWith(`${digest}.xml`))
      throw new ArchiveError('ARCHIVE_INTEGRITY');
    await this.configuration();
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: bytes,
          ContentType: 'application/xml',
          ChecksumSHA256: Buffer.from(digest, 'hex').toString('base64'),
          Metadata: { sha256: digest },
          IfNoneMatch: '*',
          ServerSideEncryption: 'aws:kms',
          SSEKMSKeyId: this.kmsKeyArn,
          ObjectLockMode: 'COMPLIANCE',
          ObjectLockRetainUntilDate: retainUntil,
        }),
        { abortSignal: AbortSignal.timeout(20000) },
      );
    } catch (error) {
      if (!(
        error instanceof Error &&
        'name' in error &&
        error.name === 'PreconditionFailed'
      ))
        throw new ArchiveError('ARCHIVE_UNAVAILABLE');
    }
    const head = await this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      { abortSignal: AbortSignal.timeout(10000) },
    );
    if (
      !head.VersionId ||
      head.Metadata?.sha256 !== digest ||
      head.ContentLength !== bytes.length ||
      head.ObjectLockMode !== 'COMPLIANCE' ||
      !head.ObjectLockRetainUntilDate ||
      head.ObjectLockRetainUntilDate < retainUntil ||
      head.ServerSideEncryption !== 'aws:kms' ||
      head.SSEKMSKeyId !== this.kmsKeyArn
    )
      throw new ArchiveError('ARCHIVE_INTEGRITY');
    return {
      key,
      version: head.VersionId,
      sha256: digest,
      size: bytes.length,
      mode: 'S3_OBJECT_LOCK',
    };
  }
  async get(key: string, version: string) {
    validateKey(key);
    try {
      const result = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          VersionId: version,
        }),
        { abortSignal: AbortSignal.timeout(15000) },
      );
      if (
        !result.Body ||
        !result.ContentLength ||
        result.ContentLength > 2 * 1024 * 1024
      )
        throw new ArchiveError('ARCHIVE_INTEGRITY');
      const reader = result.Body.transformToWebStream().getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 2 * 1024 * 1024)
            throw new ArchiveError('ARCHIVE_INTEGRITY');
          chunks.push(chunk.value);
        }
      } finally {
        await reader.cancel();
        reader.releaseLock();
      }
      if (size !== result.ContentLength)
        throw new ArchiveError('ARCHIVE_INTEGRITY');
      return Buffer.concat(chunks, size);
    } catch (error) {
      if (error instanceof ArchiveError) throw error;
      throw new ArchiveError('ARCHIVE_MISSING');
    }
  }
}
