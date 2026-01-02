#!/usr/bin/env node
/**
 * Query and display ingested data from the vector database.
 */

import "dotenv/config";
import { program } from "commander";
import { connect } from "@lancedb/lancedb";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { VECTOR_INDEX_DIR, VECTOR_COLLECTION } from "@describe/shared";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "../..");

interface QueryOptions {
  limit: number;
  source?: string;
  showVector: boolean;
  format: "table" | "json" | "detailed";
}

async function queryDatabase(options: QueryOptions) {
  const dbDir = resolve(PROJECT_ROOT, VECTOR_INDEX_DIR);

  console.log(`Opening database: ${dbDir}`);
  console.log(`Collection: ${VECTOR_COLLECTION}\n`);

  const db = await connect(dbDir);
  const tableNames = await db.tableNames();

  if (!tableNames.includes(VECTOR_COLLECTION)) {
    console.log("No data found. Run ingestion first:");
    console.log("  pnpm ingest -y 'https://youtube.com/watch?v=VIDEO_ID'");
    return;
  }

  const table = await db.openTable(VECTOR_COLLECTION);
  const count = await table.countRows();
  console.log(`Total records: ${count}\n`);

  // Build query
  let query = table.query();

  if (options.source) {
    query = query.where(`source LIKE '%${options.source}%'`);
  }

  const rows = await query.limit(options.limit).toArray();

  if (rows.length === 0) {
    console.log("No matching records found.");
    return;
  }

  if (options.format === "json") {
    // JSON output
    const output = rows.map((row: Record<string, unknown>) => {
      if (!options.showVector) {
        const { vector, ...rest } = row;
        return rest;
      }
      return row;
    });
    console.log(JSON.stringify(output, null, 2));
  } else if (options.format === "detailed") {
    // Detailed output
    for (const row of rows as Record<string, unknown>[]) {
      console.log("═".repeat(60));
      console.log(`ID: ${row.id}`);
      console.log(`Source: ${row.source} (${row.source_type})`);
      console.log(`Chunk: ${row.chunk_index}`);
      console.log(`Text: ${(row.text as string)?.substring(0, 200)}...`);

      if (row.prosody_start_time !== undefined) {
        console.log(`\nTiming: ${formatTime(row.prosody_start_time as number)} - ${formatTime(row.prosody_end_time as number)}`);
      }

      if (row.prosody_wpm) {
        console.log(`\nText Prosody:`);
        console.log(`  WPM: ${row.prosody_wpm}`);
        console.log(`  Speed: ${row.prosody_speed}x`);
        console.log(`  Emphasis: ${row.prosody_emphasis}`);
        console.log(`  Pauses: ${row.prosody_pauses}`);
      }

      if (row.acoustic_pitch_mean) {
        console.log(`\nAcoustic Features:`);
        console.log(`  Pitch: ${row.acoustic_pitch_mean}Hz (±${row.acoustic_pitch_std})`);
        console.log(`  Loudness: ${row.acoustic_loudness_mean} (±${row.acoustic_loudness_std})`);
        console.log(`  Jitter: ${row.acoustic_jitter}`);
        console.log(`  Shimmer: ${row.acoustic_shimmer}`);
        console.log(`  HNR: ${row.acoustic_hnr}`);
      }

      if (row.sentiment) {
        console.log(`\nSentiment: ${row.sentiment} (${row.sentiment_score})`);
      }

      if (row.audio_path) {
        console.log(`\nAudio: ${row.audio_path}`);
      }

      console.log("");
    }
  } else {
    // Table output
    console.log("Source".padEnd(25) + "Chunk".padEnd(8) + "Sentiment".padEnd(12) + "WPM".padEnd(8) + "Text Preview");
    console.log("-".repeat(100));

    for (const row of rows as Record<string, unknown>[]) {
      const source = String(row.source || "").substring(0, 23).padEnd(25);
      const chunk = String(row.chunk_index).padEnd(8);
      const sentiment = String(row.sentiment || "-").padEnd(12);
      const wpm = String(row.prosody_wpm || "-").padEnd(8);
      const text = (row.text as string)?.substring(0, 40) + "...";
      console.log(`${source}${chunk}${sentiment}${wpm}${text}`);
    }
  }
}

function formatTime(ms: number): string {
  if (!ms) return "0:00";
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}:${String(minutes % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

program
  .name("query-db")
  .description("Query and display ingested data")
  .option("-l, --limit <number>", "Max records to show", "10")
  .option("-s, --source <filter>", "Filter by source (e.g., 'youtube:abc123')")
  .option("--show-vector", "Include vector embeddings in output", false)
  .option("-f, --format <type>", "Output format: table, json, detailed", "table")
  .action(async (opts) => {
    try {
      await queryDatabase({
        limit: parseInt(opts.limit, 10),
        source: opts.source,
        showVector: opts.showVector,
        format: opts.format,
      });
    } catch (error) {
      console.error("Query failed:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();
