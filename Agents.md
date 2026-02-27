# Scraplet Dashboard — Agent Rules

## What this repo is
- Express + EJS dashboard for Scraplet Broadcast Studio
- Talks to Scrapbot over HTTP
- Runs in WSL locally, VPS in production

## Absolute rules
- DO NOT edit files in public/static
- DO NOT touch .env files
- DO NOT invent new architecture
- Prefer extending existing code over adding new systems
- Full-file rewrites only (no diffs)

## Runtime modes
- APP_MODE=local → localhost services
- APP_MODE=online → hosted services

## Scrapbot dependency
- Scrapbot may be offline in local dev
- Dashboard must degrade gracefully
