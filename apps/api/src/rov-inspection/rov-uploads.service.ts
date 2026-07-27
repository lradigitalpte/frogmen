import {
  BadRequestException,
  Injectable,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { S3Service } from "./s3.service";

const OBJECT_PREFIX = "app-uploads/";

const ALLOWED_IMAGE_TYPES = new Set([
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
export class RovUploadsService {
  constructor(private readonly s3: S3Service) {}

  validateImageFile(file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException("File is required");
    }

    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      throw new BadRequestException("File must be a JPEG, PNG, WebP, or GIF");
    }

    if (file.size > 20 * 1024 * 1024) {
      throw new BadRequestException("File must be smaller than 20 MB");
    }
  }

  async saveProjectImage(
    organizationId: string,
    projectId: string,
    kind: string,
    file: Express.Multer.File,
  ) {
    this.validateImageFile(file);

    const ext = MIME_TO_EXT[file.mimetype] ?? extname(file.originalname) ?? ".jpg";
    const imageId = randomUUID();
    const relativePath = `rov/${organizationId}/${projectId}/${kind}/${imageId}${ext}`;
    await this.s3.putObject(
      `${OBJECT_PREFIX}${relativePath}`,
      file.buffer,
      file.mimetype,
    );

    return relativePath;
  }

  async saveStructureImage(
    organizationId: string,
    projectId: string,
    structureId: string,
    kind: "diagram" | "photo",
    file: Express.Multer.File,
  ) {
    this.validateImageFile(file);

    const ext = MIME_TO_EXT[file.mimetype] ?? extname(file.originalname) ?? ".jpg";
    const imageId = randomUUID();
    const relativePath = `rov/${organizationId}/${projectId}/structures/${structureId}/${kind}/${imageId}${ext}`;
    await this.s3.putObject(
      `${OBJECT_PREFIX}${relativePath}`,
      file.buffer,
      file.mimetype,
    );

    return relativePath;
  }
}
