/**
 * Sentiment analysis for text content.
 * Classifies text as positive, negative, or neutral.
 */

import Sentiment from "sentiment";

export type SentimentLabel = "positive" | "negative" | "neutral";

export interface SentimentResult {
  /** The sentiment classification */
  label: SentimentLabel;
  /** Raw sentiment score (positive = positive sentiment, negative = negative) */
  score: number;
  /** Normalized score from -1 (most negative) to 1 (most positive) */
  normalizedScore: number;
  /** Comparative score (score divided by word count) */
  comparative: number;
  /** Words that contributed to positive sentiment */
  positiveWords: string[];
  /** Words that contributed to negative sentiment */
  negativeWords: string[];
}

const sentimentAnalyzer = new Sentiment();

/**
 * Analyze sentiment of a text string.
 */
export function analyzeSentiment(text: string): SentimentResult {
  const result = sentimentAnalyzer.analyze(text);

  // Determine label based on comparative score
  // Using thresholds to account for neutral text
  let label: SentimentLabel;
  if (result.comparative > 0.05) {
    label = "positive";
  } else if (result.comparative < -0.05) {
    label = "negative";
  } else {
    label = "neutral";
  }

  // Normalize score to -1 to 1 range
  // Comparative scores typically range from -5 to 5
  const normalizedScore = Math.max(-1, Math.min(1, result.comparative / 5));

  return {
    label,
    score: result.score,
    normalizedScore: Math.round(normalizedScore * 100) / 100,
    comparative: Math.round(result.comparative * 1000) / 1000,
    positiveWords: result.positive,
    negativeWords: result.negative,
  };
}

/**
 * Get a numeric representation of sentiment label for storage.
 * -1 = negative, 0 = neutral, 1 = positive
 */
export function sentimentLabelToNumber(label: SentimentLabel): number {
  switch (label) {
    case "positive":
      return 1;
    case "negative":
      return -1;
    case "neutral":
    default:
      return 0;
  }
}

/**
 * Convert numeric sentiment back to label.
 */
export function numberToSentimentLabel(num: number): SentimentLabel {
  if (num > 0) return "positive";
  if (num < 0) return "negative";
  return "neutral";
}
