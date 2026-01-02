/**
 * Embedding service with multiple backends.
 * Generates vector embeddings for text chunks.
 *
 * Supports:
 * - Local (default, free) - Uses @xenova/transformers with all-MiniLM-L6-v2
 * - OpenAI (OPENAI_API_KEY)
 * - OpenRouter (OPENROUTER_API_KEY) - proxies to OpenAI embeddings
 */

import { pipeline, type FeatureExtractionPipeline } from "@xenova/transformers";

// Local embedding model configuration
const LOCAL_MODEL = "Xenova/all-MiniLM-L6-v2";
const LOCAL_DIMENSION = 384;

// Singleton for local embedding pipeline
let localPipeline: FeatureExtractionPipeline | null = null;

async function getLocalPipeline(): Promise<FeatureExtractionPipeline> {
  if (!localPipeline) {
    console.log("  Loading local embedding model (first run downloads ~80MB)...");
    localPipeline = await pipeline("feature-extraction", LOCAL_MODEL, {
      quantized: true,
    });
    console.log("  Local embedding model ready");
  }
  return localPipeline;
}

export interface EmbeddingService {
  /**
   * Generate an embedding for a single text.
   */
  embedText(text: string): Promise<number[]>;

  /**
   * Generate embeddings for multiple texts.
   * More efficient than calling embedText multiple times.
   */
  embedTexts(texts: string[]): Promise<number[][]>;

  /**
   * Get the dimension of the embedding vectors.
   */
  getDimension(): number;
}

/**
 * Create a local embedding service using transformers.js.
 * Free, runs locally, no API key needed.
 */
export function createEmbeddingService(): EmbeddingService {
  return {
    async embedText(text: string): Promise<number[]> {
      const extractor = await getLocalPipeline();
      const output = await extractor(text, {
        pooling: "mean",
        normalize: true,
      });
      return Array.from(output.data as Float32Array);
    },

    async embedTexts(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) {
        return [];
      }

      const extractor = await getLocalPipeline();
      const embeddings: number[][] = [];

      // Process in batches for memory efficiency
      for (const text of texts) {
        const output = await extractor(text, {
          pooling: "mean",
          normalize: true,
        });
        embeddings.push(Array.from(output.data as Float32Array));
      }

      return embeddings;
    },

    getDimension(): number {
      return LOCAL_DIMENSION;
    },
  };
}
