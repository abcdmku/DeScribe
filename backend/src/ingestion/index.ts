/**
 * Ingestion module exports.
 * These are exported for use by the backend API for querying.
 */

export { VectorStore, type VectorRecord, type VectorStoreOptions, type ProsodyData } from "./vectorStore.js";
export { createEmbeddingService, type EmbeddingService } from "./embeddings.js";
export { chunkText, type Chunk, type ChunkOptions } from "./chunker.js";
export { readDocument, isSupportedFile, getSupportedExtensions, type DocumentContent } from "./fileReader.js";
export {
  fetchYouTubeTranscript,
  groupSegmentsByProsody,
  extractVideoId,
  formatTimestamp,
  analyzeSentiment,
  type TranscriptSegment,
  type ProsodyMetrics,
  type EnrichedSegment,
  type YouTubeTranscriptResult,
  type ChunkWithAnalysis,
  type SentimentLabel,
  type SentimentResult,
} from "./youtubeTranscript.js";
export {
  analyzeSentiment as analyzeSentimentDirect,
  sentimentLabelToNumber,
  numberToSentimentLabel,
} from "./sentimentAnalyzer.js";
export {
  downloadAudio,
  checkYtDlp,
  cleanupAudio,
  type AudioDownloadResult,
} from "./audioDownloader.js";
export {
  extractAcousticFeatures,
  extractSegmentFeatures,
  checkOpenSmile,
  type AcousticFeatures,
  type SegmentAcousticFeatures,
} from "./opensmileAnalyzer.js";
