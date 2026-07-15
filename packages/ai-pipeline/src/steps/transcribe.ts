import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { toFile } from 'openai';

import { getOpenAI, TRANSCRIBE_MODEL } from '../config';
import { extractAudio } from '../ffmpeg';
import type { MediaInfo } from '../ffmpeg';

/**
 * Transcribe a video's speech with Whisper. Returns null when the clip has no
 * audio track (common for drone/B-roll) — the rest of the pipeline degrades
 * gracefully and leans on the visual frames instead.
 */
export async function transcribeVideo(params: {
  localPath: string;
  info: MediaInfo;
  tmpDir: string;
}): Promise<string | null> {
  if (!params.info.hasAudio) return null;

  const audioPath = join(params.tmpDir, 'audio.mp3');
  try {
    await extractAudio(params.localPath, audioPath);
  } catch {
    return null; // no usable audio
  }

  // Buffer the (small, mono 16kHz) audio into a replayable File. A raw
  // fs.ReadStream can only be consumed once, so the SDK's automatic retries
  // can't resend the body after a transient error (e.g. ECONNRESET) — the
  // stream is already drained. toFile() gives the retry a body to replay.
  const audio = await toFile(await readFile(audioPath), 'audio.mp3');
  const result = await getOpenAI().audio.transcriptions.create({
    file: audio,
    model: TRANSCRIBE_MODEL,
    response_format: 'text',
  });

  const text = typeof result === 'string' ? result : ((result as { text?: string }).text ?? '');
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
}
