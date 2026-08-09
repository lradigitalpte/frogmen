import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { S3Service } from "../rov-inspection/s3.service";

const OBJECT_PREFIX = "app-uploads/";

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const ALLOWED_RECEIPT_TYPES = new Set([
  ...ALLOWED_IMAGE_TYPES,
  "application/pdf",
]);

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "application/pdf": ".pdf",
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
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      throw new BadRequestException("Avatar must be a JPEG, PNG, WebP, or GIF");
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException("Avatar must be smaller than 5 MB");
    }
  }

  validateImageFile(file: Express.Multer.File) {
    this.validateAvatarFile(file);
  }

  validateReceiptFile(file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException("Receipt file is required");
    }
    if (!ALLOWED_RECEIPT_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        "Receipt must be a JPEG, PNG, WebP, GIF, or PDF",
      );
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException("Receipt must be smaller than 10 MB");
    }
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

  async saveExpenseReceipt(
    organizationId: string,
    expenseId: string,
    file: Express.Multer.File,
  ) {
    this.validateReceiptFile(file);
    const ext =
      MIME_TO_EXT[file.mimetype] ?? extname(file.originalname) ?? ".jpg";
    return this.save(
      `expenses/${organizationId}/${expenseId}/${randomUUID()}${ext}`,
      file,
    );
  }

  async saveCustomerPoDocument(
    organizationId: string,
    quotationId: string,
    file: Express.Multer.File,
  ) {
    this.validateReceiptFile(file);
    const ext =
      MIME_TO_EXT[file.mimetype] ?? extname(file.originalname) ?? ".pdf";
    return this.save(
      `quotations/${organizationId}/${quotationId}/${randomUUID()}${ext}`,
      file,
    );
  }

  private async open(relativePath: string) {
    try {
      return await this.s3.getObjectStream(this.objectKey(relativePath));
    } catch {
      throw new NotFoundException("File not found");
    }
  }

  async getCustomerPoDocumentStream(
    organizationId: string,
    relativePath: string,
  ) {
    this.assertOrganizationPath(relativePath, "quotations", organizationId);
    return this.open(relativePath);
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

  async getExpenseReceiptStream(
    organizationId: string,
    relativePath: string,
  ) {
    this.assertOrganizationPath(relativePath, "expenses", organizationId);
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
