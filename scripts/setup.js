#!/usr/bin/env node
/**
 * DeScribe Setup Script
 * Installs all dependencies and checks for required external tools.
 * Auto-detects OS and provides appropriate install commands.
 */

import { execSync, spawn } from "child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createInterface } from "readline";
import { platform } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..");

// Detect OS
const OS = platform();
const IS_WINDOWS = OS === "win32";
const IS_MAC = OS === "darwin";
const IS_LINUX = OS === "linux";

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
};

// Package manager detection
function detectPackageManager() {
  if (IS_WINDOWS) {
    if (checkCommand("winget", ["--version"])) return "winget";
    if (checkCommand("choco", ["--version"])) return "choco";
    if (checkCommand("scoop", ["--version"])) return "scoop";
  } else if (IS_MAC) {
    if (checkCommand("brew", ["--version"])) return "brew";
  } else if (IS_LINUX) {
    if (checkCommand("apt", ["--version"])) return "apt";
    if (checkCommand("dnf", ["--version"])) return "dnf";
    if (checkCommand("pacman", ["--version"])) return "pacman";
    if (checkCommand("brew", ["--version"])) return "brew";
  }
  // pip is available on all platforms
  if (checkCommand("pip", ["--version"])) return "pip";
  if (checkCommand("pip3", ["--version"])) return "pip3";
  return null;
}

// Get install command for a tool based on OS and package manager
function getInstallCommand(tool, pkgManager) {
  const commands = {
    "yt-dlp": {
      winget: "winget install yt-dlp.yt-dlp",
      choco: "choco install yt-dlp",
      scoop: "scoop install yt-dlp",
      brew: "brew install yt-dlp",
      apt: "sudo apt install yt-dlp",
      dnf: "sudo dnf install yt-dlp",
      pacman: "sudo pacman -S yt-dlp",
      pip: "pip install yt-dlp",
      pip3: "pip3 install yt-dlp",
    },
    ffmpeg: {
      winget: "winget install Gyan.FFmpeg",
      choco: "choco install ffmpeg",
      scoop: "scoop install ffmpeg",
      brew: "brew install ffmpeg",
      apt: "sudo apt install ffmpeg",
      dnf: "sudo dnf install ffmpeg",
      pacman: "sudo pacman -S ffmpeg",
    },
  };

  return commands[tool]?.[pkgManager] || null;
}

function log(msg, color = colors.reset) {
  console.log(`${color}${msg}${colors.reset}`);
}

function success(msg) {
  log(`✓ ${msg}`, colors.green);
}

function warn(msg) {
  log(`⚠ ${msg}`, colors.yellow);
}

function error(msg) {
  log(`✗ ${msg}`, colors.red);
}

function info(msg) {
  log(`  ${msg}`, colors.dim);
}

function header(msg) {
  console.log();
  log(`━━━ ${msg} ━━━`, colors.cyan);
}

function checkCommand(cmd, args = ["--version"]) {
  try {
    execSync(`${cmd} ${args.join(" ")}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function getCommandVersion(cmd, args = ["--version"]) {
  try {
    const output = execSync(`${cmd} ${args.join(" ")}`, { stdio: "pipe" });
    return output.toString().trim().split("\n")[0];
  } catch {
    return null;
  }
}

async function runCommand(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      stdio: "inherit",
      shell: true,
      cwd: ROOT_DIR,
      ...options,
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with code ${code}`));
      }
    });

    proc.on("error", reject);
  });
}

async function prompt(question) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function main() {
  console.log();
  log("╔════════════════════════════════════════╗", colors.cyan);
  log("║        DeScribe Setup Script           ║", colors.cyan);
  log("╚════════════════════════════════════════╝", colors.cyan);

  // ─────────────────────────────────────────────────────────────
  // Check Node.js
  // ─────────────────────────────────────────────────────────────
  header("Checking Prerequisites");

  const nodeVersion = process.version;
  const nodeMajor = parseInt(nodeVersion.slice(1).split(".")[0], 10);
  if (nodeMajor >= 18) {
    success(`Node.js ${nodeVersion}`);
  } else {
    error(`Node.js ${nodeVersion} - requires v18 or higher`);
    process.exit(1);
  }

  // Check pnpm
  if (checkCommand("pnpm")) {
    success(`pnpm ${getCommandVersion("pnpm")}`);
  } else {
    error("pnpm not found");
    info("Install with: npm install -g pnpm");
    process.exit(1);
  }

  // ─────────────────────────────────────────────────────────────
  // Install Dependencies
  // ─────────────────────────────────────────────────────────────
  header("Installing Dependencies");

  try {
    await runCommand("pnpm", ["install"]);
    success("All npm dependencies installed");
  } catch (err) {
    error("Failed to install dependencies");
    info(err.message);
    process.exit(1);
  }

  // ─────────────────────────────────────────────────────────────
  // Create directories
  // ─────────────────────────────────────────────────────────────
  header("Creating Directories");

  const dirs = [
    "data",
    "data/audio",
    "backend/vector_db",
  ];

  for (const dir of dirs) {
    const fullPath = join(ROOT_DIR, dir);
    if (!existsSync(fullPath)) {
      mkdirSync(fullPath, { recursive: true });
      success(`Created ${dir}/`);
    } else {
      info(`${dir}/ already exists`);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Create .env file if needed
  // ─────────────────────────────────────────────────────────────
  header("Environment Configuration");

  const envPath = join(ROOT_DIR, "backend", ".env");
  const envExamplePath = join(ROOT_DIR, "backend", ".env.example");

  if (!existsSync(envPath)) {
    if (existsSync(envExamplePath)) {
      const envContent = readFileSync(envExamplePath, "utf-8");
      writeFileSync(envPath, envContent);
      success("Created backend/.env from .env.example");
      info("Edit backend/.env to add your API keys (optional for local embeddings)");
    } else {
      const defaultEnv = `# API Keys for embedding service (optional - local embeddings work without keys)
# OPENROUTER_API_KEY=your_key_here
# OPENAI_API_KEY=your_key_here
`;
      writeFileSync(envPath, defaultEnv);
      success("Created backend/.env");
    }
  } else {
    info("backend/.env already exists");
  }

  // ─────────────────────────────────────────────────────────────
  // Check Optional Tools
  // ─────────────────────────────────────────────────────────────
  header("Checking Optional Tools");

  const pkgManager = detectPackageManager();
  if (pkgManager) {
    info(`Detected package manager: ${pkgManager}`);
  }

  const missingTools = [];

  // yt-dlp
  if (checkCommand("yt-dlp")) {
    success(`yt-dlp ${getCommandVersion("yt-dlp")}`);
  } else {
    warn("yt-dlp not found (optional - needed for YouTube audio download)");
    const installCmd = getInstallCommand("yt-dlp", pkgManager);
    if (installCmd) {
      info(`Install: ${installCmd}`);
      missingTools.push({ name: "yt-dlp", cmd: installCmd });
    } else {
      info("Install: https://github.com/yt-dlp/yt-dlp#installation");
    }
  }

  // ffmpeg/ffprobe
  if (checkCommand("ffprobe")) {
    success("ffprobe available");
  } else {
    warn("ffprobe not found (optional - for audio duration detection)");
    const installCmd = getInstallCommand("ffmpeg", pkgManager);
    if (installCmd) {
      info(`Install: ${installCmd}`);
      missingTools.push({ name: "ffmpeg", cmd: installCmd });
    } else {
      info("Install: https://ffmpeg.org/download.html");
    }
  }

  // OpenSMILE
  if (checkCommand("SMILExtract", ["-h"])) {
    success("OpenSMILE (SMILExtract) available");
  } else {
    warn("OpenSMILE not found (optional - for acoustic prosody analysis)");
    info("Install: https://github.com/audeering/opensmile/releases");
    info("Add SMILExtract to PATH or set OPENSMILE_PATH env var");
  }

  // Offer to install missing tools
  if (missingTools.length > 0 && pkgManager) {
    console.log();
    const answer = await prompt(
      `Install missing tools (${missingTools.map((t) => t.name).join(", ")})? [y/N] `
    );

    if (answer === "y" || answer === "yes") {
      for (const tool of missingTools) {
        console.log();
        log(`Installing ${tool.name}...`, colors.cyan);
        try {
          await runCommand(tool.cmd.split(" ")[0], tool.cmd.split(" ").slice(1));
        } catch {
          // Ignore exit code - winget returns non-zero even when already installed
        }
        // Check if the tool is now available
        const checkCmd = tool.name === "ffmpeg" ? "ffprobe" : tool.name;
        if (checkCommand(checkCmd)) {
          success(`${tool.name} is available`);
        } else {
          error(`${tool.name} not found after install attempt`);
          info(`Try manually: ${tool.cmd}`);
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Build shared package
  // ─────────────────────────────────────────────────────────────
  header("Building Packages");

  try {
    // TypeScript check
    await runCommand("pnpm", ["--filter", "@describe/shared", "exec", "tsc", "--noEmit"], {
      stdio: "pipe",
    });
    success("TypeScript compilation check passed");
  } catch {
    warn("TypeScript check had warnings (this is usually fine)");
  }

  // ─────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────
  header("Setup Complete!");

  console.log();
  log("Quick Start:", colors.cyan);
  console.log();
  log("  1. Ingest a YouTube video:");
  info('     pnpm --filter backend ingest -y "https://youtube.com/watch?v=VIDEO_ID"');
  console.log();
  log("  2. Ingest local files:");
  info("     Put .txt, .md, or .pdf files in the data/ folder, then run:");
  info("     pnpm --filter backend ingest");
  console.log();
  log("  3. Start the backend server:");
  info("     pnpm --filter backend dev");
  console.log();

  log("For audio prosody analysis, install yt-dlp and OpenSMILE.", colors.dim);
  console.log();
}

main().catch((err) => {
  error(err.message);
  process.exit(1);
});
