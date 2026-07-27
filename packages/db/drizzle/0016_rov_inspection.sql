CREATE TYPE "public"."rov_project_status" AS ENUM('draft', 'in_progress', 'completed', 'archived');
--> statement-breakpoint
CREATE TYPE "public"."inspection_severity" AS ENUM('major', 'moderate', 'minor');
--> statement-breakpoint
CREATE TYPE "public"."inspection_view_type" AS ENUM('rov', 'diver');
--> statement-breakpoint
CREATE TYPE "public"."inspection_media_type" AS ENUM('video', 'image', 'document');
--> statement-breakpoint
CREATE TYPE "public"."inspection_report_status" AS ENUM('draft', 'final', 'shared', 'archived');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rov_projects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "name" varchar(255) NOT NULL,
  "description" text,
  "location" varchar(255),
  "latitude" numeric(10, 7),
  "longitude" numeric(10, 7),
  "plan_view_path" text,
  "status" "rov_project_status" DEFAULT 'draft' NOT NULL,
  "start_date" date,
  "end_date" date,
  "customer_id" uuid REFERENCES "customers"("id") ON DELETE set null,
  "created_by" text REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_structures" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "rov_project_id" uuid NOT NULL REFERENCES "rov_projects"("id") ON DELETE cascade,
  "name" varchar(150) NOT NULL,
  "description" text,
  "diagram_path" text,
  "photo_path" text,
  "sort" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inspection_views" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "structure_id" uuid NOT NULL REFERENCES "project_structures"("id") ON DELETE cascade,
  "name" varchar(150) NOT NULL,
  "view_type" "inspection_view_type" DEFAULT 'rov' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inspection_points" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "inspection_view_id" uuid NOT NULL REFERENCES "inspection_views"("id") ON DELETE cascade,
  "observation_id" varchar(20),
  "point_number" integer,
  "label" varchar(100),
  "x_coordinate" real,
  "y_coordinate" real,
  "severity" "inspection_severity",
  "finding_type" varchar(100),
  "description" text,
  "dive_location" varchar(150),
  "depth_m" numeric(8, 2),
  "dimension_mm" varchar(50),
  "recommendations" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inspection_points_view_point_number_idx" ON "inspection_points" ("inspection_view_id", "point_number");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inspection_media" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "structure_id" uuid NOT NULL REFERENCES "project_structures"("id") ON DELETE cascade,
  "inspection_point_id" uuid REFERENCES "inspection_points"("id") ON DELETE set null,
  "media_type" "inspection_media_type" NOT NULL,
  "file_name" varchar(255) NOT NULL,
  "file_path" text NOT NULL,
  "thumbnail_path" text,
  "mime_type" varchar(100),
  "file_size" integer,
  "duration" integer,
  "uploaded_by" text REFERENCES "users"("id") ON DELETE set null,
  "uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inspection_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "rov_project_id" uuid NOT NULL REFERENCES "rov_projects"("id") ON DELETE cascade,
  "title" varchar(255),
  "summary" text,
  "full_report" text,
  "conclusions" text,
  "recommendations" text,
  "status" "inspection_report_status" DEFAULT 'draft' NOT NULL,
  "shared_link_hash" varchar(255),
  "shared_link_expires_at" timestamp with time zone,
  "client_can_download" boolean DEFAULT true NOT NULL,
  "client_can_print" boolean DEFAULT false NOT NULL,
  "shared_date" timestamp with time zone,
  "shared_by" text REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inspection_reports_project_idx" ON "inspection_reports" ("rov_project_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inspection_reports_share_hash_idx" ON "inspection_reports" ("shared_link_hash");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "report_access_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "report_id" uuid NOT NULL REFERENCES "inspection_reports"("id") ON DELETE cascade,
  "accessed_by" varchar(255),
  "accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ip_address" varchar(45),
  "duration" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
