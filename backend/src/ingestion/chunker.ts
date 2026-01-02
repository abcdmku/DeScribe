/**
 * Text chunking utilities for document ingestion.
 * Splits documents into chunks suitable for semantic search.
 */

export interface Chunk {
  text: string;
  chunkIndex: number;
  startChar: number;
  endChar: number;
}

export interface ChunkOptions {
  /** Target chunk size in characters (default: 1000) */
  targetSize?: number;
  /** Minimum chunk size in characters (default: 200) */
  minSize?: number;
  /** Maximum chunk size in characters (default: 1500) */
  maxSize?: number;
  /** Overlap between chunks in characters (default: 100) */
  overlap?: number;
}

const DEFAULT_OPTIONS: Required<ChunkOptions> = {
  targetSize: 1000,
  minSize: 200,
  maxSize: 1500,
  overlap: 100,
};

/**
 * Split text into chunks, preferring paragraph and sentence boundaries.
 */
export function chunkText(text: string, options: ChunkOptions = {}): Chunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const chunks: Chunk[] = [];

  if (!text.trim()) {
    return chunks;
  }

  // Normalize line endings and split into paragraphs
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const paragraphs = splitIntoParagraphs(normalized);

  let currentChunk = "";
  let currentStartChar = 0;
  let chunkIndex = 0;

  for (const para of paragraphs) {
    const paraWithNewline = para.text + "\n\n";

    // If adding this paragraph would exceed max size, finalize current chunk
    if (
      currentChunk.length > 0 &&
      currentChunk.length + paraWithNewline.length > opts.maxSize
    ) {
      // Finalize the current chunk
      const trimmed = currentChunk.trim();
      if (trimmed.length >= opts.minSize) {
        chunks.push({
          text: trimmed,
          chunkIndex,
          startChar: currentStartChar,
          endChar: currentStartChar + currentChunk.length,
        });
        chunkIndex++;
      }

      // Start new chunk with overlap from the end of previous
      const overlapText = getOverlapText(currentChunk, opts.overlap);
      currentStartChar =
        currentStartChar + currentChunk.length - overlapText.length;
      currentChunk = overlapText;
    }

    // If paragraph itself is too large, split it by sentences
    if (paraWithNewline.length > opts.maxSize) {
      // First, finalize any existing chunk
      if (currentChunk.trim().length >= opts.minSize) {
        chunks.push({
          text: currentChunk.trim(),
          chunkIndex,
          startChar: currentStartChar,
          endChar: currentStartChar + currentChunk.length,
        });
        chunkIndex++;
        currentChunk = "";
        currentStartChar = para.startChar;
      }

      // Split large paragraph by sentences
      const sentences = splitIntoSentences(para.text);
      let sentenceChunk = "";
      let sentenceStart = para.startChar;

      for (const sentence of sentences) {
        if (
          sentenceChunk.length > 0 &&
          sentenceChunk.length + sentence.length > opts.maxSize
        ) {
          const trimmed = sentenceChunk.trim();
          if (trimmed.length >= opts.minSize) {
            chunks.push({
              text: trimmed,
              chunkIndex,
              startChar: sentenceStart,
              endChar: sentenceStart + sentenceChunk.length,
            });
            chunkIndex++;
          }
          const overlapText = getOverlapText(sentenceChunk, opts.overlap);
          sentenceStart = sentenceStart + sentenceChunk.length - overlapText.length;
          sentenceChunk = overlapText;
        }
        sentenceChunk += sentence + " ";
      }

      // Keep remaining sentences for next iteration
      currentChunk = sentenceChunk;
      currentStartChar = sentenceStart;
    } else {
      // Add paragraph to current chunk
      if (currentChunk.length === 0) {
        currentStartChar = para.startChar;
      }
      currentChunk += paraWithNewline;

      // If we've reached target size, consider finalizing
      if (currentChunk.length >= opts.targetSize) {
        const trimmed = currentChunk.trim();
        chunks.push({
          text: trimmed,
          chunkIndex,
          startChar: currentStartChar,
          endChar: currentStartChar + currentChunk.length,
        });
        chunkIndex++;
        currentChunk = "";
      }
    }
  }

  // Don't forget the last chunk
  const finalTrimmed = currentChunk.trim();
  if (finalTrimmed.length > 0) {
    // If it's too small and we have previous chunks, merge with last
    if (finalTrimmed.length < opts.minSize && chunks.length > 0) {
      const lastChunk = chunks[chunks.length - 1];
      lastChunk.text = lastChunk.text + "\n\n" + finalTrimmed;
      lastChunk.endChar = currentStartChar + currentChunk.length;
    } else {
      chunks.push({
        text: finalTrimmed,
        chunkIndex,
        startChar: currentStartChar,
        endChar: currentStartChar + currentChunk.length,
      });
    }
  }

  return chunks;
}

interface Paragraph {
  text: string;
  startChar: number;
}

function splitIntoParagraphs(text: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const parts = text.split(/\n\s*\n/);
  let currentPos = 0;

  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.length > 0) {
      const startChar = text.indexOf(part, currentPos);
      paragraphs.push({
        text: trimmed,
        startChar: startChar >= 0 ? startChar : currentPos,
      });
    }
    currentPos += part.length + 2; // +2 for the double newline
  }

  return paragraphs;
}

function splitIntoSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by space or end
  const sentences = text.split(/(?<=[.!?])\s+/);
  return sentences.filter((s) => s.trim().length > 0);
}

function getOverlapText(text: string, overlapSize: number): string {
  if (text.length <= overlapSize) {
    return text;
  }

  // Try to find a sentence or word boundary for clean overlap
  const tail = text.slice(-overlapSize * 2);
  const sentenceMatch = tail.match(/[.!?]\s+([^.!?]+)$/);
  if (sentenceMatch && sentenceMatch[1].length >= overlapSize / 2) {
    return sentenceMatch[1];
  }

  // Fall back to word boundary
  const words = tail.split(/\s+/);
  let result = "";
  for (let i = words.length - 1; i >= 0; i--) {
    const candidate = words.slice(i).join(" ");
    if (candidate.length >= overlapSize) {
      result = candidate;
      break;
    }
    result = candidate;
  }

  return result || text.slice(-overlapSize);
}
