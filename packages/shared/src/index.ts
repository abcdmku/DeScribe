import { z } from "zod";

export const ProsodyMetadataSchema = z.object({
  wordsPerMinute: z.number().optional(),
  relativeSpeed: z.number().optional(),
  emphasisScore: z.number().optional(),
  significantPauses: z.number().optional(),
  startTime: z.number().optional(),
  endTime: z.number().optional(),
});

export const SentimentMetadataSchema = z.object({
  label: z.enum(["positive", "negative", "neutral"]),
  score: z.number().min(-1).max(1),
});

export const QuerySourceSchema = z.object({
  source: z.string(),
  chunk_index: z.number().int().nonnegative(),
  source_type: z.enum(["file", "youtube"]).optional(),
  prosody: ProsodyMetadataSchema.optional(),
  sentiment: SentimentMetadataSchema.optional(),
});

export const QueryRequestSchema = z.object({
  question: z.string().min(1),
  nResults: z.number().int().positive().optional(),
  generateAnswer: z.boolean().optional()
});

export const QueryResponseSchema = z.object({
  results: z.array(z.string()),
  sources: z.array(QuerySourceSchema),
  answer: z.string().optional()
});

export type ProsodyMetadata = z.infer<typeof ProsodyMetadataSchema>;
export type SentimentMetadata = z.infer<typeof SentimentMetadataSchema>;
export type QuerySource = z.infer<typeof QuerySourceSchema>;
export type QueryRequest = z.infer<typeof QueryRequestSchema>;
export type QueryResponse = z.infer<typeof QueryResponseSchema>;

export {
  VECTOR_STORE,
  VECTOR_INDEX_DIR,
  VECTOR_COLLECTION,
  EMBEDDING_MODEL
} from "./config";
