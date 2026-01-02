import { z } from "zod";

export const QuerySourceSchema = z.object({
  source: z.string(),
  chunk_index: z.number().int().nonnegative()
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

export type QuerySource = z.infer<typeof QuerySourceSchema>;
export type QueryRequest = z.infer<typeof QueryRequestSchema>;
export type QueryResponse = z.infer<typeof QueryResponseSchema>;

export {
  VECTOR_STORE,
  VECTOR_INDEX_DIR,
  VECTOR_COLLECTION,
  EMBEDDING_MODEL
} from "./config";
