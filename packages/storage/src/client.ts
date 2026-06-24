import { S3Client } from '@aws-sdk/client-s3';

import { getStorageConfig } from './config';

let cached: S3Client | null = null;

/**
 * Lazily-constructed S3 client pointed at R2. Reused across calls (and, in dev,
 * across hot reloads) so we don't rebuild the signer on every request.
 */
export function getS3Client(): S3Client {
  if (cached) return cached;
  const cfg = getStorageConfig();
  cached = new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    // R2 (and most S3-compatible stores) require path-style addressing.
    forcePathStyle: true,
    // AWS SDK v3 (>=3.729) defaults to attaching a CRC32 checksum to uploads.
    // The checksum gets baked into presigned URLs over an empty body, and R2
    // rejects the mismatch with a 403. Only add checksums when a command
    // actually requires one (CompleteMultipartUpload), never on UploadPart/PutObject.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
  return cached;
}
