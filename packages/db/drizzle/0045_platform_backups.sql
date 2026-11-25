CREATE TABLE IF NOT EXISTS "platform_backups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" text NOT NULL,
  "tenant_name" text NOT NULL,
  "tenant_slug" text NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'running',
  "object_key" text,
  "size_bytes" bigint,
  "table_count" integer,
  "row_count" integer,
  "error" text,
  "created_by_email" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "last_downloaded_at" timestamptz,
  "last_downloaded_by_email" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "platform_backups_one_running_idx" ON "platform_backups" ("tenant_id") WHERE "status" = 'running';
--> statement-breakpoint
ALTER TABLE "platform_backups" ENABLE ROW LEVEL SECURITY;
