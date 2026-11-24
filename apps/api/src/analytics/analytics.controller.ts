import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
import { RequireActiveOrg, Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { RequirePermission } from "../security/require-permission.decorator";
import { AnalyticsService, type AnalyticsGroupBy, type DateRange } from "./analytics.service";

function defaultRange() {
  const now = new Date();
  const firstOfYear = `${now.getFullYear()}-01-01`;
  const today = now.toISOString().slice(0, 10);
  const firstOfLastYear = `${now.getFullYear() - 1}-01-01`;
  const lastOfLastYear = `${now.getFullYear() - 1}-12-31`;
  return { from: firstOfYear, to: today, compareFrom: firstOfLastYear, compareTo: lastOfLastYear };
}

const MAX_RANGE_DAYS = 366 * 10;
const MAX_DAILY_RANGE_DAYS = 400;

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function checkRange({ from, to }: DateRange, groupBy: AnalyticsGroupBy) {
  if (!isIsoDate(from) || !isIsoDate(to)) {
    throw new BadRequestException("Dates must be valid and in YYYY-MM-DD format");
  }
  if (from > to) {
    throw new BadRequestException("The start date must be on or before the end date");
  }
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;
  if (days > (groupBy === "day" ? MAX_DAILY_RANGE_DAYS : MAX_RANGE_DAYS)) {
    throw new BadRequestException("That date range is too long");
  }
}

function parseGroupBy(value: string | undefined): AnalyticsGroupBy {
  if (value === undefined) return "month";
  if (value === "day" || value === "week" || value === "month") return value;
  throw new BadRequestException("groupBy must be day, week or month");
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
    @Query("groupBy") groupBy?: string,
  ) {
    return this.analyticsService.getAnalytics(
      this.query(session, { from, to, compareFrom, compareTo, groupBy }),
    );
  }

  /** Company costs: needs accounting access, unlike the sales analytics above. */
  @Get("expenses")
  @RequirePermission("accounting.read")
  async getExpenseAnalytics(
    @Session() session: UserSession,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("compareFrom") compareFrom?: string,
    @Query("compareTo") compareTo?: string,
    @Query("groupBy") groupBy?: string,
  ) {
    return this.analyticsService.getExpenseAnalytics(
      this.query(session, { from, to, compareFrom, compareTo, groupBy }),
    );
  }

  private query(
    session: UserSession,
    params: {
      from?: string;
      to?: string;
      compareFrom?: string;
      compareTo?: string;
      groupBy?: string;
    },
  ) {
    const defaults = defaultRange();
    const groupBy = parseGroupBy(params.groupBy);
    const current = { from: params.from ?? defaults.from, to: params.to ?? defaults.to };
    const compare = {
      from: params.compareFrom ?? defaults.compareFrom,
      to: params.compareTo ?? defaults.compareTo,
    };
    checkRange(current, groupBy);
    checkRange(compare, groupBy);
    return { organizationId: this.orgId(session), groupBy, current, compare };
  }
}
