import { z } from "zod";

export const fileCategorySchema = z.enum([
  "document",
  "video",
  "image",
  "spreadsheet",
  "archive",
  "other",
]);

export type FileCategory = z.infer<typeof fileCategorySchema>;

export const createVaultFolderSchema = z.object({
  name: z.string().min(1, "Folder name is required").max(255),
  description: z.string().optional(),
  color: z.string().max(50).default("amber"),
  parentFolderId: z.string().uuid().nullable().optional(),
});

export type CreateVaultFolderInput = z.infer<typeof createVaultFolderSchema>;

export const updateVaultFolderSchema = z.object({
  name: z.string().min(1, "Folder name is required").max(255).optional(),
  description: z.string().nullable().optional(),
  color: z.string().max(50).optional(),
  parentFolderId: z.string().uuid().nullable().optional(),
});

export type UpdateVaultFolderInput = z.infer<typeof updateVaultFolderSchema>;

export const updateVaultFileSchema = z.object({
  name: z.string().min(1, "File name is required").max(255).optional(),
  folderId: z.string().uuid().nullable().optional(),
});

export type UpdateVaultFileInput = z.infer<typeof updateVaultFileSchema>;

export interface VaultFolder {
  id: string;
  name: string;
  description?: string;
  color: string;
  parentFolderId: string | null;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VaultFile {
  id: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  category: FileCategory;
  url?: string;
  s3Key?: string;
  folderId: string | null;
  uploadedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VaultStats {
  totalUsedBytes: number;
  totalFiles: number;
  totalFolders: number;
  documentsCount: number;
  videosCount: number;
  imagesCount: number;
  spreadsheetsCount: number;
}

export interface VaultOverviewResponse {
  folders: VaultFolder[];
  files: VaultFile[];
  stats: VaultStats;
}
