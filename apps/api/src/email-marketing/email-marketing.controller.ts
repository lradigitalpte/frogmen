import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import {
  audiencePreviewQuerySchema,
  createEmailCampaignSchema,
  createEmailTemplateSchema,
  listEmailCampaignsQuerySchema,
  testSendCampaignSchema,
  targetAudienceFilterSchema,
  unsubscribeSchema,
  updateEmailCampaignSchema,
  updateEmailTemplateSchema,
  type AudiencePreviewQuery,
  type CreateEmailCampaignInput,
  type CreateEmailTemplateInput,
  type ListEmailCampaignsQuery,
  type TargetAudienceFilter,
  type TestSendCampaignInput,
  type UnsubscribeInput,
  type UpdateEmailCampaignInput,
  type UpdateEmailTemplateInput,
} from "@frog1/shared";
import {
  RequireActiveOrg,
  Session,
  type UserSession,
} from "@thallesp/nestjs-better-auth";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { EmailMarketingService } from "./email-marketing.service";

// Transparent 1x1 GIF buffer for open tracking
const TRANSPARENT_1X1_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

@Controller("v1/email-marketing")
export class EmailMarketingController {
  constructor(
    private readonly emailMarketingService: EmailMarketingService,
  ) {}

  private orgId(session: UserSession): string {
    const organizationId = session.session.activeOrganizationId;
    if (!organizationId) {
      throw new Error("Active organization is required");
    }
    return organizationId;
  }

  // ==========================================
  // TEMPLATES
  // ==========================================

  @Get("templates")
  @RequireActiveOrg()
  async listTemplates(
    @Session() session: UserSession,
    @Query("search") search?: string,
  ) {
    return this.emailMarketingService.listTemplates(this.orgId(session), search);
  }

  @Get("templates/:id")
  @RequireActiveOrg()
  async getTemplate(
    @Session() session: UserSession,
    @Param("id") id: string,
  ) {
    return this.emailMarketingService.getTemplate(this.orgId(session), id);
  }

  @Post("templates")
  @RequireActiveOrg()
  async createTemplate(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(createEmailTemplateSchema))
    input: CreateEmailTemplateInput,
  ) {
    return this.emailMarketingService.createTemplate(this.orgId(session), input);
  }

  @Patch("templates/:id")
  @RequireActiveOrg()
  async updateTemplate(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateEmailTemplateSchema))
    input: UpdateEmailTemplateInput,
  ) {
    return this.emailMarketingService.updateTemplate(
      this.orgId(session),
      id,
      input,
    );
  }

  @Delete("templates/:id")
  @RequireActiveOrg()
  async deleteTemplate(
    @Session() session: UserSession,
    @Param("id") id: string,
  ) {
    return this.emailMarketingService.deleteTemplate(this.orgId(session), id);
  }

  // ==========================================
  // AUDIENCE PREVIEW
  // ==========================================

  @Post("audience-preview")
  @RequireActiveOrg()
  async getAudiencePreview(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(targetAudienceFilterSchema.optional()))
    filter?: TargetAudienceFilter,
  ) {
    return this.emailMarketingService.getAudiencePreview(
      this.orgId(session),
      filter,
    );
  }

  // ==========================================
  // CAMPAIGNS
  // ==========================================

  @Get("campaigns")
  @RequireActiveOrg()
  async listCampaigns(
    @Session() session: UserSession,
    @Query(new ZodValidationPipe(listEmailCampaignsQuerySchema))
    query: ListEmailCampaignsQuery,
  ) {
    return this.emailMarketingService.listCampaigns(this.orgId(session), query);
  }

  @Get("campaigns/:id")
  @RequireActiveOrg()
  async getCampaign(
    @Session() session: UserSession,
    @Param("id") id: string,
  ) {
    return this.emailMarketingService.getCampaign(this.orgId(session), id);
  }

  @Post("campaigns")
  @RequireActiveOrg()
  async createCampaign(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(createEmailCampaignSchema))
    input: CreateEmailCampaignInput,
  ) {
    return this.emailMarketingService.createCampaign(
      this.orgId(session),
      input,
      session.user.id,
    );
  }

  @Patch("campaigns/:id")
  @RequireActiveOrg()
  async updateCampaign(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateEmailCampaignSchema))
    input: UpdateEmailCampaignInput,
  ) {
    return this.emailMarketingService.updateCampaign(
      this.orgId(session),
      id,
      input,
    );
  }

  @Delete("campaigns/:id")
  @RequireActiveOrg()
  async deleteCampaign(
    @Session() session: UserSession,
    @Param("id") id: string,
  ) {
    return this.emailMarketingService.deleteCampaign(this.orgId(session), id);
  }

  @Get("campaigns/:id/recipients")
  @RequireActiveOrg()
  async getCampaignRecipients(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Query("status") status?: string,
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("perPage") perPage?: string,
  ) {
    return this.emailMarketingService.getCampaignRecipients(
      this.orgId(session),
      id,
      {
        status,
        search,
        page: page ? parseInt(page, 10) : undefined,
        perPage: perPage ? parseInt(perPage, 10) : undefined,
      },
    );
  }

  @Post("campaigns/:id/send")
  @RequireActiveOrg()
  async sendCampaign(
    @Session() session: UserSession,
    @Param("id") id: string,
  ) {
    return this.emailMarketingService.sendCampaign(this.orgId(session), id);
  }

  @Post("test-send")
  @RequireActiveOrg()
  async testSend(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(testSendCampaignSchema))
    input: TestSendCampaignInput,
  ) {
    return this.emailMarketingService.testSend(this.orgId(session), input);
  }

  // ==========================================
  // PUBLIC TRACKING & WEBHOOKS
  // ==========================================

  @Get("track/open/:token")
  @Header("Content-Type", "image/gif")
  @Header("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
  async trackOpen(@Param("token") token: string, @Res() res: Response) {
    try {
      await this.emailMarketingService.trackOpen(token);
    } catch {
      // Ignore error for tracking pixel
    }
    res.end(TRANSPARENT_1X1_GIF);
  }

  @Get("track/click/:token")
  async trackClick(
    @Param("token") token: string,
    @Query("url") targetUrl: string,
    @Res() res: Response,
  ) {
    try {
      const destination = await this.emailMarketingService.trackClick(
        token,
        targetUrl,
      );
      res.redirect(destination || "/");
    } catch {
      res.redirect(targetUrl || "/");
    }
  }

  @Post("unsubscribe")
  async unsubscribe(
    @Body(new ZodValidationPipe(unsubscribeSchema)) input: UnsubscribeInput,
  ) {
    return this.emailMarketingService.handleUnsubscribe(
      input.token,
      input.reason,
    );
  }

  @Post("webhooks/resend")
  async resendWebhook(@Body() payload: any) {
    return this.emailMarketingService.handleResendWebhook(payload);
  }
}
