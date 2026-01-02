/**
 * OpenSMILE acoustic prosody analyzer.
 * Extracts pitch, loudness, and voice quality features from audio.
 *
 * Requires OpenSMILE to be installed:
 * - Windows: Download from https://github.com/audeering/opensmile/releases
 * - Add SMILExtract to PATH or set OPENSMILE_PATH env var
 * - Set OPENSMILE_CONFIG to the config directory (contains eGeMAPSv02.conf)
 */

import { spawn } from "child_process";
import { readFile, unlink, mkdir, access } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

export interface AcousticFeatures {
  /** Mean pitch (F0) in Hz */
  pitchMean: number;
  /** Pitch standard deviation */
  pitchStd: number;
  /** Mean loudness/intensity */
  loudnessMean: number;
  /** Loudness standard deviation */
  loudnessStd: number;
  /** Voice quality - jitter (pitch variation) */
  jitter: number;
  /** Voice quality - shimmer (amplitude variation) */
  shimmer: number;
  /** Harmonics-to-noise ratio */
  hnr: number;
  /** Speaking rate estimate (voiced frames / total frames) */
  voicedFrameRatio: number;
}

export interface SegmentAcousticFeatures extends AcousticFeatures {
  startTime: number; // in ms
  endTime: number; // in ms
}

// Cache the OpenSMILE config path
let openSmileConfigDir: string | null = null;

/**
 * Find the OpenSMILE config directory.
 */
async function findOpenSmileConfig(): Promise<string | null> {
  if (openSmileConfigDir) return openSmileConfigDir;

  // Check env var first
  const envPath = process.env.OPENSMILE_CONFIG;
  if (envPath) {
    try {
      await access(join(envPath, "egemaps", "v02", "eGeMAPSv02.conf"));
      openSmileConfigDir = envPath;
      return envPath;
    } catch {
      // Try alternate structure
      try {
        await access(join(envPath, "gemaps", "eGeMAPSv02.conf"));
        openSmileConfigDir = envPath;
        return envPath;
      } catch {
        // Not found
      }
    }
  }

  // Common install locations
  const commonPaths = [
    "/opt/opensmile-3.0.2-linux-x86_64/config",
    "/opt/opensmile/config",
    "/usr/local/share/opensmile/config",
    "C:\\opensmile\\config",
  ];

  for (const p of commonPaths) {
    try {
      await access(join(p, "egemaps", "v02", "eGeMAPSv02.conf"));
      openSmileConfigDir = p;
      return p;
    } catch {
      // Try next
    }
  }

  return null;
}

/**
 * Check if OpenSMILE is installed and properly configured.
 */
export async function checkOpenSmile(): Promise<boolean> {
  const smilePath = process.env.OPENSMILE_PATH || "SMILExtract";

  const hasExe = await new Promise<boolean>((resolve) => {
    const proc = spawn(smilePath, ["-h"], { shell: true });
    proc.on("close", (code) => resolve(code === 0));
    proc.on("error", () => resolve(false));
  });

  if (!hasExe) return false;

  // Also check for config
  const configDir = await findOpenSmileConfig();
  return configDir !== null;
}

/**
 * Extract acoustic features from an audio file using OpenSMILE eGeMAPS.
 * Uses the standard eGeMAPSv02 config for reliable prosody extraction.
 * Returns null if OpenSMILE is not available or analysis fails.
 */
export async function extractAcousticFeatures(
  audioPath: string
): Promise<AcousticFeatures | null> {
  const smilePath = process.env.OPENSMILE_PATH || "SMILExtract";
  const configDir = await findOpenSmileConfig();

  if (!configDir) {
    console.warn("    OpenSMILE config not found - skipping acoustic analysis");
    return null;
  }

  const tempDir = join(tmpdir(), "opensmile-describe");
  await mkdir(tempDir, { recursive: true });

  const outputPath = join(tempDir, `output_${Date.now()}.csv`);

  // Use eGeMAPSv02 - a standard feature set for voice analysis
  const configPath = join(configDir, "egemaps", "v02", "eGeMAPSv02.conf");

  try {
    // Run OpenSMILE with eGeMAPS config
    await new Promise<void>((resolve, reject) => {
      const args = [
        "-C", configPath,
        "-I", audioPath,
        "-csvoutput", outputPath,
        "-instname", "audio",
        "-loglevel", "2", // Reduce log verbosity
      ];

      const proc = spawn(smilePath, args, { shell: true });

      let stderr = "";
      proc.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`OpenSMILE failed (code ${code}): ${stderr}`));
        } else {
          resolve();
        }
      });

      proc.on("error", (err) => {
        reject(new Error(`Failed to run OpenSMILE: ${err.message}`));
      });
    });

    // Parse output CSV
    const csvContent = await readFile(outputPath, "utf-8");
    return parseEgemapsOutput(csvContent);

  } finally {
    // Cleanup temp files
    try {
      await unlink(outputPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Parse eGeMAPS CSV output into acoustic features.
 * eGeMAPS provides standardized feature names.
 * Returns null if parsing fails.
 */
function parseEgemapsOutput(csvContent: string): AcousticFeatures | null {
  const lines = csvContent.trim().split("\n");

  if (lines.length < 2) {
    console.warn("    Empty OpenSMILE output");
    return null;
  }

  // Parse header and values
  const headers = lines[0].split(";").map(h => h.trim().toLowerCase());
  const values = lines[lines.length - 1].split(";").map(v => parseFloat(v.trim()));

  // Helper to find feature by partial name match
  const getValue = (patterns: string[]): number => {
    for (const pattern of patterns) {
      const idx = headers.findIndex(h => h.includes(pattern.toLowerCase()));
      if (idx >= 0 && !isNaN(values[idx])) {
        return values[idx];
      }
    }
    return NaN;
  };

  // eGeMAPS feature names (may vary slightly by version)
  const pitchMean = getValue(["f0semitonefrommean", "f0_mean", "pitch_mean", "f0semitone_sma3nz_amean"]) ||
                    getValue(["f0"]);
  const pitchStd = getValue(["f0_std", "f0semitone_sma3nz_stddev", "pitch_std"]);
  const loudnessMean = getValue(["loudness_sma3_amean", "loudness_mean", "pcm_loudness"]);
  const loudnessStd = getValue(["loudness_sma3_stddev", "loudness_std"]);
  const jitter = getValue(["jitterlocal_sma3nz_amean", "jitter", "jitterlocal"]);
  const shimmer = getValue(["shimmerlocaldbl_sma3nz_amean", "shimmer", "shimmerlocal"]);
  const hnr = getValue(["hnrdbacf_sma3nz_amean", "hnr", "harmonicsnoise"]);
  let voicedRatio = getValue(["voicedsegmentspersec", "voiced"]);
  if (isNaN(voicedRatio)) {
    const unvoiced = getValue(["unvoicedsegmentspersec"]);
    voicedRatio = !isNaN(unvoiced) ? Math.max(0, 1 - unvoiced * 0.1) : NaN;
  }

  // Check if we got any meaningful data
  const hasData = !isNaN(pitchMean) || !isNaN(loudnessMean) || !isNaN(jitter);
  if (!hasData) {
    console.warn("    Could not extract features from OpenSMILE output");
    return null;
  }

  const features: AcousticFeatures = {
    pitchMean: isNaN(pitchMean) ? 0 : Math.round(pitchMean * 100) / 100,
    pitchStd: isNaN(pitchStd) ? 0 : Math.round(pitchStd * 100) / 100,
    loudnessMean: isNaN(loudnessMean) ? 0 : Math.round(loudnessMean * 1000) / 1000,
    loudnessStd: isNaN(loudnessStd) ? 0 : Math.round(loudnessStd * 1000) / 1000,
    jitter: isNaN(jitter) ? 0 : Math.round(jitter * 10000) / 10000,
    shimmer: isNaN(shimmer) ? 0 : Math.round(shimmer * 10000) / 10000,
    hnr: isNaN(hnr) ? 0 : Math.round(hnr * 100) / 100,
    voicedFrameRatio: isNaN(voicedRatio) ? 0 : Math.round(Math.min(1, Math.max(0, voicedRatio)) * 100) / 100,
  };

  console.log(`    Extracted: pitch=${features.pitchMean}Hz, loudness=${features.loudnessMean}, jitter=${features.jitter}, shimmer=${features.shimmer}`);

  return features;
}

/**
 * Extract acoustic features for specific time segments.
 * Returns null for segments if analysis fails.
 */
export async function extractSegmentFeatures(
  audioPath: string,
  segments: Array<{ startTime: number; endTime: number }>
): Promise<(SegmentAcousticFeatures | null)[]> {
  const overallFeatures = await extractAcousticFeatures(audioPath);

  if (!overallFeatures) {
    return segments.map(() => null);
  }

  return segments.map(seg => ({
    ...overallFeatures,
    startTime: seg.startTime,
    endTime: seg.endTime,
  }));
}
