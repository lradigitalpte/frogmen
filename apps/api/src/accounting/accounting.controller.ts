import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import {
  RequireActiveOrg,
  Session,
  type UserSession,
} from "@thallesp/nestjs-better-auth";
import { AccountingReportsService } from "./accounting-reports.service";
import { AccountingService } from "./accounting.service";
import { ExpensesService } from "../expenses/expenses.service";

@Controller("v1/accounting")
@RequireActiveOrg()
export class AccountingController {
  constructor(
    private readonly accountingService: AccountingService,
    private readonly reportsService: AccountingReportsService,
    private readonly expensesService: ExpensesService,
  ) {}

  private orgId(session: UserSession) {
    const organizationId = session.session.activeOrganizationId;
    if (!organizationId) {
      throw new Error("Active organization is required");
    }
    return organizationId;
  }

  @Get("overview")
  getOverview(@Session() session: UserSession) {
    return this.reportsService.getOverview(this.orgId(session));
  }

  @Get("accounts")
  listAccounts(@Session() session: UserSession) {
    return this.reportsService.listAccounts(this.orgId(session));
  }

  @Get("reports/profit-loss")
  getProfitLoss(
    @Session() session: UserSession,
    @Query("dateFrom") dateFrom: string,
    @Query("dateTo") dateTo: string,
  ) {
    return this.reportsService.getProfitLoss(
      this.orgId(session),
      dateFrom,
      dateTo,
    );
  }

  @Get("reports/balance-sheet")
  getBalanceSheet(
    @Session() session: UserSession,
    @Query("asOf") asOf: string,
  ) {
    return this.reportsService.getBalanceSheet(this.orgId(session), asOf);
  }

  @Get("reports/bank-balances")
  getBankBalances(
    @Session() session: UserSession,
    @Query("asOf") asOf?: string,
    @Query("dateFrom") dateFrom?: string,
  ) {
    return this.reportsService.getBankBalances(
      this.orgId(session),
      asOf,
      dateFrom,
    );
  }

  @Get("expenses")
  listExpenses(@Session() session: UserSession) {
    return this.expensesService.list(this.orgId(session));
  }

  @Post("expenses")
  async createExpense(
    @Session() session: UserSession,
    @Body()
    body: {
      amount: number;
      expenseDate: string;
      description: string;
      paymentMethod: string;
      reference?: string;
      bankAccountId?: string;
      categoryId?: string;
    },
  ) {
    return this.expensesService.create(
      this.orgId(session),
      session.user.id,
      body,
    );
  }
}
