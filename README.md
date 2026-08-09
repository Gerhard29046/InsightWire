# InsightWire

AI-powered Newsroom Intelligence Platform — helps journalists discover, track, and build stories on emerging events before they become mainstream news.

## Vision

Not a news website, and not a weather service. A continuous intelligence system: crawlers gather information from trusted public sources, AI analyzes and scores it, and a dashboard surfaces it via timelines, calendars, maps, and alerts across government, business, courts, markets, elections, natural disasters, conflicts, and science. Routine weather (forecasts, thunderstorm/wind statements, ordinary alerts) is deliberately excluded — only genuinely significant natural disasters (major earthquake, tsunami, volcanic eruption, major cyclone, catastrophic flooding, major wildfire) are journalistically relevant here (see `docs/decisions/0014-remove-weather-keep-natural-disasters.md`).

## Stack

- **Frontend:** React, TypeScript, Vite, TailwindCSS, Framer Motion
- **Backend:** Cloudflare Workers, Queues, Cron Triggers, AI Gateway
- **Database:** Supabase (PostgreSQL, Auth, Storage, Realtime, pgvector)
- **AI:** Claude, OpenAI, Gemini (local models via Ollama planned)

## Status

Early scaffolding. See [`docs/decisions/`](docs/decisions) for architectural decisions made so far.

## Development

```bash
npm install
npm run dev      # local dev server
npm run build    # production build -> dist/
```

Project tooling and MCP server setup are documented in [`docs/decisions/0001-mcp-server-setup.md`](docs/decisions/0001-mcp-server-setup.md).

## Deployment

Cloudflare Pages, connected to `main` on this repo:

- **Build command:** `npm run build`
- **Build output directory:** `dist`
