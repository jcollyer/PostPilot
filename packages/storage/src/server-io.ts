import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

import { getS3Client } from './client';
import { getStorageConfig } from './config';

/**
 * Server-side object IO used by the worker / AI pipeline (never the browser).
 * The browser uploads with presigned URLs; here the trusted server reads the
 * source video and writes back generated artifacts (thumbnails, audio).
 */

/** Upload bytes directly (e.g. an extracted thumbnail frame). */
export async function putObject(params: {
  key: string;
  body: Buffer | Uint8Array | string;
  contentType?: string;
}): Promise<void> {
  const { bucket } = getStorageConfig();
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
    }),
  );
}

/**
 * Open a read stream over an object without materializing it in memory.
 *
 * Prefer this over `getObjectBuffer` for anything that pipes an object straight
 * somewhere else. `getObjectBuffer` collects every chunk and then concatenates
 * them, so peak memory is roughly twice the file size — and this library's
 * videos routinely run 150–400 MB (largest ~1 GB). On a small worker machine
 * that overruns the memory limit and the process is killed outright: no
 * exception to catch, no error to record, the run simply vanishes mid-upload.
 *
 * `contentLength` comes from the object metadata, for callers that must declare
 * a length up front (an HTTP upload can't derive one from a stream).
 */
export async function getObjectStream(
  key: string,
): Promise<{ stream: Readable; contentLength: number | null }> {
  const { bucket } = getStorageConfig();
  const out = await getS3Client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = out.Body as Readable | undefined;
  if (!body) throw new Error(`Object ${key} has no body.`);
  return { stream: body, contentLength: out.ContentLength ?? null };
}

/**
 * Fetch an object's full bytes into memory.
 *
 * Only safe for objects known to be small (generated thumbnails, extracted
 * audio). Use `getObjectStream` for source media.
 */
export async function getObjectBuffer(key: string): Promise<Buffer> {
  const { bucket } = getStorageConfig();
  const out = await getS3Client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = out.Body as Readable | undefined;
  if (!body) throw new Error(`Object ${key} has no body.`);
  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
  }
  return Buffer.concat(chunks);
}

/** Stream an object to a local file path (used to feed ffmpeg). */
export async function downloadToFile(key: string, destPath: string): Promise<void> {
  const { bucket } = getStorageConfig();
  const out = await getS3Client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = out.Body as Readable | undefined;
  if (!body) throw new Error(`Object ${key} has no body.`);
  await pipeline(body, createWriteStream(destPath));
}
