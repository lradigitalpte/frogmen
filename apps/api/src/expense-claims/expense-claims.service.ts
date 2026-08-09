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
  users,
  type Database,
} from "@frog1/db";
import { roundMoney } from "@frog1/shared";
import { AccountingService } from "../accounting/accounting.service";
import { DATABASE } from "../database/database.constants";
import { UploadsService } from "../uploads/uploads.service";
import { nextDocumentNumber } from "../sales/document-sequences";
import { ExpenseCategoriesService } from "../expenses/expense-categories.service";

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

const reviewerUser = alias(users, "expense_claim_reviewer");
const reimburserUser = alias(users, "expense_claim_reimburser");

@Injectable()
export class ExpenseClaimsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly accountingService: AccountingService,
    private readonly expenseCategoriesService: ExpenseCategoriesService,
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
        amount: String(amount),
        expenseDate: input.expenseDate,
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

    if (input.categoryId !== undefined && input.categoryId) {
      await this.validateCategory(organizationId, input.categoryId);
    }

    await this.db
      .update(expenseClaims)
      .set({
        description,
        amount: String(amount),
        expenseDate: input.expenseDate ?? existing.expenseDate,
        reference:
          input.reference !== undefined
            ? input.reference?.trim() || null
            : existing.reference,
        categoryId:
          input.categoryId !== undefined
            ? input.categoryId ?? null
            : existing.categoryId,
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
    if (existing.status !== "submitted") {
      throw new BadRequestException(
        "Only submitted claims awaiting review can be cancelled",
      );
    }

    await this.db
      .update(expenseClaims)
      .set({
        status: "draft",
        submittedAt: null,
        reviewedAt: null,
        reviewedByUserId: null,
        rejectionReason: null,
        updatedAt: new Date(),
      })
      .where(eq(expenseClaims.id, id));

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
      .where(eq(expenseClaims.id, id));

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
      .where(eq(expenseClaims.id, id));

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
      .where(eq(expenseClaims.id, id));

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
    const existing = await this.getClaimRow(organizationId, id);

    if (existing.status !== "approved") {
      throw new BadRequestException("Only approved claims can be reimbursed");
    }

    const paymentMethod = input.paymentMethod?.trim();
    if (!paymentMethod) {
      throw new BadRequestException("Payment method is required");
    }

    const requiresBank =
      paymentMethod !== "cash" && paymentMethod !== "cheque";
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
      .set({ receiptPath, updatedAt: new Date() })
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

  private async getClaimRow(organizationId: string, id: string) {
    const [row] = await this.db
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
      reimbursedAt: row.claim.reimbursedAt?.toISOString() ?? null,
      reimbursedByUserId: row.claim.reimbursedByUserId,
      reimbursedByName: row.reimburserName ?? null,
      reimbursedByEmail: row.reimburserEmail ?? null,
      paymentMethod: row.claim.paymentMethod,
      bankAccountId: row.claim.bankAccountId,
      bankAccountName: row.bankAccountName,
      accountMoveId: row.claim.accountMoveId,
    };
  }
}
