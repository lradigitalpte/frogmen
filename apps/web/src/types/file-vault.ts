export type FileCategory = "document" | "video" | "image" | "spreadsheet" | "archive" | "other";

export interface VaultFolder {
  id: string;
  name: string;
  description?: string;
  color?: string; // e.g. "blue", "purple", "emerald", "amber", "rose"
  parentFolderId: string | null; // null for root level
  createdAt: string;
  updatedAt: string;
}

export interface VaultFile {
  id: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  category: FileCategory;
  url: string; // S3 or object URL
  folderId: string | null; // null for root level
  uploadedBy: string;
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
