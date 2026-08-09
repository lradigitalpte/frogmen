import { Module, forwardRef } from "@nestjs/common";
import { AccountingModule } from "../accounting/accounting.module";
import { DatabaseModule } from "../database/database.module";
import { UploadsModule } from "../uploads/uploads.module";
import { SecurityModule } from "../security/security.module";
import { ExpensesModule } from "../expenses/expenses.module";
import { ExpenseClaimsController } from "./expense-claims.controller";
import { ExpenseClaimsService } from "./expense-claims.service";

@Module({
  imports: [
    DatabaseModule,
    SecurityModule,
    forwardRef(() => AccountingModule),
    UploadsModule,
    ExpensesModule,
  ],
  controllers: [ExpenseClaimsController],
  providers: [ExpenseClaimsService],
  exports: [ExpenseClaimsService],
})
export class ExpenseClaimsModule {}
