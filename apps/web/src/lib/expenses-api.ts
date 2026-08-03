import { apiFetch } from "./api";

export interface ExpenseCategory {
  id: string;
  name: string;
}

export interface ExpenseRecord {
  id: string;
  number: string;
  expenseDate: string;
  description: string;
  reference: string | null;
  amount: number;
  paymentMethod: string;
  paymentSource: "cash" | "bank";
  bankAccountId?: string | null;
  bankAccountName?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  receiptPath?: string | null;
  hasReceipt?: boolean;
}

export interface ExpensesListResponse {
  summary: {
    monthTotal: number;
    monthCount: number;
    cashTotal: number;
    bankTotal: number;
  };
  expenses: ExpenseRecord[];
}

export function listExpenses() {
  return apiFetch<ExpensesListResponse>("/api/v1/expenses");
}

export function getExpense(id: string) {
  return apiFetch<ExpenseRecord>(`/api/v1/expenses/${id}`);
}

export function createExpense(input: {
  amount: number;
  expenseDate: string;
  description: string;
  paymentMethod: string;
  reference?: string;
  bankAccountId?: string;
  categoryId?: string;
}) {
  return apiFetch<{ id: string; number: string; reference: string | null }>(
    "/api/v1/expenses",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function updateExpense(
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
  return apiFetch<ExpenseRecord>(`/api/v1/expenses/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteExpense(id: string) {
  return apiFetch(`/api/v1/expenses/${id}`, { method: "DELETE" });
}

export async function uploadExpenseReceipt(id: string, file: File) {
  const formData = new FormData();
  formData.append("receipt", file);

  const response = await fetch(`/api/v1/expenses/${id}/receipt`, {
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

export function getExpenseReceiptUrl(id: string) {
  return `/api/v1/expenses/${id}/receipt`;
}

export function listExpenseCategories(params?: {
  search?: string;
  perPage?: number;
}) {
  const search = new URLSearchParams();
  if (params?.search) search.set("search", params.search);
  if (params?.perPage) search.set("perPage", String(params.perPage));
  const query = search.toString();
  return apiFetch<{
    data: ExpenseCategory[];
    meta: { page: number; perPage: number; total: number; totalPages: number };
  }>(`/api/v1/expense-categories${query ? `?${query}` : ""}`);
}

export function seedDefaultExpenseCategories() {
  return apiFetch<{ data: ExpenseCategory[] }>(
    "/api/v1/expense-categories/seed-default",
    { method: "POST" },
  );
}

export function createExpenseCategory(name: string) {
  return apiFetch<ExpenseCategory>("/api/v1/expense-categories", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function updateExpenseCategory(id: string, name: string) {
  return apiFetch<ExpenseCategory>(`/api/v1/expense-categories/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export function archiveExpenseCategory(id: string) {
  return apiFetch<ExpenseCategory>(`/api/v1/expense-categories/${id}`, {
    method: "DELETE",
  });
}
