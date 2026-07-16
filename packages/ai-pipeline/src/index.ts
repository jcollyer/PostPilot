// Config
export {
  isAiConfigured,
  getOpenAI,
  VISION_MODEL,
  TRANSCRIBE_MODEL,
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
} from './config';

// Orchestration
export { processVideo, type ProcessResult } from './pipeline';
export { processImage } from './pipeline-image';
export { processPending, processUploadSession } from './batch';

// pgvector helpers (reused by the queue's smart ordering in Chunk 6)
export {
  toVectorLiteral,
  writeEmbedding,
  findSimilarByEmbedding,
  type SimilarVideo,
} from './vectors';

// Perceptual hash helpers
export { dHashFromGray9x8, hammingDistanceHex, phashSimilarity } from './phash';

// Pre-flight size/duration guards (skip media that would OOM the worker)
export {
  checkVideoLimits,
  checkImageLimits,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_DURATION_SEC,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_PIXELS,
} from './limits';
