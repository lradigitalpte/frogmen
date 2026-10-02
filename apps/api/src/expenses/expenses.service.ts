import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { alias } from "drizzle-orm/pg-core";
import { and, asc, desc, eq, isNotNull, isNull, notInArray } from "drizzle-orm";
import {
  accountMoveLines,
  accountMoves,
  bankAccounts,
  expenseCategories,
  expenseClaims,
  expensePaymentSources,
  expenses,
  glAccounts,
  journals,
  users,
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
    await this.syncReimbursementLedgerEntries(organizationId);

    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    const rows = await this.db
      .select({
        expense: expenses,
        categoryName: expenseCategories.name,
        bankAccountName: bankAccounts.name,
        expenseClaimId: expenseClaims.id,
      })
      .from(expenses)
      .leftJoin(
        expenseCategories,
        eq(expenseCategories.id, expenses.categoryId),
      )
      .leftJoin(bankAccounts, eq(bankAccounts.id, expenses.bankAccountId))
      .leftJoin(
        expenseClaims,
        and(
          eq(expenseClaims.accountMoveId, expenses.accountMoveId),
          eq(expenseClaims.organizationId, organizationId),
          eq(expenseClaims.status, "reimbursed"),
          isNull(expenseClaims.deletedAt),
        ),
      )
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
        paymentSourceId: row.expense.paymentSourceId,
        paymentSource,
        bankAccountId: row.expense.bankAccountId,
        bankAccountName: row.bankAccountName,
        categoryId: row.expense.categoryId,
        categoryName: row.categoryName,
        receiptPath: row.expense.receiptPath,
        hasReceipt: Boolean(row.expense.receiptPath),
        expenseClaimId: row.expenseClaimId,
        source: row.expenseClaimId ? ("reimbursement" as const) : ("manual" as const),
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
    const creatorUser = alias(users, "expense_creator");
    const claimSubmitter = alias(users, "claim_submitter");
    const claimReimburser = alias(users, "claim_reimburser");

    const [row] = await this.db
      .select({
        expense: expenses,
        categoryName: expenseCategories.name,
        bankAccountName: bankAccounts.name,
        paymentSourceName: expensePaymentSources.name,
        paymentSourceLastFour: expensePaymentSources.lastFour,
        creatorName: creatorUser.name,
        creatorEmail: creatorUser.email,
        expenseClaimId: expenseClaims.id,
        claimNumber: expenseClaims.number,
        claimSubmittedAt: expenseClaims.submittedAt,
        claimReimbursedAt: expenseClaims.reimbursedAt,
        claimSubmitterName: claimSubmitter.name,
        claimSubmitterEmail: claimSubmitter.email,
        claimReimburserName: claimReimburser.name,
        claimReimburserEmail: claimReimburser.email,
      })
      .from(expenses)
      .leftJoin(
        expenseCategories,
        eq(expenseCategories.id, expenses.categoryId),
      )
      .leftJoin(bankAccounts, eq(bankAccounts.id, expenses.bankAccountId))
      .leftJoin(
        expensePaymentSources,
        eq(expensePaymentSources.id, expenses.paymentSourceId),
      )
      .leftJoin(creatorUser, eq(creatorUser.id, expenses.createdBy))
      .leftJoin(
        expenseClaims,
        and(
          eq(expenseClaims.accountMoveId, expenses.accountMoveId),
          eq(expenseClaims.organizationId, organizationId),
          eq(expenseClaims.status, "reimbursed"),
          isNull(expenseClaims.deletedAt),
        ),
      )
      .leftJoin(
        claimSubmitter,
        eq(claimSubmitter.id, expenseClaims.submittedByUserId),
      )
      .leftJoin(
        claimReimburser,
        eq(claimReimburser.id, expenseClaims.reimbursedByUserId),
      )
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

    const paymentSource =
      row.expense.paymentMethod === "cash" ||
      row.expense.paymentMethod === "cheque"
        ? ("cash" as const)
        : ("bank" as const);

    const [moveHeader] = await this.db
      .select({
        moveDate: accountMoves.moveDate,
        name: accountMoves.name,
        reference: accountMoves.reference,
        state: accountMoves.state,
        postedAt: accountMoves.postedAt,
        journalCode: journals.code,
        journalName: journals.name,
      })
      .from(accountMoves)
      .innerJoin(journals, eq(journals.id, accountMoves.journalId))
      .where(
        and(
          eq(accountMoves.id, row.expense.accountMoveId),
          eq(accountMoves.organizationId, organizationId),
        ),
      )
      .limit(1);

    const journalLines = await this.db
      .select({
        accountId: glAccounts.id,
        accountCode: glAccounts.code,
        accountName: glAccounts.name,
        label: accountMoveLines.label,
        debit: accountMoveLines.debit,
        credit: accountMoveLines.credit,
        lineNumber: accountMoveLines.lineNumber,
      })
      .from(accountMoveLines)
      .innerJoin(glAccounts, eq(glAccounts.id, accountMoveLines.accountId))
      .where(eq(accountMoveLines.moveId, row.expense.accountMoveId))
      .orderBy(asc(accountMoveLines.lineNumber));

    const source = row.expenseClaimId
      ? ("reimbursement" as const)
      : ("manual" as const);

    return {
      id: row.expense.id,
      number: row.expense.number,
      expenseDate: row.expense.expenseDate,
      description: row.expense.description,
      reference: row.expense.reference,
      amount: roundMoney(Number(row.expense.amount)),
      paymentMethod: row.expense.paymentMethod,
      paymentSourceId: row.expense.paymentSourceId,
      paymentSource,
      paymentSourceLabel: row.paymentSourceName
        ? row.paymentSourceLastFour
          ? `${row.paymentSourceName} ····${row.paymentSourceLastFour}`
          : row.paymentSourceName
        : null,
      bankAccountId: row.expense.bankAccountId,
      bankAccountName: row.bankAccountName,
      categoryId: row.expense.categoryId,
      categoryName: row.categoryName,
      receiptPath: row.expense.receiptPath,
      hasReceipt: Boolean(row.expense.receiptPath),
      accountMoveId: row.expense.accountMoveId,
      source,
      expenseClaimId: row.expenseClaimId,
      createdAt: row.expense.createdAt.toISOString(),
      updatedAt: row.expense.updatedAt.toISOString(),
      recordedBy:
        row.creatorName || row.creatorEmail
          ? {
              name: row.creatorName,
              email: row.creatorEmail,
            }
          : null,
      reimbursement:
        row.expenseClaimId && source === "reimbursement"
          ? {
              claimId: row.expenseClaimId,
              claimNumber: row.claimNumber,
              submitterName: row.claimSubmitterName,
              submitterEmail: row.claimSubmitterEmail,
              reimbursedByName: row.claimReimburserName,
              reimbursedByEmail: row.claimReimburserEmail,
              submittedAt: row.claimSubmittedAt?.toISOString() ?? null,
              reimbursedAt: row.claimReimbursedAt?.toISOString() ?? null,
            }
          : null,
      journal: moveHeader
        ? {
            moveDate: moveHeader.moveDate,
            name: moveHeader.name,
            reference: moveHeader.reference,
            state: moveHeader.state,
            postedAt: moveHeader.postedAt?.toISOString() ?? null,
            journalCode: moveHeader.journalCode,
            journalName: moveHeader.journalName,
            lines: journalLines.map((line) => ({
              accountId: line.accountId,
              accountCode: line.accountCode,
              accountName: line.accountName,
              label: line.label,
              debit: roundMoney(Number(line.debit)),
              credit: roundMoney(Number(line.credit)),
            })),
          }
        : null,
    };
  }

  async createLedgerEntryFromReimbursedClaim(
    organizationId: string,
    userId: string | undefined,
    claim: {
      number: string;
      accountMoveId: string;
      categoryId: string | null;
      description: string;
      reference: string | null;
      amount: string;
      expenseDate: string;
      paymentMethod: string;
      bankAccountId: string | null;
      receiptPath: string | null;
    },
  ) {
    const [existing] = await this.db
      .select({ id: expenses.id })
      .from(expenses)
      .where(
        and(
          eq(expenses.organizationId, organizationId),
          eq(expenses.accountMoveId, claim.accountMoveId),
          isNull(expenses.deletedAt),
        ),
      )
      .limit(1);

    if (existing) {
      return existing;
    }

    const description = claim.description.startsWith("Reimbursement:")
      ? claim.description
      : `Reimbursement: ${claim.description}`;

    const [created] = await this.db
      .insert(expenses)
      .values({
        organizationId,
        accountMoveId: claim.accountMoveId,
        number: claim.number,
        categoryId: claim.categoryId,
        description,
        reference: claim.reference,
        amount: claim.amount,
        expenseDate: claim.expenseDate,
        paymentMethod: claim.paymentMethod,
        bankAccountId: claim.bankAccountId,
        receiptPath: claim.receiptPath,
        createdBy: userId ?? null,
      })
      .returning();

    return created;
  }

  private async syncReimbursementLedgerEntries(organizationId: string) {
    const linkedExpenseMoves = await this.db
      .select({ accountMoveId: expenses.accountMoveId })
      .from(expenses)
      .where(
        and(
          eq(expenses.organizationId, organizationId),
          isNull(expenses.deletedAt),
        ),
      );

    const linkedMoveIds = linkedExpenseMoves
      .map((row) => row.accountMoveId)
      .filter(Boolean);

    const missingClaims = await this.db
      .select()
      .from(expenseClaims)
      .where(
        and(
          eq(expenseClaims.organizationId, organizationId),
          eq(expenseClaims.status, "reimbursed"),
          isNull(expenseClaims.deletedAt),
          isNotNull(expenseClaims.accountMoveId),
          isNotNull(expenseClaims.paymentMethod),
          linkedMoveIds.length
            ? notInArray(expenseClaims.accountMoveId, linkedMoveIds)
            : undefined,
        ),
      )
      .limit(100);

    for (const claim of missingClaims) {
      if (!claim.accountMoveId || !claim.paymentMethod) continue;

      await this.createLedgerEntryFromReimbursedClaim(
        organizationId,
        claim.reimbursedByUserId ?? undefined,
        {
        number: claim.number,
        accountMoveId: claim.accountMoveId,
        categoryId: claim.categoryId,
        description: claim.description,
        reference: claim.reference,
        amount: claim.amount,
        expenseDate: claim.expenseDate,
        paymentMethod: claim.paymentMethod,
        bankAccountId: claim.bankAccountId,
        receiptPath: claim.receiptPath,
      });
    }
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
      paymentSourceId?: string;
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
        paymentSourceId: input.paymentSourceId ?? null,
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

  private async assertManualExpense(organizationId: string, accountMoveId: string) {
    const [claim] = await this.db
      .select({ id: expenseClaims.id })
      .from(expenseClaims)
      .where(
        and(
          eq(expenseClaims.organizationId, organizationId),
          eq(expenseClaims.accountMoveId, accountMoveId),
          eq(expenseClaims.status, "reimbursed"),
          isNull(expenseClaims.deletedAt),
        ),
      )
      .limit(1);

    if (claim) {
      throw new BadRequestException(
        "Staff reimbursement entries are managed from Expense reimbursements",
      );
    }
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
      paymentSourceId?: string | null;
      categoryId?: string | null;
    },
  ) {
    const existing = await this.getById(organizationId, id);
    await this.assertManualExpense(organizationId, existing.accountMoveId);

    const amount =
      input.amount !== undefined ? roundMoney(input.amount) : existing.amount;
    const expenseDate = input.expenseDate ?? existing.expenseDate;
    const description = (input.description ?? existing.description).trim();
    const paymentMethod = input.paymentMethod ?? existing.paymentMethod;
    const bankAccountId =
      input.bankAccountId !== undefined
        ? input.bankAccountId
        : existing.bankAccountId;
    const paymentSourceId = input.paymentSourceId !== undefined
      ? input.paymentSourceId
      : existing.paymentSourceId;
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
        paymentSourceId: paymentSourceId ?? null,
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
    await this.assertManualExpense(organizationId, existing.accountMoveId);

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
