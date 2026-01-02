/**
 * Vector store wrapper for LanceDB.
 * Provides an interface for storing and querying document embeddings.
 */

import { connect, Table, Connection } from "@lancedb/lancedb";
import { VECTOR_COLLECTION, VECTOR_INDEX_DIR } from "@describe/shared";
import { createHash } from "crypto";

export interface ProsodyData {
  words_per_minute?: number;
  relative_speed?: number;
  emphasis_score?: number;
  significant_pauses?: number;
  start_time?: number;
  end_time?: number;
}

export interface VectorRecord {
  id: string;
  text: string;
  vector: number[];
  source: string;
  source_type: "file" | "youtube";
  chunk_index: number;
  start_char?: number;
  end_char?: number;
  // Text-based prosody fields (from caption timing)
  prosody_wpm?: number;
  prosody_speed?: number;
  prosody_emphasis?: number;
  prosody_pauses?: number;
  prosody_start_time?: number;
  prosody_end_time?: number;
  // Acoustic prosody fields (from OpenSMILE audio analysis)
  acoustic_pitch_mean?: number;
  acoustic_pitch_std?: number;
  acoustic_loudness_mean?: number;
  acoustic_loudness_std?: number;
  acoustic_jitter?: number;
  acoustic_shimmer?: number;
  acoustic_hnr?: number;
  acoustic_voiced_ratio?: number;
  // Sentiment fields
  sentiment?: string; // "positive" | "negative" | "neutral"
  sentiment_score?: number; // -1 to 1
  // Audio file reference
  audio_path?: string;
}

export interface VectorStoreOptions {
  dbDir?: string;
  collection?: string;
}

export class VectorStore {
  private db: Connection | null = null;
  private table: Table | null = null;
  private dbDir: string;
  private collection: string;

  constructor(options: VectorStoreOptions = {}) {
    this.dbDir = options.dbDir || VECTOR_INDEX_DIR;
    this.collection = options.collection || VECTOR_COLLECTION;
  }

  /**
   * Generate a deterministic ID from source and chunk index.
   */
  static generateId(source: string, chunkIndex: number): string {
    const input = `${source}:${chunkIndex}`;
    return createHash("sha256").update(input).digest("hex").slice(0, 16);
  }

  /**
   * Initialize the database connection.
   */
  async connect(): Promise<void> {
    this.db = await connect(this.dbDir);
  }

  /**
   * Create or open the collection table.
   * If reset is true, drops the existing table first.
   */
  async initTable(vectorDimension: number, reset = false): Promise<void> {
    if (!this.db) {
      throw new Error("Database not connected. Call connect() first.");
    }

    const tableNames = await this.db.tableNames();
    const tableExists = tableNames.includes(this.collection);

    if (tableExists && reset) {
      await this.db.dropTable(this.collection);
    }

    if (!tableExists || reset) {
      // Create with empty initial data - LanceDB requires at least schema info
      this.table = await this.db.createTable(
        this.collection,
        [
          {
            id: "init",
            text: "",
            vector: new Array(vectorDimension).fill(0),
            source: "",
            source_type: "file",
            chunk_index: 0,
            start_char: 0,
            end_char: 0,
            prosody_wpm: 0,
            prosody_speed: 0,
            prosody_emphasis: 0,
            prosody_pauses: 0,
            prosody_start_time: 0,
            prosody_end_time: 0,
            acoustic_pitch_mean: 0,
            acoustic_pitch_std: 0,
            acoustic_loudness_mean: 0,
            acoustic_loudness_std: 0,
            acoustic_jitter: 0,
            acoustic_shimmer: 0,
            acoustic_hnr: 0,
            acoustic_voiced_ratio: 0,
            sentiment: "neutral",
            sentiment_score: 0,
            audio_path: "",
          },
        ],
        { mode: "overwrite" }
      );
      // Delete the placeholder row
      await this.table.delete('id = "init"');
    } else {
      this.table = await this.db.openTable(this.collection);
    }
  }

  /**
   * Add records to the vector store.
   */
  async addRecords(records: VectorRecord[]): Promise<void> {
    if (!this.table) {
      throw new Error("Table not initialized. Call initTable() first.");
    }

    if (records.length === 0) {
      return;
    }

    await this.table.add(records as unknown as Record<string, unknown>[]);
  }

  /**
   * Search for similar vectors.
   */
  async search(
    queryVector: number[],
    limit = 5
  ): Promise<Array<VectorRecord & { _distance: number }>> {
    if (!this.table) {
      throw new Error("Table not initialized. Call initTable() first.");
    }

    const results = await this.table
      .search(queryVector)
      .limit(limit)
      .toArray();

    return results as Array<VectorRecord & { _distance: number }>;
  }

  /**
   * Get the count of records in the store.
   */
  async count(): Promise<number> {
    if (!this.table) {
      throw new Error("Table not initialized. Call initTable() first.");
    }

    return await this.table.countRows();
  }

  /**
   * Close the database connection.
   */
  async close(): Promise<void> {
    // LanceDB connections are managed automatically
    this.db = null;
    this.table = null;
  }
}
