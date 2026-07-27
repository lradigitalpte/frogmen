import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { S3Service } from "../rov-inspection/s3.service";

const OBJECT_PREFIX = "app-uploads/";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

@Injectable()
export class UploadsService {
  constructor(private readonly s3: S3Service) {}

  private objectKey(relativePath: string) {
    if (
      !relativePath ||
      relativePath.includes("\0") ||
      relativePath.includes("..") ||
      relativePath.includes("\\") ||
      relativePath.startsWith("/")
    ) {
      throw new NotFoundException("File not found");
    }
    return `${OBJECT_PREFIX}${relativePath}`;
  }

  private assertOrganizationPath(
    relativePath: string,
    namespace: string,
    organizationId: string,
  ) {
    if (!relativePath.startsWith(`${namespace}/${organizationId}/`)) {
      throw new NotFoundException("File not found");
    }
  }

  validateAvatarFile(file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException("Avatar file is required");
    }
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException("Avatar must be a JPEG, PNG, WebP, or GIF");
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException("Avatar must be smaller than 5 MB");
    }
  }

  validateImageFile(file: Express.Multer.File) {
    this.validateAvatarFile(file);
  }

  private async save(relativePath: string, file: Express.Multer.File) {
    await this.s3.putObject(
      this.objectKey(relativePath),
      file.buffer,
      file.mimetype,
    );
    return relativePath;
  }

  async saveProductImage(
    organizationId: string,
    productId: string,
    file: Express.Multer.File,
  ) {
    this.validateImageFile(file);
    const ext =
      MIME_TO_EXT[file.mimetype] ?? extname(file.originalname) ?? ".jpg";
    return this.save(
      `products/${organizationId}/${productId}/${randomUUID()}${ext}`,
      file,
    );
  }

  async saveCustomerAvatar(
    organizationId: string,
    customerId: string,
    file: Express.Multer.File,
  ) {
    this.validateAvatarFile(file);
    const ext =
      MIME_TO_EXT[file.mimetype] ?? extname(file.originalname) ?? ".jpg";
    return this.save(`avatars/${organizationId}/${customerId}${ext}`, file);
  }

  async saveOrganizationLogo(
    organizationId: string,
    file: Express.Multer.File,
  ) {
    this.validateAvatarFile(file);
    const ext =
      MIME_TO_EXT[file.mimetype] ?? extname(file.originalname) ?? ".jpg";
    return this.save(`org-logos/${organizationId}/logo${ext}`, file);
  }

  private async open(relativePath: string) {
    try {
      return await this.s3.getObjectStream(this.objectKey(relativePath));
    } catch {
      throw new NotFoundException("File not found");
    }
  }

  async getProductImageStream(
    organizationId: string,
    relativePath: string,
  ) {
    this.assertOrganizationPath(relativePath, "products", organizationId);
    return this.open(relativePath);
  }

  async getOrganizationLogoStream(
    organizationId: string,
    relativePath: string,
  ) {
    this.assertOrganizationPath(relativePath, "org-logos", organizationId);
    return this.open(relativePath);
  }

  async getCustomerAvatarStream(
    organizationId: string,
    relativePath: string,
  ) {
    this.assertOrganizationPath(relativePath, "avatars", organizationId);
    return this.open(relativePath);
  }

  async getRovFileStream(organizationId: string, relativePath: string) {
    this.assertOrganizationPath(relativePath, "rov", organizationId);
    return this.open(relativePath);
  }

  async readStoredFileAsDataUri(relativePath: string) {
    try {
      const result = await this.open(relativePath);
      return `data:${result.contentType};base64,${result.buffer.toString("base64")}`;
    } catch {
      return null;
    }
  }

  async deleteStoredFile(relativePath: string | null | undefined) {
    if (!relativePath) return;
    await this.s3.deleteObject(this.objectKey(relativePath));
  }
}
