import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  RequireActiveOrg,
  Session,
  type UserSession,
} from "@thallesp/nestjs-better-auth";
import {
  createVaultFolderSchema,
  updateVaultFileSchema,
  updateVaultFolderSchema,
  type CreateVaultFolderInput,
  type UpdateVaultFileInput,
  type UpdateVaultFolderInput,
} from "@frog1/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CompanyVaultService } from "./company-vault.service";

@Controller("v1/settings/vault")
@RequireActiveOrg()
export class CompanyVaultController {
  constructor(private readonly vaultService: CompanyVaultService) {}

  private orgId(session: UserSession) {
    const organizationId = session.session.activeOrganizationId;
    if (!organizationId) {
      throw new Error("Active organization is required");
    }
    return organizationId;
  }

  @Get("overview")
  getOverview(@Session() session: UserSession) {
    return this.vaultService.getOverview(this.orgId(session));
  }

  @Post("folders")
  createFolder(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(createVaultFolderSchema))
    body: CreateVaultFolderInput,
  ) {
    return this.vaultService.createFolder(
      this.orgId(session),
      body,
      session.user?.name || undefined,
    );
  }

  @Patch("folders/:id")
  updateFolder(
    @Session() session: UserSession,
    @Param("id") folderId: string,
    @Body(new ZodValidationPipe(updateVaultFolderSchema))
    body: UpdateVaultFolderInput,
  ) {
    return this.vaultService.updateFolder(this.orgId(session), folderId, body);
  }

  @Delete("folders/:id")
  deleteFolder(
    @Session() session: UserSession,
    @Param("id") folderId: string,
  ) {
    return this.vaultService.deleteFolder(this.orgId(session), folderId);
  }

  @Post("upload")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: {
        fileSize: 500 * 1024 * 1024, // 500 MB upload limit
      },
    }),
  )
  uploadFile(
    @Session() session: UserSession,
    @UploadedFile() file: Express.Multer.File,
    @Body("folderId") folderId?: string,
  ) {
    return this.vaultService.uploadFile(
      this.orgId(session),
      file,
      folderId && folderId !== "null" ? folderId : null,
      session.user?.name || undefined,
    );
  }

  @Patch("files/:id")
  updateFile(
    @Session() session: UserSession,
    @Param("id") fileId: string,
    @Body(new ZodValidationPipe(updateVaultFileSchema))
    body: UpdateVaultFileInput,
  ) {
    return this.vaultService.updateFile(this.orgId(session), fileId, body);
  }

  @Delete("files/:id")
  deleteFile(
    @Session() session: UserSession,
    @Param("id") fileId: string,
  ) {
    return this.vaultService.deleteFile(this.orgId(session), fileId);
  }

  @Get("files/:id/download")
  async getDownloadUrl(
    @Session() session: UserSession,
    @Param("id") fileId: string,
  ) {
    const url = await this.vaultService.getPresignedUrl(
      this.orgId(session),
      fileId,
    );
    return { url };
  }
}
