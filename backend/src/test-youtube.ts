#!/usr/bin/env node
/**
 * Quick test script to fetch YouTube transcript without embeddings.
 * Usage: npx tsx src/test-youtube.ts "VIDEO_URL"
 */

import {
  fetchYouTubeTranscript,
  groupSegmentsByProsody,
  formatTimestamp,
} from "./ingestion/youtubeTranscript.js";

async function main() {
  const url = process.argv[2];

  if (!url) {
    console.log("Usage: npx tsx src/test-youtube.ts <youtube-url>");
    console.log("Example: npx tsx src/test-youtube.ts https://www.youtube.com/watch?v=VIDEO_ID");
    process.exit(1);
  }

  try {
    console.log(`Fetching transcript for: ${url}\n`);

    const transcript = await fetchYouTubeTranscript(url);

    console.log("=".repeat(60));
    console.log("VIDEO INFO");
    console.log("=".repeat(60));
    console.log(`Video ID: ${transcript.videoId}`);
    console.log(`URL: ${transcript.videoUrl}`);
    console.log(`Duration: ${formatTimestamp(transcript.totalDuration)}`);
    console.log(`Average WPM: ${transcript.averageWpm}`);
    console.log(`Total segments: ${transcript.segments.length}`);

    // Group into chunks with prosody and sentiment
    const chunks = groupSegmentsByProsody(transcript.segments);

    console.log(`\n${"=".repeat(60)}`);
    console.log(`CHUNKS WITH PROSODY & SENTIMENT (${chunks.length} total)`);
    console.log("=".repeat(60));

    chunks.forEach((chunk, i) => {
      console.log(`\n--- Chunk ${i + 1} ---`);
      console.log(`Time: ${formatTimestamp(chunk.startTime)} - ${formatTimestamp(chunk.endTime)}`);
      console.log(`Speed: ${chunk.avgSpeed}x | Emphasis: ${chunk.avgEmphasis} | Pauses: ${chunk.significantPauses}`);
      console.log(`Sentiment: ${chunk.sentiment.toUpperCase()} (score: ${chunk.sentimentScore})`);
      console.log(`Text: "${chunk.text.slice(0, 150)}${chunk.text.length > 150 ? '...' : ''}"`);
    });

    console.log(`\n${"=".repeat(60)}`);
    console.log("SUCCESS - Transcript fetched and analyzed!");
    console.log("=".repeat(60));

  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
