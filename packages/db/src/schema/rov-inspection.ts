import {
  boolean,
  date,
  integer,
  numeric,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations, users } from "./auth";
import { customers } from "./customers";
import { branches } from "./security";

export const rovProjectStatusEnum = pgEnum("rov_project_status", [
  "draft",
  "in_progress",
  "completed",
  "archived",
]);

export const inspectionSeverityEnum = pgEnum("inspection_severity", [
  "major",
  "moderate",
  "minor",
]);

export const inspectionViewTypeEnum = pgEnum("inspection_view_type", [
  "rov",
  "diver",
]);

export const inspectionMediaTypeEnum = pgEnum("inspection_media_type", [
  "video",
  "image",
  "document",
]);

export const inspectionReportStatusEnum = pgEnum("inspection_report_status", [
  "draft",
  "final",
  "shared",
  "archived",
]);

export const rovProjects = pgTable("rov_projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  branchId: uuid("branch_id")
    .notNull()
    .default(sql`app_current_branch_id()`)
    .references(() => branches.id),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  location: varchar("location", { length: 255 }),
  latitude: numeric("latitude", { precision: 10, scale: 7 }),
  longitude: numeric("longitude", { precision: 10, scale: 7 }),
  planViewPath: text("plan_view_path"),
  siteMapPath: text("site_map_path"),
  status: rovProjectStatusEnum("status").notNull().default("draft"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  customerId: uuid("customer_id").references(() => customers.id, {
    onDelete: "set null",
  }),
  createdBy: text("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const projectStructures = pgTable("project_structures", {
  id: uuid("id").primaryKey().defaultRandom(),
  rovProjectId: uuid("rov_project_id")
    .notNull()
    .references(() => rovProjects.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 150 }).notNull(),
  description: text("description"),
  diagramPath: text("diagram_path"),
  photoPath: text("photo_path"),
  sort: integer("sort").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const inspectionViews = pgTable("inspection_views", {
  id: uuid("id").primaryKey().defaultRandom(),
  structureId: uuid("structure_id")
    .notNull()
    .references(() => projectStructures.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 150 }).notNull(),
  viewType: inspectionViewTypeEnum("view_type").notNull().default("rov"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const inspectionPoints = pgTable(
  "inspection_points",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inspectionViewId: uuid("inspection_view_id")
      .notNull()
      .references(() => inspectionViews.id, { onDelete: "cascade" }),
    observationId: varchar("observation_id", { length: 20 }),
    pointNumber: integer("point_number"),
    label: varchar("label", { length: 100 }),
    xCoordinate: real("x_coordinate"),
    yCoordinate: real("y_coordinate"),
    severity: inspectionSeverityEnum("severity"),
    findingType: varchar("finding_type", { length: 100 }),
    description: text("description"),
    diveLocation: varchar("dive_location", { length: 150 }),
    depthM: numeric("depth_m", { precision: 8, scale: 2 }),
    dimensionMm: varchar("dimension_mm", { length: 50 }),
    recommendations: text("recommendations"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("inspection_points_view_point_number_idx").on(
      table.inspectionViewId,
      table.pointNumber,
    ),
  ],
);

export const inspectionMedia = pgTable("inspection_media", {
  id: uuid("id").primaryKey().defaultRandom(),
  structureId: uuid("structure_id")
    .notNull()
    .references(() => projectStructures.id, { onDelete: "cascade" }),
  inspectionPointId: uuid("inspection_point_id").references(
    () => inspectionPoints.id,
    { onDelete: "set null" },
  ),
  mediaType: inspectionMediaTypeEnum("media_type").notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  filePath: text("file_path").notNull(),
  thumbnailPath: text("thumbnail_path"),
  mimeType: varchar("mime_type", { length: 100 }),
  fileSize: integer("file_size"),
  duration: integer("duration"),
  uploadedBy: text("uploaded_by").references(() => users.id, {
    onDelete: "set null",
  }),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const inspectionReports = pgTable(
  "inspection_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .default(sql`app_current_branch_id()`)
      .references(() => branches.id),
    rovProjectId: uuid("rov_project_id")
      .notNull()
      .references(() => rovProjects.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }),
    summary: text("summary"),
    fullReport: text("full_report"),
    conclusions: text("conclusions"),
    recommendations: text("recommendations"),
    status: inspectionReportStatusEnum("status").notNull().default("draft"),
    sharedLinkHash: varchar("shared_link_hash", { length: 255 }),
    sharedLinkExpiresAt: timestamp("shared_link_expires_at", {
      withTimezone: true,
    }),
    clientCanDownload: boolean("client_can_download").notNull().default(true),
    clientCanPrint: boolean("client_can_print").notNull().default(false),
    sharedDate: timestamp("shared_date", { withTimezone: true }),
    sharedBy: text("shared_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("inspection_reports_project_idx").on(table.rovProjectId),
    uniqueIndex("inspection_reports_share_hash_idx").on(table.sharedLinkHash),
  ],
);

export const reportAccessLogs = pgTable("report_access_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  reportId: uuid("report_id")
    .notNull()
    .references(() => inspectionReports.id, { onDelete: "cascade" }),
  accessedBy: varchar("accessed_by", { length: 255 }),
  accessedAt: timestamp("accessed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  ipAddress: varchar("ip_address", { length: 45 }),
  duration: integer("duration"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type RovProject = typeof rovProjects.$inferSelect;
export type NewRovProject = typeof rovProjects.$inferInsert;
export type ProjectStructure = typeof projectStructures.$inferSelect;
export type InspectionView = typeof inspectionViews.$inferSelect;
export type InspectionPoint = typeof inspectionPoints.$inferSelect;
export type InspectionMedia = typeof inspectionMedia.$inferSelect;
export type InspectionReport = typeof inspectionReports.$inferSelect;
export type ReportAccessLog = typeof reportAccessLogs.$inferSelect;
