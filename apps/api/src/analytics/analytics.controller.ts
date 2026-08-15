import { Controller, Get, Query } from "@nestjs/common";
import { RequireActiveOrg, Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { AnalyticsService } from "./analytics.service";

function defaultRange() {
  const now = new Date();
  const firstOfYear = `${now.getFullYear()}-01-01`;
  const today = now.toISOString().slice(0, 10);
  const firstOfLastYear = `${now.getFullYear() - 1}-01-01`;
  const lastOfLastYear = `${now.getFullYear() - 1}-12-31`;
  return { from: firstOfYear, to: today, compareFrom: firstOfLastYear, compareTo: lastOfLastYear };
}

@Controller("v1/analytics")
@RequireActiveOrg()
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  private orgId(session: UserSession) {
    const organizationId = session.session.activeOrganizationId;
    if (!organizationId) throw new Error("Active organization is required");
    return organizationId;
  }

  @Get()
  async getAnalytics(
    @Session() session: UserSession,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("compareFrom") compareFrom?: string,
    @Query("compareTo") compareTo?: string,
  ) {
    const defaults = defaultRange();
    return this.analyticsService.getAnalytics({
      organizationId: this.orgId(session),
      current: {
        from: from ?? defaults.from,
        to: to ?? defaults.to,
      },
      compare: {
        from: compareFrom ?? defaults.compareFrom,
        to: compareTo ?? defaults.compareTo,
      },
    });
  }
}
