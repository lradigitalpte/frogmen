import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
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
  updateCompanySettingsSchema,
  updateDocumentTemplatesSchema,
  updateSalesPricingSchema,
  type UpdateCompanySettingsInput,
  type UpdateDocumentTemplatesInput,
  type UpdateSalesPricingInput,
} from "@frog1/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { SettingsService } from "./settings.service";

@Controller("v1/settings")
@RequireActiveOrg()
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  private orgId(session: UserSession) {
    const organizationId = session.session.activeOrganizationId;

    if (!organizationId) {
      throw new Error("Active organization is required");
    }

    return organizationId;
  }

  @Get("company")
  getCompany(@Session() session: UserSession) {
    return this.settingsService.getCompany(this.orgId(session));
  }

  @Patch("company")
  updateCompany(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(updateCompanySettingsSchema))
    body: UpdateCompanySettingsInput,
  ) {
    return this.settingsService.updateCompany(this.orgId(session), body);
  }

  @Post("company/logo")
  @UseInterceptors(FileInterceptor("logo", { limits: { fileSize: 5 * 1024 * 1024 } }))
  uploadCompanyLogo(
    @Session() session: UserSession,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.settingsService.uploadCompanyLogo(this.orgId(session), file);
  }

  @Get("document-templates")
  getDocumentTemplates(@Session() session: UserSession) {
    return this.settingsService.getDocumentTemplates(this.orgId(session));
  }

  @Patch("document-templates")
  updateDocumentTemplates(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(updateDocumentTemplatesSchema))
    body: UpdateDocumentTemplatesInput,
  ) {
    return this.settingsService.updateDocumentTemplates(
      this.orgId(session),
      body,
    );
  }

  @Get("sales-pricing")
  getSalesPricing(@Session() session: UserSession) {
    return this.settingsService.getSalesPricing(this.orgId(session));
  }

  @Patch("sales-pricing")
  updateSalesPricing(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(updateSalesPricingSchema))
    body: UpdateSalesPricingInput,
  ) {
    return this.settingsService.updateSalesPricing(this.orgId(session), body);
  }
}
