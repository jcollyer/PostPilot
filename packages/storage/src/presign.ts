import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { getS3Client } from './client';
import { getStorageConfig } from './config';

/** S3/R2 require every part except the last to be at least 5 MiB. */
const MIN_PART_SIZE = 5 * 1024 * 1024;
/** Default part size — bigger parts mean fewer round-trips for large videos. */
const DEFAULT_PART_SIZE = 16 * 1024 * 1024;
/** Hard ceiling imposed by the multipart spec. */
const MAX_PARTS = 10_000;

const DEFAULT_EXPIRY_SECONDS = 60 * 60; // 1 hour

export interface MultipartPlan {
  partSize: number;
  partCount: number;
}

/**
 * Pick a part size and part count for a file. Grows the part size when a file
 * is large enough that the default would exceed the 10k-part limit.
 */
export function planMultipart(fileSize: number): MultipartPlan {
  if (fileSize <= 0) return { partSize: MIN_PART_SIZE, partCount: 1 };

  let partSize = DEFAULT_PART_SIZE;
  if (Math.ceil(fileSize / partSize) > MAX_PARTS) {
    partSize = Math.ceil(fileSize / MAX_PARTS);
    // Round up to a whole MiB and never below the minimum.
    partSize = Math.max(MIN_PART_SIZE, Math.ceil(partSize / (1024 * 1024)) * 1024 * 1024);
  }
  const partCount = Math.max(1, Math.ceil(fileSize / partSize));
  return { partSize, partCount };
}

export interface PresignedPart {
  partNumber: number;
  url: string;
}

export interface CompletedPart {
  partNumber: number;
  etag: string;
}

/** Begin a multipart upload; returns the uploadId the client uploads against. */
export async function createMultipartUpload(params: {
  key: string;
  contentType?: string;
}): Promise<{ uploadId: string }> {
  const { bucket } = getStorageConfig();
  const out = await getS3Client().send(
    new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: params.key,
      ContentType: params.contentType,
    }),
  );
  if (!out.UploadId) throw new Error('R2 did not return an UploadId.');
  return { uploadId: out.UploadId };
}

/**
 * Presign a PUT URL for each part. The browser PUTs the bytes for part N to
 * `urls[N-1]` and reads the `ETag` response header (the bucket CORS policy must
 * expose `ETag`), then sends the collected etags to {@link completeMultipart}.
 */
export async function presignUploadParts(params: {
  key: string;
  uploadId: string;
  partCount: number;
  expiresIn?: number;
}): Promise<PresignedPart[]> {
  const { bucket } = getStorageConfig();
  const client = getS3Client();
  const expiresIn = params.expiresIn ?? DEFAULT_EXPIRY_SECONDS;

  const parts = await Promise.all(
    Array.from({ length: params.partCount }, (_, i) => i + 1).map(async (partNumber) => {
      const url = await getSignedUrl(
        client,
        new UploadPartCommand({
          Bucket: bucket,
          Key: params.key,
          UploadId: params.uploadId,
          PartNumber: partNumber,
        }),
        { expiresIn },
      );
      return { partNumber, url };
    }),
  );
  return parts;
}

/** Finalize a multipart upload once every part has been uploaded. */
export async function completeMultipart(params: {
  key: string;
  uploadId: string;
  parts: CompletedPart[];
}): Promise<void> {
  const { bucket } = getStorageConfig();
  const ordered = [...params.parts].sort((a, b) => a.partNumber - b.partNumber);
  await getS3Client().send(
    new CompleteMultipartUploadCommand({
      Bucket: bucket,
      Key: params.key,
      UploadId: params.uploadId,
      MultipartUpload: {
        Parts: ordered.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
      },
    }),
  );
}

/** Abort an in-flight multipart upload (e.g. the client gave up). */
export async function abortMultipart(params: { key: string; uploadId: string }): Promise<void> {
  const { bucket } = getStorageConfig();
  await getS3Client().send(
    new AbortMultipartUploadCommand({
      Bucket: bucket,
      Key: params.key,
      UploadId: params.uploadId,
    }),
  );
}

/**
 * Presign a single PUT for a small object (cover images, thumbnails). The
 * client PUTs the bytes directly; no multipart bookkeeping needed.
 */
export async function presignPut(params: {
  key: string;
  contentType?: string;
  expiresIn?: number;
}): Promise<{ url: string }> {
  const { bucket } = getStorageConfig();
  const url = await getSignedUrl(
    getS3Client(),
    new PutObjectCommand({
      Bucket: bucket,
      Key: params.key,
      ContentType: params.contentType,
    }),
    { expiresIn: params.expiresIn ?? DEFAULT_EXPIRY_SECONDS },
  );
  return { url };
}

/** Delete a single object (ignores "not found"). */
export async function deleteObject(key: string): Promise<void> {
  const { bucket } = getStorageConfig();
  await getS3Client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/**
 * Delete every object under a prefix — used to clean up a whole video folder
 * (source + cover + thumbnails) when a video is removed.
 */
export async function deletePrefix(prefix: string): Promise<void> {
  const { bucket } = getStorageConfig();
  const client = getS3Client();
  let continuationToken: string | undefined;

  do {
    const listed = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix.replace(/\/?$/, '/'),
        ContinuationToken: continuationToken,
      }),
    );
    const objects = (listed.Contents ?? [])
      .map((o) => o.Key)
      .filter((k): k is string => Boolean(k));

    if (objects.length > 0) {
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: objects.map((Key) => ({ Key })), Quiet: true },
        }),
      );
    }
    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (continuationToken);
}
