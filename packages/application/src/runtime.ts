import { resolve } from 'node:path';
import { S3Client } from '@aws-sdk/client-s3';
import {
  LocalArchive,
  S3Archive,
  ArchiveError,
  type Archive,
} from '@flux/storage';
import { KositValidator } from '../../einvoice/src/validator';
export function complianceRuntime(root: string): {
  archive: Archive;
  validator: KositValidator;
} {
  const home = resolve(
    process.env.COMPLIANCE_HOME ?? resolve(root, '.local/compliance'),
  );
  const production = ['production', 'staging'].includes(
    process.env.APP_ENV ?? '',
  );
  let archive: Archive;
  if (process.env.ARCHIVE_MODE === 'S3_OBJECT_LOCK') {
    const bucket = process.env.ARCHIVE_BUCKET,
      kms = process.env.ARCHIVE_KMS_KEY_ARN,
      region = process.env.AWS_REGION;
    if (!bucket || !kms || !region)
      throw new ArchiveError('ARCHIVE_CONFIGURATION');
    archive = new S3Archive(
      new S3Client({ region, maxAttempts: 2 }),
      bucket,
      kms,
    );
  } else {
    if (production) throw new ArchiveError('ARCHIVE_CONFIGURATION');
    archive = new LocalArchive(
      resolve(process.env.ARCHIVE_LOCAL_DIR ?? resolve(root, '.local/archive')),
    );
  }
  return {
    archive,
    validator: new KositValidator({
      home,
      java: process.env.JAVA_BIN ?? resolve(home, 'java-bin'),
    }),
  };
}
