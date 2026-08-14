import { Body, Controller, Get, Patch, Post, Session } from "@nestjs/common";
import { RequireActiveOrg, type UserSession } from "@thallesp/nestjs-better-auth";
import { RequirePermission } from "../security/require-permission.decorator";
import {
  QuotationFollowupsService,
  type QuotationFollowupSettings,
} from "./quotation-followups.service";

@Controller("v1/quotation-followups")
@RequireActiveOrg()
export class QuotationFollowupsController {
  constructor(private readonly followups: QuotationFollowupsService) {}

  private orgId(session: UserSession) {
    const id = session.session.activeOrganizationId;
    if (!id) throw new Error("Active organization is required");
    return id;
  }

  @Get()
  @RequirePermission("sales.read")
  async getQueue(@Session() session: UserSession) {
    return {
      quotations: await this.followups.getQueue(this.orgId(session)),
      settings: await this.followups.getSettings(this.orgId(session)),
    };
  }

  @Patch("settings")
  @RequirePermission("settings.manage")
  updateSettings(
    @Session() session: UserSession,
    @Body() body: Partial<QuotationFollowupSettings>,
  ) {
    return this.followups.updateSettings(this.orgId(session), body);
  }

  @Post("send")
  @RequirePermission("sales.write")
  send(
    @Session() session: UserSession,
    @Body() body: {
      quotationId: string;
      recipientEmail: string;
      subject: string;
      message: string;
    },
  ) {
    return this.followups.sendFollowup(
      this.orgId(session),
      session.user.id,
      body,
    );
  }
}
