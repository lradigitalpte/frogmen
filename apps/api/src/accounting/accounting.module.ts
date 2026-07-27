import { Module, forwardRef } from "@nestjs/common";
import { CurrenciesModule } from "../currencies/currencies.module";
import { DatabaseModule } from "../database/database.module";
import { InvoicesModule } from "../invoices/invoices.module";
import { AccountingProvisionerService } from "./accounting-provisioner.service";
import { AccountingReportsService } from "./accounting-reports.service";
import {
  AccountingController,
} from "./accounting.controller";
import { AccountingService } from "./accounting.service";

@Module({
  imports: [DatabaseModule, CurrenciesModule, forwardRef(() => InvoicesModule)],
  controllers: [AccountingController],
  providers: [
    AccountingProvisionerService,
    AccountingService,
    AccountingReportsService,
  ],
  exports: [AccountingService, AccountingReportsService],
})
export class AccountingModule {}
