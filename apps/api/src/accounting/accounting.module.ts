import { Module, forwardRef } from "@nestjs/common";
import { CurrenciesModule } from "../currencies/currencies.module";
import { DatabaseModule } from "../database/database.module";
import { ExpensesModule } from "../expenses/expenses.module";
import { InvoicesModule } from "../invoices/invoices.module";
import { ProductCostEventsModule } from "../product-cost-events/product-cost-events.module";
import { AccountingProvisionerService } from "./accounting-provisioner.service";
import { AccountingReportsService } from "./accounting-reports.service";
import {
  AccountingController,
} from "./accounting.controller";
import { AccountingService } from "./accounting.service";

@Module({
  imports: [DatabaseModule, CurrenciesModule, forwardRef(() => ExpensesModule), forwardRef(() => InvoicesModule), ProductCostEventsModule],
  controllers: [AccountingController],
  providers: [
    AccountingProvisionerService,
    AccountingService,
    AccountingReportsService,
  ],
  exports: [AccountingService, AccountingReportsService, AccountingProvisionerService],
})
export class AccountingModule {}
