import { apiFetch } from "./api";

export type ExpenseClaimStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected"
  | "reimbursed";

export interface ExpenseClaim {
  id: string;
  number: string;
  expenseDate: string;
  description: string;
  reference: string | null;
  amount: number;
  status: ExpenseClaimStatus;
  categoryId?: string | null;
  categoryName?: string | null;
  receiptPath?: string | null;
  hasReceipt?: boolean;
  submittedByUserId: string;
  submitterName: string;
  submitterEmail: string;
  createdAt?: string;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  reviewedByUserId?: string | null;
  reviewedByName?: string | null;
  reviewedByEmail?: string | null;
  rejectionReason?: string | null;
  reimbursedAt?: string | null;
  reimbursedByUserId?: string | null;
  reimbursedByName?: string | null;
  reimbursedByEmail?: string | null;
  paymentMethod?: string | null;
  bankAccountId?: string | null;
  bankAccountName?: string | null;
  accountMoveId?: string | null;
}

export interface MyExpenseClaimsResponse {
  summary: {
    submittedCount: number;
    approvedAwaitingPaymentTotal: number;
  };
  claims: ExpenseClaim[];
}

export interface OrgExpenseClaimsResponse {
  summary: {
    outstandingApprovedTotal: number;
    reimbursedThisMonth: number;
    submittedCount: number;
  };
  claims: ExpenseClaim[];
}

export function listMyExpenseClaims() {
  return apiFetch<MyExpenseClaimsResponse>("/api/v1/expense-claims/mine");
}

export function listExpenseClaims(params?: {
  status?: ExpenseClaimStatus;
  submittedByUserId?: string;
  fromDate?: string;
  toDate?: string;
}) {
  const search = new URLSearchParams();
  if (params?.status) search.set("status", params.status);
  if (params?.submittedByUserId) {
    search.set("submittedByUserId", params.submittedByUserId);
  }
  if (params?.fromDate) search.set("fromDate", params.fromDate);
  if (params?.toDate) search.set("toDate", params.toDate);
  const query = search.toString();
  return apiFetch<OrgExpenseClaimsResponse>(
    `/api/v1/expense-claims${query ? `?${query}` : ""}`,
  );
}

export function getExpenseClaim(id: string) {
  return apiFetch<ExpenseClaim>(`/api/v1/expense-claims/${id}`);
}

export function createExpenseClaim(input: {
  amount: number;
  expenseDate: string;
  description: string;
  reference?: string;
  categoryId?: string;
}) {
  return apiFetch<ExpenseClaim>("/api/v1/expense-claims", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateExpenseClaim(
  id: string,
  input: {
    amount?: number;
    expenseDate?: string;
    description?: string;
    reference?: string | null;
    categoryId?: string | null;
  },
) {
  return apiFetch<ExpenseClaim>(`/api/v1/expense-claims/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteExpenseClaim(id: string) {
  return apiFetch(`/api/v1/expense-claims/${id}`, { method: "DELETE" });
}

export function submitExpenseClaim(id: string) {
  return apiFetch<ExpenseClaim>(`/api/v1/expense-claims/${id}/submit`, {
    method: "POST",
  });
}

export function withdrawExpenseClaim(id: string) {
  return apiFetch<ExpenseClaim>(`/api/v1/expense-claims/${id}/withdraw`, {
    method: "POST",
  });
}

export function approveExpenseClaim(id: string) {
  return apiFetch<ExpenseClaim>(`/api/v1/expense-claims/${id}/approve`, {
    method: "POST",
  });
}

export function rejectExpenseClaim(id: string, reason: string) {
  return apiFetch<ExpenseClaim>(`/api/v1/expense-claims/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function reimburseExpenseClaim(
  id: string,
  input: {
    paymentMethod: string;
    bankAccountId?: string;
    reimbursedDate?: string;
  },
) {
  return apiFetch<ExpenseClaim>(`/api/v1/expense-claims/${id}/reimburse`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function uploadExpenseClaimReceipt(id: string, file: File) {
  const formData = new FormData();
  formData.append("receipt", file);

  const response = await fetch(`/api/v1/expense-claims/${id}/receipt`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message =
      typeof body?.message === "string"
        ? body.message
        : response.statusText || "Upload failed";
    throw new Error(message);
  }

  return response.json() as Promise<{ receiptPath: string }>;
}

export function getExpenseClaimReceiptUrl(id: string) {
  return `/api/v1/expense-claims/${id}/receipt`;
}
