/**
 * Audio downloader for YouTube videos using yt-dlp.
 * Downloads audio files for acoustic prosody analysis.
 */

import { spawn } from "child_process";
import { mkdir, access, unlink } from "fs/promises";
import { dirname, join } from "path";

export interface AudioDownloadResult {
  audioPath: string;
  videoId: string;
  duration: number; // in seconds
}

/**
 * Check if yt-dlp is installed and available.
 */
export async function checkYtDlp(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("yt-dlp", ["--version"], { shell: true });
    proc.on("close", (code) => resolve(code === 0));
    proc.on("error", () => resolve(false));
  });
}

/**
 * Download audio from a YouTube video.
 * @param videoId YouTube video ID
 * @param outputDir Directory to save audio files
 * @returns Path to downloaded audio file
 */
export async function downloadAudio(
  videoId: string,
  outputDir: string
): Promise<AudioDownloadResult> {
  // Ensure output directory exists
  await mkdir(outputDir, { recursive: true });

  const outputPath = join(outputDir, `${videoId}.wav`);

  // Check if already downloaded
  try {
    await access(outputPath);
    console.log(`    Audio already downloaded: ${videoId}.wav`);
    // Get duration from existing file
    const duration = await getAudioDuration(outputPath);
    return { audioPath: outputPath, videoId, duration };
  } catch {
    // File doesn't exist, download it
  }

  console.log(`    Downloading audio for ${videoId}...`);

  return new Promise((resolve, reject) => {
    const args = [
      "-x", // Extract audio
      "--audio-format", "wav", // Convert to WAV for OpenSMILE
      "--audio-quality", "0", // Best quality
      "-o", outputPath,
      "--no-playlist",
      "--quiet",
      "--progress",
      `https://www.youtube.com/watch?v=${videoId}`,
    ];

    const proc = spawn("yt-dlp", args, { shell: true });

    let stderr = "";
    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", async (code) => {
      if (code !== 0) {
        reject(new Error(`yt-dlp failed with code ${code}: ${stderr}`));
        return;
      }

      try {
        const duration = await getAudioDuration(outputPath);
        console.log(`    Audio downloaded: ${videoId}.wav (${Math.round(duration)}s)`);
        resolve({ audioPath: outputPath, videoId, duration });
      } catch (err) {
        reject(err);
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn yt-dlp: ${err.message}`));
    });
  });
}

/**
 * Get audio duration using ffprobe (comes with ffmpeg).
 */
async function getAudioDuration(audioPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const args = [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      audioPath,
    ];

    const proc = spawn("ffprobe", args, { shell: true });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        // Fallback: estimate duration (won't have exact value)
        console.warn(`    Warning: ffprobe failed, duration unknown`);
        resolve(0);
        return;
      }

      const duration = parseFloat(stdout.trim());
      resolve(isNaN(duration) ? 0 : duration);
    });

    proc.on("error", () => {
      // ffprobe not available, that's okay
      resolve(0);
    });
  });
}

/**
 * Clean up downloaded audio file.
 */
export async function cleanupAudio(audioPath: string): Promise<void> {
  try {
    await unlink(audioPath);
  } catch {
    // Ignore errors
  }
}
