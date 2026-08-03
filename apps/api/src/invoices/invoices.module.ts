import { Module, forwardRef } from "@nestjs/common";
import { AccountingModule } from "../accounting/accounting.module";
import { BankAccountsModule } from "../bank-accounts/bank-accounts.module";
import { CurrenciesModule } from "../currencies/currencies.module";
import { DatabaseModule } from "../database/database.module";
import { SettingsModule } from "../settings/settings.module";
import { StockModule } from "../stock/stock.module";
import { WarrantyModule } from "../warranty/warranty.module";
import {
  CreditNotesController,
  InvoicesController,
  PaymentsController,
} from "./invoices.controller";
import { InvoicesService } from "./invoices.service";
import { DocumentsModule } from "../documents/documents.module";
import { MailModule } from "../mail/mail.module";

@Module({
  imports: [
    DatabaseModule,
    CurrenciesModule,
    StockModule,
    SettingsModule,
    WarrantyModule,
    DocumentsModule,
    MailModule,
    BankAccountsModule,
    forwardRef(() => AccountingModule),
  ],
  controllers: [InvoicesController, PaymentsController, CreditNotesController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
