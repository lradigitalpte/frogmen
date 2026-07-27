import { z } from "zod";

export const rovProjectStatusSchema = z.enum([
  "draft",
  "in_progress",
  "completed",
  "archived",
]);

export const inspectionSeveritySchema = z.enum(["major", "moderate", "minor"]);
export const inspectionViewTypeSchema = z.enum(["rov", "diver"]);
export const inspectionMediaTypeSchema = z.enum(["video", "image", "document"]);
export const inspectionReportStatusSchema = z.enum([
  "draft",
  "final",
  "shared",
  "archived",
]);

export const listRovProjectsQuerySchema = z.object({
  search: z.string().optional(),
  status: rovProjectStatusSchema.optional(),
  customerId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).optional(),
  perPage: z.coerce.number().int().min(1).max(200).optional(),
});

export const createRovProjectSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  location: z.string().max(255).optional(),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  status: rovProjectStatusSchema.optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  customerId: z.string().uuid().optional().nullable(),
});

export const updateRovProjectSchema = createRovProjectSchema.partial();

export const createStructureSchema = z.object({
  name: z.string().min(1).max(150),
  description: z.string().optional(),
  diagramPath: z.string().optional(),
  photoPath: z.string().optional(),
  sort: z.number().int().optional(),
});

export const updateStructureSchema = createStructureSchema.partial();

export const createViewSchema = z.object({
  name: z.string().min(1).max(150),
  viewType: inspectionViewTypeSchema.optional(),
});

export const updateViewSchema = createViewSchema.partial();

export const createPointSchema = z.object({
  xCoordinate: z.number(),
  yCoordinate: z.number(),
  severity: inspectionSeveritySchema.optional(),
  findingType: z.string().max(100).optional(),
  description: z.string().optional(),
  diveLocation: z.string().max(150).optional(),
  depthM: z.string().optional(),
  dimensionMm: z.string().max(50).optional(),
  recommendations: z.string().optional(),
  label: z.string().max(100).optional(),
});

export const updatePointSchema = createPointSchema
  .extend({
    xCoordinate: z.number().optional(),
    yCoordinate: z.number().optional(),
  })
  .partial();

export const createMediaSchema = z.object({
  structureId: z.string().uuid(),
  inspectionPointId: z.string().uuid().optional().nullable(),
  mediaType: inspectionMediaTypeSchema,
  fileName: z.string().min(1).max(255),
  filePath: z.string().min(1),
  mimeType: z.string().optional(),
  fileSize: z.number().int().optional(),
  duration: z.number().int().optional(),
});

export const updateMediaSchema = z.object({
  inspectionPointId: z.string().uuid().optional().nullable(),
  fileName: z.string().min(1).max(255).optional(),
});

export const createReportSchema = z.object({
  title: z.string().max(255).optional(),
  summary: z.string().optional(),
  fullReport: z.string().optional(),
  conclusions: z.string().optional(),
  recommendations: z.string().optional(),
  status: inspectionReportStatusSchema.optional(),
  clientCanDownload: z.boolean().optional(),
  clientCanPrint: z.boolean().optional(),
  sharedLinkExpiresAt: z.string().optional().nullable(),
});

export const updateReportSchema = createReportSchema.partial();

export const s3CreateUploadSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1),
});

export const s3SignPartSchema = z.object({
  key: z.string().min(1),
  uploadId: z.string().min(1),
  partNumber: z.coerce.number().int().min(1).max(10000),
});

export const s3UploadPartSchema = s3SignPartSchema;

export const s3CompleteUploadSchema = z.object({
  key: z.string().min(1),
  uploadId: z.string().min(1),
  parts: z
    .array(
      z.object({
        PartNumber: z.number().int().min(1),
        ETag: z.string().min(1),
      }),
    )
    .min(1),
});

export const s3AbortUploadSchema = z.object({
  key: z.string().min(1),
  uploadId: z.string().min(1),
});

export type ListRovProjectsQuery = z.infer<typeof listRovProjectsQuerySchema>;
export type CreateRovProjectInput = z.infer<typeof createRovProjectSchema>;
export type UpdateRovProjectInput = z.infer<typeof updateRovProjectSchema>;
export type CreateStructureInput = z.infer<typeof createStructureSchema>;
export type UpdateStructureInput = z.infer<typeof updateStructureSchema>;
export type CreateViewInput = z.infer<typeof createViewSchema>;
export type UpdateViewInput = z.infer<typeof updateViewSchema>;
export type CreatePointInput = z.infer<typeof createPointSchema>;
export type UpdatePointInput = z.infer<typeof updatePointSchema>;
export type CreateMediaInput = z.infer<typeof createMediaSchema>;
export type UpdateMediaInput = z.infer<typeof updateMediaSchema>;
export type CreateReportInput = z.infer<typeof createReportSchema>;
export type UpdateReportInput = z.infer<typeof updateReportSchema>;
