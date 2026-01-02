# DeScribe Docker Image
# Includes Node.js, yt-dlp, ffmpeg, and OpenSMILE for full audio analysis

FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    curl \
    unzip \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# Install OpenSMILE
RUN curl -L https://github.com/audeering/opensmile/releases/download/v3.0.2/opensmile-3.0.2-linux-x86_64.zip -o /tmp/opensmile.zip \
    && unzip /tmp/opensmile.zip -d /opt \
    && rm /tmp/opensmile.zip \
    && ln -s /opt/opensmile-3.0.2-linux-x86_64/bin/SMILExtract /usr/local/bin/SMILExtract

# Set OpenSMILE config path
ENV OPENSMILE_CONFIG=/opt/opensmile-3.0.2-linux-x86_64/config

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY backend/package.json ./backend/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build shared package
RUN pnpm --filter shared build

# Create data directories
RUN mkdir -p /app/data/audio /app/data/lancedb

# Default command
CMD ["pnpm", "--filter", "backend", "ingest", "--help"]
