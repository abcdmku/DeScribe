/**
 * YouTube transcript fetcher with timing/prosody data and sentiment analysis.
 * Extracts transcripts with timing information for prosody and sentiment analysis.
 *
 * Uses direct Innertube API calls for reliability (2025).
 */

import { analyzeSentiment, type SentimentLabel, type SentimentResult } from "./sentimentAnalyzer.js";

export interface TranscriptSegment {
  text: string;
  offset: number; // Start time in ms
  duration: number; // Duration in ms
}

export interface ProsodyMetrics {
  /** Average words per minute for this segment */
  wordsPerMinute: number;
  /** Pause before this segment in ms (gap from previous segment) */
  pauseBefore: number;
  /** Speaking rate relative to video average (1.0 = average) */
  relativeSpeed: number;
  /** Estimated emphasis score based on duration per word */
  emphasisScore: number;
}

export interface EnrichedSegment extends TranscriptSegment {
  prosody: ProsodyMetrics;
  segmentIndex: number;
}

export interface YouTubeTranscriptResult {
  videoId: string;
  videoUrl: string;
  title: string;
  segments: EnrichedSegment[];
  fullText: string;
  averageWpm: number;
  totalDuration: number;
}

/**
 * Extract video ID from various YouTube URL formats.
 */
export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/, // Direct video ID
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

/**
 * Calculate prosody metrics for transcript segments.
 */
function calculateProsodyMetrics(
  segments: TranscriptSegment[]
): { enriched: EnrichedSegment[]; averageWpm: number } {
  if (segments.length === 0) {
    return { enriched: [], averageWpm: 0 };
  }

  // Calculate word counts and WPM for each segment
  const segmentStats = segments.map((seg, index) => {
    const wordCount = seg.text.trim().split(/\s+/).filter(w => w.length > 0).length;
    const durationMinutes = seg.duration / 60000;
    const wpm = durationMinutes > 0 ? wordCount / durationMinutes : 0;

    // Calculate pause before this segment
    let pauseBefore = 0;
    if (index > 0) {
      const prevEnd = segments[index - 1].offset + segments[index - 1].duration;
      pauseBefore = Math.max(0, seg.offset - prevEnd);
    }

    return { wordCount, wpm, pauseBefore };
  });

  // Calculate average WPM across all segments
  const totalWords = segmentStats.reduce((sum, s) => sum + s.wordCount, 0);
  const totalDuration = segments.reduce((sum, s) => sum + s.duration, 0);
  const averageWpm = totalDuration > 0 ? (totalWords / totalDuration) * 60000 : 0;

  // Enrich segments with prosody metrics
  const enriched: EnrichedSegment[] = segments.map((seg, index) => {
    const stats = segmentStats[index];
    const relativeSpeed = averageWpm > 0 ? stats.wpm / averageWpm : 1;

    // Emphasis score: slower speech with longer duration per word suggests emphasis
    // Higher score = more emphasis (slower, deliberate speech)
    const avgDurationPerWord = stats.wordCount > 0 ? seg.duration / stats.wordCount : 0;
    const avgDurationPerWordOverall = totalWords > 0 ? totalDuration / totalWords : 1;
    const emphasisScore = avgDurationPerWordOverall > 0
      ? avgDurationPerWord / avgDurationPerWordOverall
      : 1;

    return {
      ...seg,
      segmentIndex: index,
      prosody: {
        wordsPerMinute: Math.round(stats.wpm),
        pauseBefore: Math.round(stats.pauseBefore),
        relativeSpeed: Math.round(relativeSpeed * 100) / 100,
        emphasisScore: Math.round(emphasisScore * 100) / 100,
      },
    };
  });

  return { enriched, averageWpm: Math.round(averageWpm) };
}

interface InnertubeContext {
  client: {
    clientName: string;
    clientVersion: string;
    hl: string;
    gl: string;
  };
}

interface CaptionTrack {
  baseUrl: string;
  name: { simpleText?: string };
  languageCode: string;
  kind?: string;
}

interface PlayerResponse {
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: CaptionTrack[];
    };
  };
  videoDetails?: {
    title?: string;
    videoId?: string;
  };
}

interface TimedTextSegment {
  utf8: string;
  tStartMs: string;
  dDurationMs: string;
}

interface TimedTextResponse {
  events?: Array<{
    tStartMs?: number;
    dDurationMs?: number;
    segs?: Array<{ utf8?: string }>;
  }>;
}

/**
 * Fetch transcript using direct Innertube API (reliable 2025 approach).
 */
async function fetchTranscriptDirect(videoId: string): Promise<{ segments: TranscriptSegment[]; title: string }> {
  const context: InnertubeContext = {
    client: {
      clientName: "WEB",
      clientVersion: "2.20240101.00.00",
      hl: "en",
      gl: "US",
    },
  };

  // Step 1: Get player response to find caption tracks
  const playerResponse = await fetch(
    "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      body: JSON.stringify({
        context,
        videoId,
      }),
    }
  );

  if (!playerResponse.ok) {
    throw new Error(`Failed to get player info: ${playerResponse.status}`);
  }

  const playerData: PlayerResponse = await playerResponse.json();
  const title = playerData.videoDetails?.title || `YouTube Video ${videoId}`;

  const captionTracks = playerData.captions?.playerCaptionsTracklistRenderer?.captionTracks;

  if (!captionTracks || captionTracks.length === 0) {
    throw new Error(`No captions available for video: ${videoId}`);
  }

  // Find English caption track (prefer manual over auto-generated)
  let captionTrack = captionTracks.find(
    (t) => t.languageCode === "en" && !t.kind
  );
  if (!captionTrack) {
    captionTrack = captionTracks.find((t) => t.languageCode === "en");
  }
  if (!captionTrack) {
    captionTrack = captionTracks[0]; // Fallback to first available
  }

  // Step 2: Fetch the timed text (transcript)
  const timedTextUrl = captionTrack.baseUrl + "&fmt=json3";
  const timedTextResponse = await fetch(timedTextUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });

  if (!timedTextResponse.ok) {
    throw new Error(`Failed to fetch timed text: ${timedTextResponse.status}`);
  }

  const timedTextData: TimedTextResponse = await timedTextResponse.json();

  if (!timedTextData.events || timedTextData.events.length === 0) {
    throw new Error(`No transcript events found for video: ${videoId}`);
  }

  // Parse timed text into segments
  const segments: TranscriptSegment[] = [];
  for (const event of timedTextData.events) {
    if (!event.segs) continue;

    const text = event.segs
      .map((s) => s.utf8 || "")
      .join("")
      .replace(/\n/g, " ")
      .trim();

    if (text.length === 0) continue;

    segments.push({
      text,
      offset: event.tStartMs || 0,
      duration: event.dDurationMs || 0,
    });
  }

  return { segments, title };
}

/**
 * Fetch YouTube transcript with prosody analysis.
 */
export async function fetchYouTubeTranscript(
  urlOrId: string
): Promise<YouTubeTranscriptResult> {
  const videoId = extractVideoId(urlOrId);
  if (!videoId) {
    throw new Error(`Invalid YouTube URL or video ID: ${urlOrId}`);
  }

  // Fetch transcript using direct Innertube API
  const { segments: rawSegments, title } = await fetchTranscriptDirect(videoId);

  if (rawSegments.length === 0) {
    throw new Error(`No valid transcript segments for video: ${videoId}`);
  }

  // Calculate prosody metrics
  const { enriched, averageWpm } = calculateProsodyMetrics(rawSegments);

  // Build full text
  const fullText = rawSegments.map((s) => s.text).join(" ");

  // Calculate total duration
  const lastSegment = rawSegments[rawSegments.length - 1];
  const totalDuration = lastSegment.offset + lastSegment.duration;

  return {
    videoId,
    videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
    title,
    segments: enriched,
    fullText,
    averageWpm,
    totalDuration,
  };
}

export interface ChunkWithAnalysis {
  text: string;
  startTime: number;
  endTime: number;
  segmentIndices: number[];
  avgEmphasis: number;
  avgSpeed: number;
  significantPauses: number;
  sentiment: SentimentLabel;
  sentimentScore: number;
}

/**
 * Group segments into chunks based on natural pauses and timing.
 * Creates chunks that respect prosody boundaries (pauses, topic shifts).
 * Also analyzes sentiment for each chunk.
 */
export function groupSegmentsByProsody(
  segments: EnrichedSegment[],
  options: {
    /** Maximum chunk duration in ms (default: 60000 = 1 minute) */
    maxChunkDuration?: number;
    /** Minimum pause to consider a natural break in ms (default: 1000) */
    pauseThreshold?: number;
    /** Target word count per chunk (default: 150) */
    targetWordCount?: number;
  } = {}
): ChunkWithAnalysis[] {
  const {
    maxChunkDuration = 60000,
    pauseThreshold = 1000,
    targetWordCount = 150,
  } = options;

  const chunks: ChunkWithAnalysis[] = [];

  let currentChunk: EnrichedSegment[] = [];
  let currentWordCount = 0;
  let currentDuration = 0;

  const finalizeChunk = () => {
    if (currentChunk.length === 0) return;

    const text = currentChunk.map((s) => s.text).join(" ");
    const startTime = currentChunk[0].offset;
    const lastSeg = currentChunk[currentChunk.length - 1];
    const endTime = lastSeg.offset + lastSeg.duration;

    const avgEmphasis =
      currentChunk.reduce((sum, s) => sum + s.prosody.emphasisScore, 0) /
      currentChunk.length;
    const avgSpeed =
      currentChunk.reduce((sum, s) => sum + s.prosody.relativeSpeed, 0) /
      currentChunk.length;
    const significantPauses = currentChunk.filter(
      (s) => s.prosody.pauseBefore >= pauseThreshold
    ).length;

    // Analyze sentiment for this chunk
    const sentimentResult = analyzeSentiment(text);

    chunks.push({
      text,
      startTime,
      endTime,
      segmentIndices: currentChunk.map((s) => s.segmentIndex),
      avgEmphasis: Math.round(avgEmphasis * 100) / 100,
      avgSpeed: Math.round(avgSpeed * 100) / 100,
      significantPauses,
      sentiment: sentimentResult.label,
      sentimentScore: sentimentResult.normalizedScore,
    });

    currentChunk = [];
    currentWordCount = 0;
    currentDuration = 0;
  };

  for (const segment of segments) {
    const wordCount = segment.text.trim().split(/\s+/).filter(w => w.length > 0).length;
    const hasSignificantPause = segment.prosody.pauseBefore >= pauseThreshold;

    // Check if we should start a new chunk
    const wouldExceedDuration = currentDuration + segment.duration > maxChunkDuration;
    const wouldExceedWords = currentWordCount + wordCount > targetWordCount * 1.5;
    const naturalBreak = hasSignificantPause && currentWordCount >= targetWordCount * 0.5;

    if (currentChunk.length > 0 && (wouldExceedDuration || wouldExceedWords || naturalBreak)) {
      finalizeChunk();
    }

    currentChunk.push(segment);
    currentWordCount += wordCount;
    currentDuration += segment.duration;
  }

  // Don't forget the last chunk
  finalizeChunk();

  return chunks;
}

/**
 * Format timestamp from milliseconds to human-readable format.
 */
export function formatTimestamp(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}:${String(minutes % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

// Re-export sentiment types for convenience
export type { SentimentLabel, SentimentResult } from "./sentimentAnalyzer.js";
export { analyzeSentiment } from "./sentimentAnalyzer.js";
