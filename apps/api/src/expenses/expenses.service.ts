import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, isNull } from "drizzle-orm";
import {
  bankAccounts,
  expenseCategories,
  expenses,
  type Database,
} from "@frog1/db";
import { roundMoney } from "@frog1/shared";
import { AccountingService } from "../accounting/accounting.service";
import { DATABASE } from "../database/database.constants";
import { UploadsService } from "../uploads/uploads.service";
import { nextDocumentNumber } from "../sales/document-sequences";
import { ExpenseCategoriesService } from "./expense-categories.service";

@Injectable()
export class ExpensesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly accountingService: AccountingService,
    private readonly expenseCategoriesService: ExpenseCategoriesService,
    private readonly uploadsService: UploadsService,
  ) {}

  async list(organizationId: string) {
    await this.expenseCategoriesService.seedDefaults(organizationId);

    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    const rows = await this.db
      .select({
        expense: expenses,
        categoryName: expenseCategories.name,
        bankAccountName: bankAccounts.name,
      })
      .from(expenses)
      .leftJoin(
        expenseCategories,
        eq(expenseCategories.id, expenses.categoryId),
      )
      .leftJoin(bankAccounts, eq(bankAccounts.id, expenses.bankAccountId))
      .where(
        and(
          eq(expenses.organizationId, organizationId),
          isNull(expenses.deletedAt),
        ),
      )
      .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt))
      .limit(200);

    let monthTotal = 0;
    let monthCount = 0;
    let cashTotal = 0;
    let bankTotal = 0;

    const expenseRows = rows.map((row) => {
      const amount = roundMoney(Number(row.expense.amount));
      const paymentSource =
        row.expense.paymentMethod === "cash" ||
        row.expense.paymentMethod === "cheque"
          ? ("cash" as const)
          : ("bank" as const);
      const inMonth = row.expense.expenseDate >= monthStart;

      if (inMonth) {
        monthTotal += amount;
        monthCount += 1;
        if (paymentSource === "cash") cashTotal += amount;
        else bankTotal += amount;
      }

      return {
        id: row.expense.id,
        number: row.expense.number,
        expenseDate: row.expense.expenseDate,
        description: row.expense.description,
        reference: row.expense.reference,
        amount,
        paymentMethod: row.expense.paymentMethod,
        paymentSource,
        bankAccountId: row.expense.bankAccountId,
        bankAccountName: row.bankAccountName,
        categoryId: row.expense.categoryId,
        categoryName: row.categoryName,
        receiptPath: row.expense.receiptPath,
        hasReceipt: Boolean(row.expense.receiptPath),
      };
    });

    return {
      summary: {
        monthTotal: roundMoney(monthTotal),
        monthCount,
        cashTotal: roundMoney(cashTotal),
        bankTotal: roundMoney(bankTotal),
      },
      expenses: expenseRows,
    };
  }

  async getById(organizationId: string, id: string) {
    const [row] = await this.db
      .select({
        expense: expenses,
        categoryName: expenseCategories.name,
        bankAccountName: bankAccounts.name,
      })
      .from(expenses)
      .leftJoin(
        expenseCategories,
        eq(expenseCategories.id, expenses.categoryId),
      )
      .leftJoin(bankAccounts, eq(bankAccounts.id, expenses.bankAccountId))
      .where(
        and(
          eq(expenses.id, id),
          eq(expenses.organizationId, organizationId),
          isNull(expenses.deletedAt),
        ),
      )
      .limit(1);

    if (!row) {
      throw new NotFoundException("Expense not found");
    }

    return {
      id: row.expense.id,
      number: row.expense.number,
      expenseDate: row.expense.expenseDate,
      description: row.expense.description,
      reference: row.expense.reference,
      amount: roundMoney(Number(row.expense.amount)),
      paymentMethod: row.expense.paymentMethod,
      bankAccountId: row.expense.bankAccountId,
      bankAccountName: row.bankAccountName,
      categoryId: row.expense.categoryId,
      categoryName: row.categoryName,
      receiptPath: row.expense.receiptPath,
      hasReceipt: Boolean(row.expense.receiptPath),
      accountMoveId: row.expense.accountMoveId,
    };
  }

  async create(
    organizationId: string,
    userId: string | undefined,
    input: {
      amount: number;
      expenseDate: string;
      description: string;
      paymentMethod: string;
      reference?: string;
      bankAccountId?: string;
      categoryId?: string;
    },
  ) {
    const description = input.description.trim();
    if (!description) {
      throw new BadRequestException("Description is required");
    }

    const amount = roundMoney(input.amount);
    if (!amount || amount <= 0) {
      throw new BadRequestException("Amount must be greater than zero");
    }

    if (input.categoryId) {
      const [category] = await this.db
        .select({ id: expenseCategories.id })
        .from(expenseCategories)
        .where(
          and(
            eq(expenseCategories.id, input.categoryId),
            eq(expenseCategories.organizationId, organizationId),
            isNull(expenseCategories.deletedAt),
          ),
        )
        .limit(1);
      if (!category) {
        throw new BadRequestException("Expense category not found");
      }
    }

    const number = await nextDocumentNumber(
      this.db,
      organizationId,
      "expense",
      "EXP-",
    );

    const moveId = await this.accountingService.postExpenseJournal(
      organizationId,
      {
        amount,
        expenseDate: input.expenseDate,
        description,
        paymentMethod: input.paymentMethod,
        reference: number,
        bankAccountId: input.bankAccountId,
      },
    );

    const [created] = await this.db
      .insert(expenses)
      .values({
        organizationId,
        accountMoveId: moveId,
        number,
        categoryId: input.categoryId ?? null,
        description,
        reference: input.reference?.trim() || null,
        amount: String(amount),
        expenseDate: input.expenseDate,
        paymentMethod: input.paymentMethod,
        bankAccountId: input.bankAccountId ?? null,
        createdBy: userId ?? null,
      })
      .returning();

    return {
      id: created.id,
      number: created.number,
      reference: created.reference,
    };
  }

  async update(
    organizationId: string,
    id: string,
    input: {
      amount?: number;
      expenseDate?: string;
      description?: string;
      paymentMethod?: string;
      reference?: string | null;
      bankAccountId?: string | null;
      categoryId?: string | null;
    },
  ) {
    const existing = await this.getById(organizationId, id);

    const amount =
      input.amount !== undefined ? roundMoney(input.amount) : existing.amount;
    const expenseDate = input.expenseDate ?? existing.expenseDate;
    const description = (input.description ?? existing.description).trim();
    const paymentMethod = input.paymentMethod ?? existing.paymentMethod;
    const bankAccountId =
      input.bankAccountId !== undefined
        ? input.bankAccountId
        : existing.bankAccountId;
    const categoryId =
      input.categoryId !== undefined ? input.categoryId : existing.categoryId;
    const reference =
      input.reference !== undefined ? input.reference : existing.reference;

    if (!description) {
      throw new BadRequestException("Description is required");
    }
    if (!amount || amount <= 0) {
      throw new BadRequestException("Amount must be greater than zero");
    }

    const financialChanged =
      amount !== existing.amount ||
      expenseDate !== existing.expenseDate ||
      paymentMethod !== existing.paymentMethod ||
      bankAccountId !== existing.bankAccountId;

    let accountMoveId = existing.accountMoveId;

    if (financialChanged) {
      await this.accountingService.reverseJournalMove(
        organizationId,
        existing.accountMoveId,
        `Reversal ${existing.number}`,
      );

      accountMoveId = await this.accountingService.postExpenseJournal(
        organizationId,
        {
          amount,
          expenseDate,
          description,
          paymentMethod,
          reference: existing.number,
          bankAccountId: bankAccountId ?? undefined,
        },
      );
    } else {
      await this.accountingService.updateJournalMoveMetadata(
        organizationId,
        existing.accountMoveId,
        { name: description },
      );
    }

    const [updated] = await this.db
      .update(expenses)
      .set({
        accountMoveId,
        categoryId: categoryId ?? null,
        description,
        reference: reference?.trim() || null,
        amount: String(amount),
        expenseDate,
        paymentMethod,
        bankAccountId: bankAccountId ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(expenses.id, id),
          eq(expenses.organizationId, organizationId),
          isNull(expenses.deletedAt),
        ),
      )
      .returning();

    return this.getById(organizationId, updated.id);
  }

  async remove(organizationId: string, id: string) {
    const existing = await this.getById(organizationId, id);

    await this.accountingService.reverseJournalMove(
      organizationId,
      existing.accountMoveId,
      `Void ${existing.number}`,
    );

    const [deleted] = await this.db
      .update(expenses)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(expenses.id, id),
          eq(expenses.organizationId, organizationId),
          isNull(expenses.deletedAt),
        ),
      )
      .returning();

    if (existing.receiptPath) {
      await this.uploadsService.deleteStoredFile(existing.receiptPath);
    }

    return deleted;
  }

  async uploadReceipt(
    organizationId: string,
    id: string,
    file: Express.Multer.File,
  ) {
    const existing = await this.getById(organizationId, id);

    if (existing.receiptPath) {
      await this.uploadsService.deleteStoredFile(existing.receiptPath);
    }

    const receiptPath = await this.uploadsService.saveExpenseReceipt(
      organizationId,
      id,
      file,
    );

    await this.db
      .update(expenses)
      .set({ receiptPath, updatedAt: new Date() })
      .where(eq(expenses.id, id));

    return { receiptPath };
  }

  getReceiptPath(organizationId: string, id: string) {
    return this.getById(organizationId, id).then((expense) => {
      if (!expense.receiptPath) {
        throw new NotFoundException("Receipt not found");
      }
      return expense.receiptPath;
    });
  }
}
