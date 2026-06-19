/**
 * Browser-side multipart upload helper. The server hands us a presigned PUT URL
 * per part; here we slice the file and PUT each part straight to storage,
 * reading back the ETag (the bucket CORS policy must expose `ETag`). The video
 * bytes never pass through the app server.
 */

export interface PresignedPart {
  partNumber: number;
  url: string;
}

export interface CompletedPart {
  partNumber: number;
  etag: string;
}

/** PUT one blob to a presigned URL with progress + cancellation, returns ETag. */
function putPart(
  url: string,
  body: Blob,
  onProgress: (loaded: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader('ETag');
        if (!etag) {
          reject(
            new Error(
              'Upload succeeded but the ETag header was not readable. ' +
                'Add `ETag` to the bucket CORS ExposeHeaders.',
            ),
          );
          return;
        }
        resolve(etag);
      } else {
        reject(new Error(`Upload failed for part (HTTP ${xhr.status}).`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload.'));
    xhr.onabort = () => reject(new DOMException('Upload aborted', 'AbortError'));

    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        return;
      }
      signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }

    xhr.send(body);
  });
}

/**
 * Upload every part of `file` to its presigned URL, reporting overall progress
 * (0..1). Resolves with the ETag for each part, ready for `completeUpload`.
 */
export async function uploadParts(params: {
  file: File;
  parts: PresignedPart[];
  partSize: number;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}): Promise<CompletedPart[]> {
  const { file, parts, partSize, onProgress, signal } = params;
  const completed: CompletedPart[] = [];
  const loadedPerPart = new Array<number>(parts.length).fill(0);

  const report = () => {
    if (!onProgress) return;
    const loaded = loadedPerPart.reduce((a, b) => a + b, 0);
    onProgress(Math.min(1, loaded / file.size));
  };

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    const start = i * partSize;
    const end = Math.min(start + partSize, file.size);
    const blob = file.slice(start, end);

    const etag = await putPart(
      part.url,
      blob,
      (loaded) => {
        loadedPerPart[i] = loaded;
        report();
      },
      signal,
    );
    loadedPerPart[i] = end - start;
    report();
    completed.push({ partNumber: part.partNumber, etag });
  }

  return completed;
}

/** PUT a single small object (cover image) to a presigned URL. */
export function putObject(url: string, body: Blob, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    if (body.type) xhr.setRequestHeader('Content-Type', body.type);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (HTTP ${xhr.status}).`));
    xhr.onerror = () => reject(new Error('Network error during upload.'));
    xhr.onabort = () => reject(new DOMException('Upload aborted', 'AbortError'));
    if (signal) signal.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(body);
  });
}

/** Human-friendly byte size. */
export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

/** mm:ss from seconds. */
export function formatDuration(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
