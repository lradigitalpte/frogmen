import { BadRequestException, Body, Controller, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  RequireActiveOrg,
} from "@thallesp/nestjs-better-auth";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CurrentSecurity } from "../security/current-security.decorator";
import { RequirePermission } from "../security/require-permission.decorator";
import type { SecurityContext } from "../security/security-context";
import {
  s3AbortUploadSchema,
  s3CompleteUploadSchema,
  s3CreateUploadSchema,
  s3SignPartSchema,
  s3UploadPartSchema,
} from "./dto/rov.dto";
import { S3Service } from "./s3.service";

const PART_UPLOAD_LIMIT = 50 * 1024 * 1024;
@Controller("v1/rov/s3-multipart")
@RequireActiveOrg()
@RequirePermission("rov.manage")
export class S3MultipartController {
  constructor(private readonly s3Service: S3Service) {}

  @Post("create")
  create(
    @CurrentSecurity() context: SecurityContext,
    @Body(new ZodValidationPipe(s3CreateUploadSchema))
    body: { filename: string; contentType: string },
  ) {
    return this.s3Service.createMultipartUpload(context.organizationId, body.filename, body.contentType);
  }

  @Post("sign")
  signPart(
    @CurrentSecurity() context: SecurityContext,
    @Body(new ZodValidationPipe(s3SignPartSchema))
    body: { key: string; uploadId: string; partNumber: number },
  ) {
    return this.s3Service.signUploadPart(
      context.organizationId,
      body.key,
      body.uploadId,
      body.partNumber,
    );
  }

  @Post("upload-part")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: PART_UPLOAD_LIMIT },
    }),
  )
  uploadPart(
    @CurrentSecurity() context: SecurityContext,
    @UploadedFile() file: Express.Multer.File,
    @Body("key") key: string,
    @Body("uploadId") uploadId: string,
    @Body("partNumber") partNumber: string,
  ) {
    if (!file) {
      throw new BadRequestException("File part is required");
    }

    const body = s3UploadPartSchema.parse({ key, uploadId, partNumber });

    return this.s3Service.uploadPart(
      context.organizationId,
      body.key,
      body.uploadId,
      body.partNumber,
      file.buffer,
    );
  }

  @Post("complete")
  complete(
    @CurrentSecurity() context: SecurityContext,
    @Body(new ZodValidationPipe(s3CompleteUploadSchema))
    body: {
      key: string;
      uploadId: string;
      parts: Array<{ PartNumber: number; ETag: string }>;
    },
  ) {
    return this.s3Service.completeMultipartUpload(
      context.organizationId,
      body.key,
      body.uploadId,
      body.parts,
    );
  }

  @Post("abort")
  abort(
    @CurrentSecurity() context: SecurityContext,
    @Body(new ZodValidationPipe(s3AbortUploadSchema))
    body: { key: string; uploadId: string },
  ) {
    return this.s3Service.abortMultipartUpload(context.organizationId, body.key, body.uploadId);
  }
}
