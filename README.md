# InsightWire

AI-powered Newsroom Intelligence Platform — helps journalists discover, track, and build stories on emerging events before they become mainstream news.

## Vision

Not a news website. A continuous intelligence system: crawlers gather information from trusted public sources, AI analyzes and scores it, and a dashboard surfaces it via timelines, calendars, maps, and alerts across government, business, courts, markets, elections, weather/disasters, conflicts, and science.

## Stack

- **Frontend:** React, TypeScript, Vite, TailwindCSS, Framer Motion
- **Backend:** Cloudflare Workers, Queues, Cron Triggers, AI Gateway
- **Database:** Supabase (PostgreSQL, Auth, Storage, Realtime, pgvector)
- **AI:** Claude, OpenAI, Gemini (local models via Ollama planned)

## Status

Early scaffolding. See [`docs/decisions/`](docs/decisions) for architectural decisions made so far.

## Development

Project tooling and MCP server setup are documented in [`docs/decisions/0001-mcp-server-setup.md`](docs/decisions/0001-mcp-server-setup.md).
