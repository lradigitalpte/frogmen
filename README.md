# FrogmenDash

Branch-aware ERP workspace for Frogmen Technologies, built with Next.js,
NestJS, PostgreSQL, Drizzle ORM, and S3-compatible object storage.

## Applications

- `apps/web` — Next.js dashboard
- `apps/api` — NestJS API
- `packages/db` — PostgreSQL schema and migrations
- `packages/shared` — shared types and document templates

## Development

```bash
pnpm install
docker compose up -d
pnpm dev:api
pnpm dev:web
```

Copy `.env.example` to `.env` and configure local values. Never commit real
database credentials, authentication secrets, email API keys, or S3 keys.

Production setup is documented in [`docs/deployment.md`](docs/deployment.md).
