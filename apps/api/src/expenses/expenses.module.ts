import { Module, forwardRef } from "@nestjs/common";
import { AccountingModule } from "../accounting/accounting.module";
import { DatabaseModule } from "../database/database.module";
import { UploadsModule } from "../uploads/uploads.module";
import { ExpenseCategoriesService } from "./expense-categories.service";
import {
  ExpenseCategoriesController,
  ExpensesController,
} from "./expenses.controller";
import { ExpensesService } from "./expenses.service";

@Module({
  imports: [DatabaseModule, forwardRef(() => AccountingModule), UploadsModule],
  controllers: [ExpensesController, ExpenseCategoriesController],
  providers: [ExpensesService, ExpenseCategoriesService],
  exports: [ExpensesService, ExpenseCategoriesService],
})
export class ExpensesModule {}
