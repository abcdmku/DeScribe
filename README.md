# DeScribe Monorepo

## Setup
- Install dependencies: `pnpm install`

## Run frontend
- `pnpm --filter frontend dev`

## Run backend
- `pnpm --filter backend dev`
- Health check: `GET http://localhost:8000/health`

## Data directory
- Place source documents in `data/` for ingestion.
