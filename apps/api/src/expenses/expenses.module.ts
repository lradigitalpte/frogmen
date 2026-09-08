import { Module, forwardRef } from "@nestjs/common";
import { AccountingModule } from "../accounting/accounting.module";
import { DatabaseModule } from "../database/database.module";
import { UploadsModule } from "../uploads/uploads.module";
import { ExpenseCategoriesService } from "./expense-categories.service";
import {
  ExpenseCategoriesController,
  ExpensePaymentSourcesController,
  ExpensesController,
} from "./expenses.controller";
import { ExpensesService } from "./expenses.service";
import { ExpensePaymentSourcesService } from "./expense-payment-sources.service";

@Module({
  imports: [DatabaseModule, forwardRef(() => AccountingModule), UploadsModule],
  controllers: [ExpensesController, ExpenseCategoriesController, ExpensePaymentSourcesController],
  providers: [ExpensesService, ExpenseCategoriesService, ExpensePaymentSourcesService],
  exports: [ExpensesService, ExpenseCategoriesService],
})
export class ExpensesModule {}
