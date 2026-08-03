import { Module } from "@nestjs/common";
import { AccountingModule } from "../accounting/accounting.module";
import { BankAccountsController } from "./bank-accounts.controller";
import { BankAccountsService } from "./bank-accounts.service";

@Module({
  imports: [AccountingModule],
  controllers: [BankAccountsController],
  providers: [BankAccountsService],
  exports: [BankAccountsService],
})
export class BankAccountsModule {}
