import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  companyVaultFiles,
  companyVaultFolders,
  type Database,
} from "@frog1/db";
import { and, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { DATABASE } from "../database/database.constants";
import { S3Service } from "../rov-inspection/s3.service";
import type {
  CreateVaultFolderInput,
  FileCategory,
  UpdateVaultFileInput,
  UpdateVaultFolderInput,
  VaultFile,
  VaultFolder,
  VaultOverviewResponse,
  VaultStats,
} from "@frog1/shared";

@Injectable()
export class CompanyVaultService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly s3: S3Service,
  ) {}

  private determineCategory(mimeType: string, filename: string): FileCategory {
    const ext = extname(filename).toLowerCase();
    if (mimeType.startsWith("video/") || [".mp4", ".mov", ".avi", ".webm", ".mkv"].includes(ext)) {
      return "video";
    }
    if (mimeType.startsWith("image/") || [".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"].includes(ext)) {
      return "image";
    }
    if (
      mimeType.includes("spreadsheet") ||
      mimeType.includes("excel") ||
      mimeType.includes("csv") ||
      [".xlsx", ".xls", ".csv"].includes(ext)
    ) {
      return "spreadsheet";
    }
    if (
      mimeType.includes("zip") ||
      mimeType.includes("tar") ||
      mimeType.includes("rar") ||
      mimeType.includes("7z") ||
      mimeType.includes("compressed") ||
      [".zip", ".rar", ".7z", ".tar", ".gz"].includes(ext)
    ) {
      return "archive";
    }
    if (
      mimeType.includes("pdf") ||
      mimeType.includes("word") ||
      mimeType.includes("document") ||
      mimeType.includes("text") ||
      [".pdf", ".doc", ".docx", ".txt", ".rtf"].includes(ext)
    ) {
      return "document";
    }
    return "other";
  }

  async getOverview(organizationId: string): Promise<VaultOverviewResponse> {
    const [rawFolders, rawFiles] = await Promise.all([
      this.db
        .select()
        .from(companyVaultFolders)
        .where(eq(companyVaultFolders.organizationId, organizationId)),
      this.db
        .select()
        .from(companyVaultFiles)
        .where(eq(companyVaultFiles.organizationId, organizationId)),
    ]);

    const folders: VaultFolder[] = rawFolders.map((f) => ({
      id: f.id,
      name: f.name,
      description: f.description ?? undefined,
      color: f.color ?? "amber",
      parentFolderId: f.parentFolderId,
      createdBy: f.createdBy ?? undefined,
      createdAt: f.createdAt.toISOString(),
      updatedAt: f.updatedAt.toISOString(),
    }));

    const files: VaultFile[] = rawFiles.map((f) => {
      const publicUrl = this.s3.getPublicUrl(f.s3Key);
      return {
        id: f.id,
        name: f.name,
        sizeBytes: Number(f.sizeBytes),
        mimeType: f.mimeType,
        category: (f.category as FileCategory) || "document",
        url: publicUrl ?? undefined,
        s3Key: f.s3Key,
        folderId: f.folderId,
        uploadedBy: f.uploadedBy ?? undefined,
        createdAt: f.createdAt.toISOString(),
        updatedAt: f.updatedAt.toISOString(),
      };
    });

    const totalUsedBytes = files.reduce((acc, f) => acc + (f.sizeBytes || 0), 0);
    const documentsCount = files.filter((f) => f.category === "document").length;
    const videosCount = files.filter((f) => f.category === "video").length;
    const imagesCount = files.filter((f) => f.category === "image").length;
    const spreadsheetsCount = files.filter((f) => f.category === "spreadsheet").length;

    const stats: VaultStats = {
      totalUsedBytes,
      totalFiles: files.length,
      totalFolders: folders.length,
      documentsCount,
      videosCount,
      imagesCount,
      spreadsheetsCount,
    };

    return {
      folders,
      files,
      stats,
    };
  }

  async createFolder(
    organizationId: string,
    dto: CreateVaultFolderInput,
    userName?: string,
  ): Promise<VaultFolder> {
    const [inserted] = await this.db
      .insert(companyVaultFolders)
      .values({
        organizationId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        color: dto.color || "amber",
        parentFolderId: dto.parentFolderId || null,
        createdBy: userName || null,
      })
      .returning();

    return {
      id: inserted.id,
      name: inserted.name,
      description: inserted.description ?? undefined,
      color: inserted.color,
      parentFolderId: inserted.parentFolderId,
      createdBy: inserted.createdBy ?? undefined,
      createdAt: inserted.createdAt.toISOString(),
      updatedAt: inserted.updatedAt.toISOString(),
    };
  }

  async updateFolder(
    organizationId: string,
    folderId: string,
    dto: UpdateVaultFolderInput,
  ): Promise<VaultFolder> {
    const [updated] = await this.db
      .update(companyVaultFolders)
      .set({
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
        ...(dto.color ? { color: dto.color } : {}),
        ...(dto.parentFolderId !== undefined ? { parentFolderId: dto.parentFolderId } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(companyVaultFolders.id, folderId),
          eq(companyVaultFolders.organizationId, organizationId),
        ),
      )
      .returning();

    if (!updated) {
      throw new NotFoundException("Folder not found");
    }

    return {
      id: updated.id,
      name: updated.name,
      description: updated.description ?? undefined,
      color: updated.color,
      parentFolderId: updated.parentFolderId,
      createdBy: updated.createdBy ?? undefined,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async deleteFolder(organizationId: string, folderId: string): Promise<boolean> {
    // Fetch all files in this folder to delete from S3
    const filesToDelete = await this.db
      .select()
      .from(companyVaultFiles)
      .where(
        and(
          eq(companyVaultFiles.folderId, folderId),
          eq(companyVaultFiles.organizationId, organizationId),
        ),
      );

    for (const f of filesToDelete) {
      try {
        await this.s3.deleteObject(f.s3Key);
      } catch (err) {
        console.warn(`[Vault] Failed to delete S3 object ${f.s3Key}:`, err);
      }
    }

    // Delete DB records for files
    await this.db
      .delete(companyVaultFiles)
      .where(
        and(
          eq(companyVaultFiles.folderId, folderId),
          eq(companyVaultFiles.organizationId, organizationId),
        ),
      );

    // Delete folder record
    await this.db
      .delete(companyVaultFolders)
      .where(
        and(
          eq(companyVaultFolders.id, folderId),
          eq(companyVaultFolders.organizationId, organizationId),
        ),
      );

    return true;
  }

  async uploadFile(
    organizationId: string,
    file: Express.Multer.File,
    folderId: string | null = null,
    userName?: string,
  ): Promise<VaultFile> {
    if (!file) {
      throw new BadRequestException("No file provided");
    }

    const safeFilename = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const s3Key = `company-vault/${organizationId}/${randomUUID()}-${safeFilename}`;
    const category = this.determineCategory(file.mimetype, file.originalname);

    // Upload directly to S3
    await this.s3.putObject(s3Key, file.buffer, file.mimetype || "application/octet-stream");

    const [inserted] = await this.db
      .insert(companyVaultFiles)
      .values({
        organizationId,
        folderId: folderId || null,
        name: file.originalname,
        sizeBytes: file.size,
        mimeType: file.mimetype || "application/octet-stream",
        category,
        s3Key,
        uploadedBy: userName || null,
      })
      .returning();

    const publicUrl = this.s3.getPublicUrl(inserted.s3Key);

    return {
      id: inserted.id,
      name: inserted.name,
      sizeBytes: Number(inserted.sizeBytes),
      mimeType: inserted.mimeType,
      category: inserted.category as FileCategory,
      url: publicUrl ?? undefined,
      s3Key: inserted.s3Key,
      folderId: inserted.folderId,
      uploadedBy: inserted.uploadedBy ?? undefined,
      createdAt: inserted.createdAt.toISOString(),
      updatedAt: inserted.updatedAt.toISOString(),
    };
  }

  async updateFile(
    organizationId: string,
    fileId: string,
    dto: UpdateVaultFileInput,
  ): Promise<VaultFile> {
    const [updated] = await this.db
      .update(companyVaultFiles)
      .set({
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.folderId !== undefined ? { folderId: dto.folderId } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(companyVaultFiles.id, fileId),
          eq(companyVaultFiles.organizationId, organizationId),
        ),
      )
      .returning();

    if (!updated) {
      throw new NotFoundException("File not found");
    }

    const publicUrl = this.s3.getPublicUrl(updated.s3Key);

    return {
      id: updated.id,
      name: updated.name,
      sizeBytes: Number(updated.sizeBytes),
      mimeType: updated.mimeType,
      category: updated.category as FileCategory,
      url: publicUrl ?? undefined,
      s3Key: updated.s3Key,
      folderId: updated.folderId,
      uploadedBy: updated.uploadedBy ?? undefined,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async deleteFile(organizationId: string, fileId: string): Promise<boolean> {
    const [found] = await this.db
      .select()
      .from(companyVaultFiles)
      .where(
        and(
          eq(companyVaultFiles.id, fileId),
          eq(companyVaultFiles.organizationId, organizationId),
        ),
      );

    if (!found) {
      throw new NotFoundException("File not found");
    }

    try {
      await this.s3.deleteObject(found.s3Key);
    } catch (err) {
      console.warn(`[Vault] Failed to delete S3 object ${found.s3Key}:`, err);
    }

    await this.db
      .delete(companyVaultFiles)
      .where(
        and(
          eq(companyVaultFiles.id, fileId),
          eq(companyVaultFiles.organizationId, organizationId),
        ),
      );

    return true;
  }

  async getPresignedUrl(organizationId: string, fileId: string): Promise<string> {
    const [found] = await this.db
      .select()
      .from(companyVaultFiles)
      .where(
        and(
          eq(companyVaultFiles.id, fileId),
          eq(companyVaultFiles.organizationId, organizationId),
        ),
      );

    if (!found) {
      throw new NotFoundException("File not found");
    }

    const presigned = await this.s3.getPresignedUrl(found.s3Key, 7200);
    if (!presigned) {
      const publicUrl = this.s3.getPublicUrl(found.s3Key);
      if (publicUrl) return publicUrl;
      throw new NotFoundException("Download URL not available");
    }

    return presigned;
  }
}
