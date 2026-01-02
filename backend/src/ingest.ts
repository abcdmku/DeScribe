#!/usr/bin/env node
/**
 * Document ingestion CLI script.
 * Reads documents from a data directory or YouTube URLs, chunks them,
 * generates embeddings, and stores them in a LanceDB vector database.
 */

import "dotenv/config";
import { program } from "commander";
import { glob } from "glob";
import { dirname, relative, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "../..");

import {
  VECTOR_INDEX_DIR,
  VECTOR_COLLECTION,
  EMBEDDING_MODEL,
} from "@describe/shared";
import { chunkText, Chunk } from "./ingestion/chunker.js";
import {
  readDocument,
  isSupportedFile,
  getSupportedExtensions,
} from "./ingestion/fileReader.js";
import { VectorStore, VectorRecord } from "./ingestion/vectorStore.js";
import { createEmbeddingService } from "./ingestion/embeddings.js";
import {
  fetchYouTubeTranscript,
  groupSegmentsByProsody,
  formatTimestamp,
  extractVideoId,
} from "./ingestion/youtubeTranscript.js";
import {
  downloadAudio,
  checkYtDlp,
  cleanupAudio,
} from "./ingestion/audioDownloader.js";
import {
  extractAcousticFeatures,
  checkOpenSmile,
  type AcousticFeatures,
} from "./ingestion/opensmileAnalyzer.js";

interface IngestOptions {
  dataDir: string;
  dbDir: string;
  collection: string;
  reset: boolean;
  batchSize: number;
  youtube: string[];
  audioDir: string;
  keepAudio: boolean;
  skipAudio: boolean;
}

interface IngestStats {
  filesDiscovered: number;
  filesProcessed: number;
  filesSkipped: number;
  youtubeProcessed: number;
  youtubeSkipped: number;
  chunksCreated: number;
  chunksIndexed: number;
  elapsedMs: number;
}

interface ChunkRecord {
  text: string;
  source: string;
  sourceType: "file" | "youtube";
  chunkIndex: number;
  startChar?: number;
  endChar?: number;
  prosody?: {
    wpm?: number;
    speed?: number;
    emphasis?: number;
    pauses?: number;
    startTime?: number;
    endTime?: number;
  };
  sentiment?: {
    label: string;
    score: number;
  };
  acoustic?: AcousticFeatures;
  audioPath?: string;
}

async function discoverFiles(dataDir: string): Promise<string[]> {
  const extensions = getSupportedExtensions();
  const patterns = extensions.map((ext) => `**/*${ext}`);

  const files: string[] = [];
  for (const pattern of patterns) {
    const matches = await glob(pattern, {
      cwd: dataDir,
      absolute: true,
      nodir: true,
    });
    files.push(...matches);
  }

  return files.filter(isSupportedFile);
}

async function processFile(
  filePath: string,
  dataDir: string
): Promise<{ chunks: Chunk[]; source: string } | null> {
  try {
    const { text } = await readDocument(filePath);
    const chunks = chunkText(text);
    const source = relative(dataDir, filePath).replace(/\\/g, "/");
    return { chunks, source };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`  Warning: Failed to process ${filePath}: ${message}`);
    return null;
  }
}

async function processYouTubeUrl(
  url: string,
  options: { audioDir: string; skipAudio: boolean; keepAudio: boolean }
): Promise<ChunkRecord[] | null> {
  try {
    const videoId = extractVideoId(url);
    if (!videoId) {
      console.warn(`  Warning: Invalid YouTube URL: ${url}`);
      return null;
    }

    console.log(`  Fetching transcript for ${videoId}...`);
    const transcript = await fetchYouTubeTranscript(url);

    console.log(`    Video: ${transcript.videoUrl}`);
    console.log(`    Duration: ${formatTimestamp(transcript.totalDuration)}`);
    console.log(`    Average WPM: ${transcript.averageWpm}`);
    console.log(`    Segments: ${transcript.segments.length}`);

    // Download audio and extract acoustic features if enabled
    let acousticFeatures: AcousticFeatures | undefined;
    let audioPath: string | undefined;

    if (!options.skipAudio) {
      try {
        const audioResult = await downloadAudio(videoId, options.audioDir);
        audioPath = options.keepAudio ? audioResult.audioPath : undefined;

        // Try to extract acoustic features with OpenSMILE
        const hasOpenSmile = await checkOpenSmile();
        if (hasOpenSmile) {
          console.log(`    Extracting acoustic prosody features...`);
          const features = await extractAcousticFeatures(audioResult.audioPath);
          if (features) {
            acousticFeatures = features;
            console.log(`    Pitch: ${features.pitchMean.toFixed(1)}Hz (±${features.pitchStd.toFixed(1)})`);
            console.log(`    Loudness: ${features.loudnessMean.toFixed(2)} (±${features.loudnessStd.toFixed(2)})`);
          } else {
            console.log(`    Acoustic analysis returned no data`);
          }
        } else {
          console.log(`    OpenSMILE not available - skipping acoustic analysis`);
        }

        // Clean up audio if not keeping
        if (!options.keepAudio) {
          await cleanupAudio(audioResult.audioPath);
        }
      } catch (audioErr) {
        const msg = audioErr instanceof Error ? audioErr.message : String(audioErr);
        console.warn(`    Warning: Audio processing failed: ${msg}`);
      }
    }

    // Group segments by prosody (natural breaks, pauses)
    const chunks = groupSegmentsByProsody(transcript.segments, {
      maxChunkDuration: 60000, // 1 minute max per chunk
      pauseThreshold: 1000, // 1 second pause = natural break
      targetWordCount: 150,
    });

    console.log(`    Chunks created: ${chunks.length}`);

    // Convert to ChunkRecords with prosody, sentiment, and acoustic data
    const records: ChunkRecord[] = chunks.map((chunk, index) => ({
      text: chunk.text,
      source: `youtube:${videoId}`,
      sourceType: "youtube" as const,
      chunkIndex: index,
      prosody: {
        wpm: transcript.averageWpm,
        speed: chunk.avgSpeed,
        emphasis: chunk.avgEmphasis,
        pauses: chunk.significantPauses,
        startTime: chunk.startTime,
        endTime: chunk.endTime,
      },
      sentiment: {
        label: chunk.sentiment,
        score: chunk.sentimentScore,
      },
      acoustic: acousticFeatures,
      audioPath,
    }));

    return records;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`  Warning: Failed to process YouTube URL ${url}: ${message}`);
    return null;
  }
}

async function ingest(options: IngestOptions): Promise<IngestStats> {
  const startTime = Date.now();
  const stats: IngestStats = {
    filesDiscovered: 0,
    filesProcessed: 0,
    filesSkipped: 0,
    youtubeProcessed: 0,
    youtubeSkipped: 0,
    chunksCreated: 0,
    chunksIndexed: 0,
    elapsedMs: 0,
  };

  console.log("Starting document ingestion...");
  console.log(`  Data directory: ${options.dataDir}`);
  console.log(`  Database directory: ${options.dbDir}`);
  console.log(`  Collection: ${options.collection}`);
  console.log(`  Reset mode: ${options.reset}`);
  console.log(`  Embedding model: ${EMBEDDING_MODEL}`);
  console.log(`  YouTube URLs: ${options.youtube.length}`);
  console.log(`  Audio directory: ${options.audioDir}`);
  console.log(`  Keep audio files: ${options.keepAudio}`);
  console.log(`  Skip audio analysis: ${options.skipAudio}`);

  // Check for yt-dlp if processing YouTube URLs with audio
  if (options.youtube.length > 0 && !options.skipAudio) {
    const hasYtDlp = await checkYtDlp();
    if (!hasYtDlp) {
      console.log("\n  Warning: yt-dlp not found - audio download disabled");
      console.log("  Install: https://github.com/yt-dlp/yt-dlp#installation");
      options.skipAudio = true;
    }
  }
  console.log("");

  const allRecords: ChunkRecord[] = [];

  // Process files from data directory
  console.log("Discovering files...");
  const files = await discoverFiles(options.dataDir);
  stats.filesDiscovered = files.length;
  console.log(`  Found ${files.length} supported files`);

  if (files.length > 0) {
    console.log("\nProcessing files...");
    for (const filePath of files) {
      const result = await processFile(filePath, options.dataDir);
      if (result) {
        stats.filesProcessed++;
        for (const chunk of result.chunks) {
          allRecords.push({
            text: chunk.text,
            source: result.source,
            sourceType: "file",
            chunkIndex: chunk.chunkIndex,
            startChar: chunk.startChar,
            endChar: chunk.endChar,
          });
          stats.chunksCreated++;
        }
        console.log(
          `  Processed: ${result.source} (${result.chunks.length} chunks)`
        );
      } else {
        stats.filesSkipped++;
      }
    }
  }

  // Process YouTube URLs
  if (options.youtube.length > 0) {
    console.log("\nProcessing YouTube URLs...");
    for (const url of options.youtube) {
      const records = await processYouTubeUrl(url, {
        audioDir: options.audioDir,
        skipAudio: options.skipAudio,
        keepAudio: options.keepAudio,
      });
      if (records) {
        stats.youtubeProcessed++;
        for (const record of records) {
          allRecords.push(record);
          stats.chunksCreated++;
        }
      } else {
        stats.youtubeSkipped++;
      }
    }
  }

  if (allRecords.length === 0) {
    console.log("\nNo content to process.");
    stats.elapsedMs = Date.now() - startTime;
    return stats;
  }

  console.log(`\nTotal chunks to embed: ${allRecords.length}`);

  // Initialize services
  console.log("\nInitializing embedding service...");
  const embeddingService = createEmbeddingService();
  const vectorDimension = embeddingService.getDimension();
  console.log(`  Vector dimension: ${vectorDimension}`);

  console.log("\nInitializing vector store...");
  const vectorStore = new VectorStore({
    dbDir: options.dbDir,
    collection: options.collection,
  });
  await vectorStore.connect();
  await vectorStore.initTable(vectorDimension, options.reset);
  console.log("  Vector store ready");

  // Generate embeddings in batches
  console.log("\nGenerating embeddings...");
  const vectorRecords: VectorRecord[] = [];

  for (let i = 0; i < allRecords.length; i += options.batchSize) {
    const batch = allRecords.slice(i, i + options.batchSize);
    const texts = batch.map((r) => r.text);

    console.log(
      `  Embedding batch ${Math.floor(i / options.batchSize) + 1}/${Math.ceil(allRecords.length / options.batchSize)} (${batch.length} chunks)`
    );

    const embeddings = await embeddingService.embedTexts(texts);

    for (let j = 0; j < batch.length; j++) {
      const record = batch[j];
      vectorRecords.push({
        id: VectorStore.generateId(record.source, record.chunkIndex),
        text: record.text,
        vector: embeddings[j],
        source: record.source,
        source_type: record.sourceType,
        chunk_index: record.chunkIndex,
        start_char: record.startChar,
        end_char: record.endChar,
        // Text-based prosody fields
        prosody_wpm: record.prosody?.wpm,
        prosody_speed: record.prosody?.speed,
        prosody_emphasis: record.prosody?.emphasis,
        prosody_pauses: record.prosody?.pauses,
        prosody_start_time: record.prosody?.startTime,
        prosody_end_time: record.prosody?.endTime,
        // Acoustic prosody fields (from OpenSMILE)
        acoustic_pitch_mean: record.acoustic?.pitchMean,
        acoustic_pitch_std: record.acoustic?.pitchStd,
        acoustic_loudness_mean: record.acoustic?.loudnessMean,
        acoustic_loudness_std: record.acoustic?.loudnessStd,
        acoustic_jitter: record.acoustic?.jitter,
        acoustic_shimmer: record.acoustic?.shimmer,
        acoustic_hnr: record.acoustic?.hnr,
        acoustic_voiced_ratio: record.acoustic?.voicedFrameRatio,
        // Sentiment fields
        sentiment: record.sentiment?.label,
        sentiment_score: record.sentiment?.score,
        // Audio file reference
        audio_path: record.audioPath,
      });
    }
  }

  // Store in vector database
  console.log("\nStoring vectors in database...");
  await vectorStore.addRecords(vectorRecords);
  stats.chunksIndexed = vectorRecords.length;

  const totalCount = await vectorStore.count();
  console.log(`  Total records in database: ${totalCount}`);

  await vectorStore.close();

  stats.elapsedMs = Date.now() - startTime;
  return stats;
}

function printSummary(stats: IngestStats): void {
  console.log("\n" + "=".repeat(50));
  console.log("INGESTION COMPLETE");
  console.log("=".repeat(50));
  console.log(`Files discovered:    ${stats.filesDiscovered}`);
  console.log(`Files processed:     ${stats.filesProcessed}`);
  console.log(`Files skipped:       ${stats.filesSkipped}`);
  console.log(`YouTube processed:   ${stats.youtubeProcessed}`);
  console.log(`YouTube skipped:     ${stats.youtubeSkipped}`);
  console.log(`Chunks created:      ${stats.chunksCreated}`);
  console.log(`Chunks indexed:      ${stats.chunksIndexed}`);
  console.log(`Elapsed time:        ${(stats.elapsedMs / 1000).toFixed(2)}s`);
  console.log("=".repeat(50));
}

function collectYouTubeUrls(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

// CLI setup
program
  .name("ingest")
  .description("Ingest documents into the vector database")
  .option(
    "--data-dir <path>",
    "Source data directory",
    resolve(PROJECT_ROOT, "data")
  )
  .option(
    "--db-dir <path>",
    "Vector database directory",
    resolve(PROJECT_ROOT, VECTOR_INDEX_DIR)
  )
  .option("--collection <name>", "Collection/table name", VECTOR_COLLECTION)
  .option("--reset", "Rebuild index from scratch", false)
  .option("--batch-size <number>", "Batch size for embedding", "50")
  .option(
    "-y, --youtube <url>",
    "YouTube URL to ingest (can be used multiple times)",
    collectYouTubeUrls,
    []
  )
  .option(
    "--audio-dir <path>",
    "Directory to store audio files",
    resolve(PROJECT_ROOT, "data/audio")
  )
  .option("--keep-audio", "Keep downloaded audio files", false)
  .option("--skip-audio", "Skip audio download and acoustic analysis", false)
  .action(async (opts) => {
    try {
      const options: IngestOptions = {
        dataDir: resolve(opts.dataDir),
        dbDir: resolve(opts.dbDir),
        collection: opts.collection,
        reset: opts.reset,
        batchSize: parseInt(opts.batchSize, 10),
        youtube: opts.youtube,
        audioDir: resolve(opts.audioDir),
        keepAudio: opts.keepAudio,
        skipAudio: opts.skipAudio,
      };

      const stats = await ingest(options);
      printSummary(stats);
    } catch (error) {
      console.error(
        "Ingestion failed:",
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  });

program.parse();
