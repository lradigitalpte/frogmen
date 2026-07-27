# FrogmenDash deployment

## Architecture

- `apps/web`: Vercel (Next.js)
- `apps/api`: Docker on a VPS (NestJS)
- PostgreSQL: Railway `frogmendash_db`
- All uploaded media: S3-compatible object storage
- Transactional email and password reset: Resend

## Secrets

Never commit `.env`, `.env.local`, private keys, database URLs, Resend keys, or
S3 credentials. Configure API secrets only on the VPS. Vercel receives only the
two variables in `apps/web/.env.production.example`.

Generate the Better Auth secret once and keep the same value across API
restarts:

```sh
openssl rand -base64 48
```

## Vercel web project

1. Import the GitHub repository.
2. Set Root Directory to `frog1/apps/web` while `frog1` remains nested in the
   existing repository. If FrogmenDash is moved into a standalone repository,
   use `apps/web`.
3. Keep Framework Preset as Next.js.
4. Set `NEXT_PUBLIC_APP_URL` to the final Vercel/custom-domain URL.
5. Set server-only `API_URL` to the public HTTPS NestJS API URL.
6. Redeploy whenever either URL changes because rewrites are generated during
   the Next.js build.

## NestJS API

Build from the `frog1` directory:

```sh
docker build -f Dockerfile.api -t frogmendash-api .
```

Run with the production environment:

```sh
docker run -d \
  --name frogmendash-api \
  --restart unless-stopped \
  --env-file .env.production \
  -p 127.0.0.1:3001:3001 \
  frogmendash-api
```

Terminate TLS through Caddy or Nginx and proxy the API hostname to
`127.0.0.1:3001`. Do not expose PostgreSQL publicly from the VPS.

## Required API variables

Use `apps/api/.env.production.example` as the checklist. The production
database URL must target `frogmendash_db`, not Polygraph's `railway` database.
`BETTER_AUTH_URL` should be the public web URL because authentication is
accessed through the Next.js `/api` rewrite.

The S3 bucket must allow multipart create/upload/complete/abort, object get,
head, put, and delete for the FrogmenDash prefixes. Large ROV media uses
`rov-inspection/media/`; logos, catalog/customer images, and ROV plan images
use `app-uploads/`. The configured development credentials were verified with
a temporary upload and cleanup on 2026-07-26.

PDFs are generated on demand by Chromium and streamed to the user or attached
directly to email. They are not duplicated in S3. If immutable PDF snapshots
are required later, add a separate document-archive retention policy.

For Resend, verify the sender domain and make `MAIL_FROM_ADDRESS` an address on
that domain. A valid API key alone is not enough for production delivery.

## Backups

Back up `frogmendash_db` independently from Polygraph using a nightly
compressed `pg_dump`, store it off Railway, and test restoration regularly.
Enable bucket versioning or an object-storage backup policy for uploaded media.
