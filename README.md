# DeScribe Monorepo

## Quick Start with Docker (Recommended)

Docker includes all dependencies (yt-dlp, ffmpeg, OpenSMILE) pre-installed.

```bash
# Build the image
pnpm docker:build

# Ingest a YouTube video
pnpm docker:ingest -- -y "https://youtube.com/watch?v=VIDEO_ID" --keep-audio

# Ingest local files (place in data/ folder first)
pnpm docker:ingest

# Interactive shell
pnpm docker:shell
```

Data is persisted in the `data/` folder on your host machine.

---

## Local Setup (Alternative)

### Prerequisites
- Node.js 20+
- pnpm
- Optional: yt-dlp, ffmpeg, OpenSMILE (for audio analysis)

### Install
```bash
pnpm install
# Or use the setup script which checks for optional tools:
pnpm setup
```

## Run frontend
- `pnpm --filter frontend dev`

## Run backend
- `pnpm --filter backend dev`
- Health check: `GET http://localhost:8000/health`

## Data directory
- Place source documents in `data/` for ingestion.

## Ingestion
Run the ingestion pipeline to index documents into the vector database:
```bash
# Set OpenAI API key (required for embeddings)
export OPENAI_API_KEY=your-api-key

# Run ingestion (files from data/ directory)
pnpm ingest

# Or with options
pnpm ingest --reset              # Rebuild index from scratch
pnpm ingest --data-dir ./docs    # Custom data directory

# Ingest YouTube videos (with prosody/timing analysis)
pnpm ingest -y "https://www.youtube.com/watch?v=VIDEO_ID"

# Multiple YouTube videos
pnpm ingest -y "URL1" -y "URL2" -y "URL3"

# Combine files and YouTube
pnpm ingest --data-dir ./docs -y "https://youtu.be/VIDEO_ID"
```

Supported sources:
- **Files**: `.txt`, `.md`, `.pdf`
- **YouTube**: Videos with available transcripts (includes prosody analysis)
