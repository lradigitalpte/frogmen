import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  bankAccounts,
  expenseCategories,
  expenseClaims,
  expenses,
  users,
  type Database,
} from "@frog1/db";
import { roundMoney } from "@frog1/shared";
import { AccountingService } from "../accounting/accounting.service";
import { DATABASE } from "../database/database.constants";
import { UploadsService } from "../uploads/uploads.service";
import { nextDocumentNumber } from "../sales/document-sequences";
import { ExpenseCategoriesService } from "../expenses/expense-categories.service";
import { ExpensesService } from "../expenses/expenses.service";
import { parseNoReceiptReason } from "../expenses/no-receipt-reason";

export type ExpenseClaimStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected"
  | "reimbursed";

const VALID_STATUSES: ExpenseClaimStatus[] = [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "reimbursed",
];

const PAYMENT_METHODS = ["cash", "bank_transfer", "wire_transfer", "cheque"];

const reviewerUser = alias(users, "expense_claim_reviewer");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertIsoDate(value: unknown, label = "Expense date"): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new BadRequestException(`${label} must be a valid date (YYYY-MM-DD)`);
  }
  return value;
}
const reimburserUser = alias(users, "expense_claim_reimburser");

@Injectable()
export class ExpenseClaimsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly accountingService: AccountingService,
    private readonly expenseCategoriesService: ExpenseCategoriesService,
    private readonly expensesService: ExpensesService,
    private readonly uploadsService: UploadsService,
  ) {}

  async listMine(organizationId: string, userId: string) {
    await this.expenseCategoriesService.seedDefaults(organizationId);
    const rows = await this.queryClaims(organizationId, {
      submittedByUserId: userId,
    });

    const submittedCount = rows.filter((r) => r.status === "submitted").length;
    const approvedTotal = roundMoney(
      rows
        .filter((r) => r.status === "approved")
        .reduce((sum, r) => sum + r.amount, 0),
    );

    return {
      summary: {
        submittedCount,
        approvedAwaitingPaymentTotal: approvedTotal,
      },
      claims: rows,
    };
  }

  async listOrg(
    organizationId: string,
    filters: {
      status?: ExpenseClaimStatus;
      submittedByUserId?: string;
      fromDate?: string;
      toDate?: string;
    },
  ) {
    await this.expenseCategoriesService.seedDefaults(organizationId);
    const allRows = await this.queryClaims(organizationId, {
      submittedByUserId: filters.submittedByUserId,
      fromDate: filters.fromDate,
      toDate: filters.toDate,
    });
    const rows = filters.status
      ? allRows.filter((r) => r.status === filters.status)
      : allRows;

    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    const approvedTotal = roundMoney(
      allRows
        .filter((r) => r.status === "approved")
        .reduce((sum, r) => sum + r.amount, 0),
    );
    const reimbursedThisMonth = roundMoney(
      allRows
        .filter(
          (r) =>
            r.status === "reimbursed" &&
            r.reimbursedAt &&
            r.reimbursedAt >= monthStart,
        )
        .reduce((sum, r) => sum + r.amount, 0),
    );

    return {
      summary: {
        outstandingApprovedTotal: approvedTotal,
        reimbursedThisMonth,
        submittedCount: allRows.filter((r) => r.status === "submitted").length,
      },
      claims: rows,
    };
  }

  async getById(organizationId: string, id: string) {
    if (!UUID_RE.test(id)) {
      throw new NotFoundException("Expense claim not found");
    }
    const rows = await this.queryClaims(organizationId, { id });
    const claim = rows[0];
    if (!claim) {
      throw new NotFoundException("Expense claim not found");
    }
    return claim;
  }

  async getByIdForViewer(
    organizationId: string,
    id: string,
    viewerUserId: string,
    permissions: readonly string[],
  ) {
    const claim = await this.getById(organizationId, id);
    const canReview = permissions.includes("expense_claims.review");
    const canSubmit = permissions.includes("expense_claims.submit");
    if (canReview) {
      return claim;
    }
    if (canSubmit && claim.submittedByUserId === viewerUserId) {
      return claim;
    }
    throw new ForbiddenException("You cannot view this expense claim");
  }

  async create(
    organizationId: string,
    userId: string,
    input: {
      amount: number;
      expenseDate: string;
      description: string;
      reference?: string;
      categoryId?: string;
      noReceiptReason?: string;
    },
  ) {
    const noReceiptReason = parseNoReceiptReason(input.noReceiptReason);
    const description = (input.description ?? "").trim();
    const expenseDate = assertIsoDate(input.expenseDate);
    if (!description) {
      throw new BadRequestException("Description is required");
    }

    const amount = roundMoney(input.amount);
    if (!amount || amount <= 0) {
      throw new BadRequestException("Amount must be greater than zero");
    }

    await this.validateCategory(organizationId, input.categoryId);

    const number = await nextDocumentNumber(
      this.db,
      organizationId,
      "expense_claim",
      "EC-",
    );

    const [created] = await this.db
      .insert(expenseClaims)
      .values({
        organizationId,
        number,
        submittedByUserId: userId,
        categoryId: input.categoryId ?? null,
        description,
        reference: input.reference?.trim() || null,
        noReceiptReason,
        amount: String(amount),
        expenseDate,
        status: "draft",
      })
      .returning();

    return this.getById(organizationId, created.id);
  }

  async update(
    organizationId: string,
    userId: string,
    id: string,
    input: {
      amount?: number;
      expenseDate?: string;
      description?: string;
      reference?: string | null;
      categoryId?: string | null;
      noReceiptReason?: string | null;
    },
  ) {
    const existing = await this.getClaimRow(organizationId, id);

    if (existing.status !== "draft") {
      throw new BadRequestException("Only draft claims can be edited");
    }
    if (existing.submittedByUserId !== userId) {
      throw new ForbiddenException("You can only edit your own claims");
    }

    const description = (input.description ?? existing.description).trim();
    if (!description) {
      throw new BadRequestException("Description is required");
    }

    const amount =
      input.amount !== undefined ? roundMoney(input.amount) : Number(existing.amount);
    if (!amount || amount <= 0) {
      throw new BadRequestException("Amount must be greater than zero");
    }

    if (input.categoryId) {
      await this.validateCategory(organizationId, input.categoryId);
    }
    const expenseDate =
      input.expenseDate !== undefined
        ? assertIsoDate(input.expenseDate)
        : existing.expenseDate;

    await this.db
      .update(expenseClaims)
      .set({
        description,
        amount: String(amount),
        expenseDate,
        reference:
          input.reference !== undefined
            ? input.reference?.trim() || null
            : existing.reference,
        categoryId:
          input.categoryId !== undefined
            ? input.categoryId || null
            : existing.categoryId,
        noReceiptReason: existing.receiptPath
          ? null
          : input.noReceiptReason !== undefined
            ? parseNoReceiptReason(input.noReceiptReason)
            : existing.noReceiptReason,
        updatedAt: new Date(),
      })
      .where(eq(expenseClaims.id, id));

    return this.getById(organizationId, id);
  }

  async remove(organizationId: string, userId: string, id: string) {
    const existing = await this.getClaimRow(organizationId, id);

    const deletableStatuses = ["draft", "submitted", "rejected"];
    if (!deletableStatuses.includes(existing.status)) {
      throw new BadRequestException(
        "Approved or reimbursed claims cannot be deleted",
      );
    }
    if (existing.submittedByUserId !== userId) {
      throw new ForbiddenException("You can only delete your own claims");
    }

    if (existing.receiptPath) {
      await this.uploadsService.deleteStoredFile(existing.receiptPath);
    }

    await this.db
      .update(expenseClaims)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(expenseClaims.id, id));

    return { id };
  }

  async withdrawSubmission(organizationId: string, userId: string, id: string) {
    const existing = await this.getClaimRow(organizationId, id);

    if (existing.submittedByUserId !== userId) {
      throw new ForbiddenException("You can only cancel your own claims");
    }
    if (existing.status !== "submitted" && existing.status !== "rejected") {
      throw new BadRequestException(
        "Only claims awaiting review or rejected claims can be moved back to draft",
      );
    }

    // A rejected claim keeps its reviewer note so the employee can see what to fix.
    const revising = existing.status === "rejected";
    const [moved] = await this.db
      .update(expenseClaims)
      .set({
        status: "draft",
        submittedAt: null,
        ...(revising
          ? {}
          : { reviewedAt: null, reviewedByUserId: null, rejectionReason: null }),
        updatedAt: new Date(),
      })
      .where(and(eq(expenseClaims.id, id), eq(expenseClaims.status, existing.status)))
      .returning({ id: expenseClaims.id });
    if (!moved) {
      throw new BadRequestException("This claim was just updated by someone else. Refresh and try again.");
    }

    return this.getById(organizationId, id);
  }

  async submit(organizationId: string, userId: string, id: string) {
    const existing = await this.getClaimRow(organizationId, id);

    if (existing.submittedByUserId !== userId) {
      throw new ForbiddenException("You can only submit your own claims");
    }
    if (existing.status !== "draft") {
      throw new BadRequestException("Only draft claims can be submitted");
    }

    await this.db
      .update(expenseClaims)
      .set({
        status: "submitted",
        submittedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(expenseClaims.id, id), eq(expenseClaims.status, "draft")));

    return this.getById(organizationId, id);
  }

  async approve(
    organizationId: string,
    reviewerUserId: string,
    id: string,
  ) {
    const existing = await this.getClaimRow(organizationId, id);

    if (existing.status !== "submitted") {
      throw new BadRequestException("Only submitted claims can be approved");
    }

    await this.db
      .update(expenseClaims)
      .set({
        status: "approved",
        reviewedAt: new Date(),
        reviewedByUserId: reviewerUserId,
        rejectionReason: null,
        updatedAt: new Date(),
      })
      .where(and(eq(expenseClaims.id, id), eq(expenseClaims.status, "submitted")));

    return this.getById(organizationId, id);
  }

  async reject(
    organizationId: string,
    reviewerUserId: string,
    id: string,
    reason: string,
  ) {
    const existing = await this.getClaimRow(organizationId, id);

    if (existing.status !== "submitted") {
      throw new BadRequestException("Only submitted claims can be rejected");
    }
    if (!reason?.trim()) {
      throw new BadRequestException("Rejection reason is required");
    }

    await this.db
      .update(expenseClaims)
      .set({
        status: "rejected",
        reviewedAt: new Date(),
        reviewedByUserId: reviewerUserId,
        rejectionReason: reason.trim(),
        updatedAt: new Date(),
      })
      .where(and(eq(expenseClaims.id, id), eq(expenseClaims.status, "submitted")));

    return this.getById(organizationId, id);
  }

  async reimburse(
    organizationId: string,
    userId: string,
    id: string,
    input: {
      paymentMethod: string;
      bankAccountId?: string;
      reimbursedDate?: string;
    },
  ) {
    const existing = await this.getClaimRow(organizationId, id, true);

    if (existing.status !== "approved") {
      throw new BadRequestException("Only approved claims can be reimbursed");
    }

    const paymentMethod = input.paymentMethod?.trim();
    if (!paymentMethod) {
      throw new BadRequestException("Payment method is required");
    }

    const requiresBank =
      paymentMethod !== "cash";
    if (requiresBank && !input.bankAccountId) {
      throw new BadRequestException("Bank account is required for this payment method");
    }

    const amount = roundMoney(Number(existing.amount));
    const reimbursedDate = input.reimbursedDate ?? existing.expenseDate;
    const description = `Reimbursement: ${existing.description}`;

    const moveId = await this.accountingService.postExpenseJournal(
      organizationId,
      {
        amount,
        expenseDate: reimbursedDate,
        description,
        paymentMethod,
        reference: existing.number,
        bankAccountId: input.bankAccountId,
      },
    );

    await this.db
      .update(expenseClaims)
      .set({
        status: "reimbursed",
        paymentMethod,
        bankAccountId: input.bankAccountId ?? null,
        accountMoveId: moveId,
        reimbursedAt: new Date(),
        reimbursedByUserId: userId,
        updatedAt: new Date(),
      })
      .where(eq(expenseClaims.id, id));

    await this.expensesService.createLedgerEntryFromReimbursedClaim(
      organizationId,
      userId,
      {
        number: existing.number,
        accountMoveId: moveId,
        categoryId: existing.categoryId,
        description: existing.description,
        reference: existing.reference,
        amount: existing.amount,
        expenseDate: reimbursedDate,
        paymentMethod,
        bankAccountId: input.bankAccountId ?? null,
        receiptPath: existing.receiptPath,
        noReceiptReason: existing.noReceiptReason,
      },
    );

    return this.getById(organizationId, id);
  }

  /** Fix how a paid claim was paid: reverses the journal entry and posts a corrected one. */
  async correctReimbursement(
    organizationId: string,
    id: string,
    input: {
      paymentMethod: string;
      bankAccountId?: string;
      reimbursedDate: string;
    },
  ) {
    const existing = await this.getClaimRow(organizationId, id, true);

    if (existing.status !== "reimbursed" || !existing.accountMoveId) {
      throw new BadRequestException("Only reimbursed claims can be corrected");
    }
    if (!PAYMENT_METHODS.includes(input.paymentMethod)) {
      throw new BadRequestException("Choose a valid payment method");
    }
    const { paymentMethod } = input;
    const bankAccountId =
      paymentMethod === "cash" ? null : input.bankAccountId || null;
    if (paymentMethod !== "cash" && !bankAccountId) {
      throw new BadRequestException("Bank account is required for this payment method");
    }
    const reimbursedDate = assertIsoDate(input.reimbursedDate, "Payment date");

    const [ledgerEntry] = await this.db
      .select({ id: expenses.id, expenseDate: expenses.expenseDate })
      .from(expenses)
      .where(
        and(
          eq(expenses.organizationId, organizationId),
          eq(expenses.accountMoveId, existing.accountMoveId),
          isNull(expenses.deletedAt),
        ),
      )
      .limit(1);
    if (!ledgerEntry) {
      throw new BadRequestException(
        "This claim has no entry in Expenses yet. Open Expenses & petty cash once, then try again.",
      );
    }

    if (
      paymentMethod === existing.paymentMethod &&
      bankAccountId === existing.bankAccountId &&
      reimbursedDate === ledgerEntry.expenseDate
    ) {
      throw new BadRequestException("Nothing has changed");
    }

    await this.accountingService.reverseJournalMove(
      organizationId,
      existing.accountMoveId,
      `Reversal ${existing.number}`,
    );
    const moveId = await this.accountingService.postExpenseJournal(
      organizationId,
      {
        amount: roundMoney(Number(existing.amount)),
        expenseDate: reimbursedDate,
        description: `Reimbursement: ${existing.description}`,
        paymentMethod,
        reference: existing.number,
        bankAccountId: bankAccountId ?? undefined,
      },
    );

    const updatedAt = new Date();
    await this.db
      .update(expenses)
      .set({
        accountMoveId: moveId,
        paymentMethod,
        bankAccountId,
        expenseDate: reimbursedDate,
        updatedAt,
      })
      .where(eq(expenses.id, ledgerEntry.id));
    await this.db
      .update(expenseClaims)
      .set({ accountMoveId: moveId, paymentMethod, bankAccountId, updatedAt })
      .where(eq(expenseClaims.id, id));

    return this.getById(organizationId, id);
  }

  /** Undo an approval that hasn't been paid, so the employee can edit and resubmit. */
  async sendBack(
    organizationId: string,
    reviewerUserId: string,
    id: string,
    reason: unknown,
  ) {
    const existing = await this.getClaimRow(organizationId, id, true);

    if (existing.status !== "approved") {
      throw new BadRequestException("Only approved, unpaid claims can be sent back to draft");
    }
    if (typeof reason !== "string" || !reason.trim()) {
      throw new BadRequestException("Say what needs to change");
    }

    await this.db
      .update(expenseClaims)
      .set({
        status: "draft",
        submittedAt: null,
        reviewedAt: new Date(),
        reviewedByUserId: reviewerUserId,
        rejectionReason: reason.trim(),
        updatedAt: new Date(),
      })
      .where(and(eq(expenseClaims.id, id), eq(expenseClaims.status, "approved")));

    return this.getById(organizationId, id);
  }

  /** The employee reopens their own approved, unpaid claim; it needs approval again. */
  async requestEdit(
    organizationId: string,
    userId: string,
    id: string,
    reason: unknown,
  ) {
    const existing = await this.getClaimRow(organizationId, id, true);

    if (existing.submittedByUserId !== userId) {
      throw new ForbiddenException("You can only edit your own claims");
    }
    if (existing.status !== "approved") {
      throw new BadRequestException("Only approved, unpaid claims can be reopened for editing");
    }
    const editReason = typeof reason === "string" ? reason.trim() : "";
    if (!editReason) {
      throw new BadRequestException("Say why the claim needs editing");
    }
    if (editReason.length > 500) {
      throw new BadRequestException("The reason can be up to 500 characters");
    }

    await this.db
      .update(expenseClaims)
      .set({
        status: "draft",
        submittedAt: null,
        reviewedAt: null,
        reviewedByUserId: null,
        rejectionReason: null,
        editReason,
        updatedAt: new Date(),
      })
      .where(and(eq(expenseClaims.id, id), eq(expenseClaims.status, "approved")));

    return this.getById(organizationId, id);
  }

  async uploadReceipt(
    organizationId: string,
    userId: string,
    id: string,
    file: Express.Multer.File,
  ) {
    const existing = await this.getClaimRow(organizationId, id);

    if (existing.submittedByUserId !== userId) {
      throw new ForbiddenException("You can only upload receipts for your own claims");
    }
    if (existing.status !== "draft") {
      throw new BadRequestException("Receipts can only be updated on draft claims");
    }

    if (existing.receiptPath) {
      await this.uploadsService.deleteStoredFile(existing.receiptPath);
    }

    const receiptPath = await this.uploadsService.saveExpenseReceipt(
      organizationId,
      id,
      file,
    );

    await this.db
      .update(expenseClaims)
      .set({ receiptPath, noReceiptReason: null, updatedAt: new Date() })
      .where(eq(expenseClaims.id, id));

    return { receiptPath };
  }

  getReceiptPath(organizationId: string, id: string) {
    return this.getById(organizationId, id).then((claim) => {
      if (!claim.receiptPath) {
        throw new NotFoundException("Receipt not found");
      }
      return claim.receiptPath;
    });
  }

  private async getClaimRow(organizationId: string, id: string, lock = false) {
    if (!UUID_RE.test(id)) {
      throw new NotFoundException("Expense claim not found");
    }
    const query = this.db
      .select()
      .from(expenseClaims)
      .where(
        and(
          eq(expenseClaims.id, id),
          eq(expenseClaims.organizationId, organizationId),
          isNull(expenseClaims.deletedAt),
        ),
      )
      .limit(1);
    // Locked while money is posted, so two people can't pay or correct a claim at once.
    const [row] = lock ? await query.for("update") : await query;

    if (!row) {
      throw new NotFoundException("Expense claim not found");
    }

    return row;
  }

  private async validateCategory(
    organizationId: string,
    categoryId?: string,
  ) {
    if (!categoryId) return;

    const [category] = await this.db
      .select({ id: expenseCategories.id })
      .from(expenseCategories)
      .where(
        and(
          eq(expenseCategories.id, categoryId),
          eq(expenseCategories.organizationId, organizationId),
          isNull(expenseCategories.deletedAt),
        ),
      )
      .limit(1);

    if (!category) {
      throw new BadRequestException("Expense category not found");
    }
  }

  private async queryClaims(
    organizationId: string,
    filters: {
      id?: string;
      status?: ExpenseClaimStatus;
      submittedByUserId?: string;
      fromDate?: string;
      toDate?: string;
    },
  ) {
    const conditions = [
      eq(expenseClaims.organizationId, organizationId),
      isNull(expenseClaims.deletedAt),
    ];

    if (filters.id) {
      conditions.push(eq(expenseClaims.id, filters.id));
    }
    if (filters.submittedByUserId) {
      conditions.push(
        eq(expenseClaims.submittedByUserId, filters.submittedByUserId),
      );
    }
    if (filters.status) {
      if (!VALID_STATUSES.includes(filters.status)) {
        throw new BadRequestException("Invalid status filter");
      }
      conditions.push(eq(expenseClaims.status, filters.status));
    }
    if (filters.fromDate) {
      conditions.push(gte(expenseClaims.expenseDate, filters.fromDate));
    }
    if (filters.toDate) {
      conditions.push(lte(expenseClaims.expenseDate, filters.toDate));
    }

    const rows = await this.db
      .select({
        claim: expenseClaims,
        categoryName: expenseCategories.name,
        bankAccountName: bankAccounts.name,
        submitterName: users.name,
        submitterEmail: users.email,
        reviewerName: reviewerUser.name,
        reviewerEmail: reviewerUser.email,
        reimburserName: reimburserUser.name,
        reimburserEmail: reimburserUser.email,
        paymentDate: expenses.expenseDate,
      })
      .from(expenseClaims)
      .leftJoin(
        expenseCategories,
        eq(expenseCategories.id, expenseClaims.categoryId),
      )
      .leftJoin(bankAccounts, eq(bankAccounts.id, expenseClaims.bankAccountId))
      .innerJoin(users, eq(users.id, expenseClaims.submittedByUserId))
      .leftJoin(
        reviewerUser,
        eq(reviewerUser.id, expenseClaims.reviewedByUserId),
      )
      .leftJoin(
        reimburserUser,
        eq(reimburserUser.id, expenseClaims.reimbursedByUserId),
      )
      .leftJoin(
        expenses,
        and(
          eq(expenses.accountMoveId, expenseClaims.accountMoveId),
          isNull(expenses.deletedAt),
        ),
      )
      .where(and(...conditions))
      .orderBy(desc(expenseClaims.expenseDate), desc(expenseClaims.createdAt))
      .limit(500);

    return rows.map((row) => this.mapClaim(row));
  }

  private mapClaim(row: {
    claim: typeof expenseClaims.$inferSelect;
    categoryName: string | null;
    bankAccountName: string | null;
    submitterName: string | null;
    submitterEmail: string | null;
    reviewerName: string | null;
    reviewerEmail: string | null;
    reimburserName: string | null;
    reimburserEmail: string | null;
    paymentDate: string | null;
  }) {
    return {
      id: row.claim.id,
      number: row.claim.number,
      expenseDate: row.claim.expenseDate,
      description: row.claim.description,
      reference: row.claim.reference,
      amount: roundMoney(Number(row.claim.amount)),
      status: row.claim.status as ExpenseClaimStatus,
      categoryId: row.claim.categoryId,
      categoryName: row.categoryName,
      receiptPath: row.claim.receiptPath,
      hasReceipt: Boolean(row.claim.receiptPath),
      noReceiptReason: row.claim.noReceiptReason,
      submittedByUserId: row.claim.submittedByUserId,
      submitterName: row.submitterName ?? "",
      submitterEmail: row.submitterEmail ?? "",
      createdAt: row.claim.createdAt.toISOString(),
      submittedAt: row.claim.submittedAt?.toISOString() ?? null,
      reviewedAt: row.claim.reviewedAt?.toISOString() ?? null,
      reviewedByUserId: row.claim.reviewedByUserId,
      reviewedByName: row.reviewerName ?? null,
      reviewedByEmail: row.reviewerEmail ?? null,
      rejectionReason: row.claim.rejectionReason,
      editReason: row.claim.editReason,
      reimbursedAt: row.claim.reimbursedAt?.toISOString() ?? null,
      reimbursedByUserId: row.claim.reimbursedByUserId,
      reimbursedByName: row.reimburserName ?? null,
      reimbursedByEmail: row.reimburserEmail ?? null,
      paymentMethod: row.claim.paymentMethod,
      bankAccountId: row.claim.bankAccountId,
      bankAccountName: row.bankAccountName,
      accountMoveId: row.claim.accountMoveId,
      paymentDate: row.paymentDate,
    };
  }
}
