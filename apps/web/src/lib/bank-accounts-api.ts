import { apiFetch } from "./api";

export interface BankAccount {
  id: string;
  name: string;
  bankName: string | null;
  accountNumber: string | null;
  iban: string | null;
  swiftCode: string | null;
  currencyId: string;
  currencyCode: string;
  glAccountId: string;
  glAccountCode: string;
  isActive: boolean;
  isDefault: boolean;
  showOnDocuments: boolean;
  branchIds: string[];
  balance?: number;
}

export interface BankBalanceReport {
  asOf: string;
  accounts: Array<{
    id: string;
    name: string;
    currencyCode: string;
    glAccountCode: string;
    balance: number;
    receiptsInPeriod: number;
    expensesInPeriod: number;
  }>;
}

export const listBankAccounts = (params?: {
  branchId?: string;
  activeOnly?: boolean;
}) => {
  const search = new URLSearchParams();
  if (params?.branchId) search.set("branchId", params.branchId);
  if (params?.activeOnly === false) search.set("activeOnly", "false");
  const query = search.toString();
  return apiFetch<BankAccount[]>(
    `/api/v1/bank-accounts${query ? `?${query}` : ""}`,
  );
};

export const createBankAccount = (body: {
  name: string;
  bankName?: string;
  accountNumber?: string;
  iban?: string;
  swiftCode?: string;
  currencyId: string;
  isDefault?: boolean;
  showOnDocuments?: boolean;
  branchIds?: string[];
}) =>
  apiFetch<BankAccount>("/api/v1/bank-accounts", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const updateBankAccount = (
  id: string,
  body: Partial<{
    name: string;
    bankName: string;
    accountNumber: string;
    iban: string;
    swiftCode: string;
    currencyId: string;
    isActive: boolean;
    isDefault: boolean;
    showOnDocuments: boolean;
    branchIds: string[];
  }>,
) =>
  apiFetch<BankAccount>(`/api/v1/bank-accounts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

export const deactivateBankAccount = (id: string) =>
  apiFetch<BankAccount>(`/api/v1/bank-accounts/${id}`, {
    method: "DELETE",
  });

export const getBankBalancesReport = (asOf?: string, dateFrom?: string) => {
  const search = new URLSearchParams();
  if (asOf) search.set("asOf", asOf);
  if (dateFrom) search.set("dateFrom", dateFrom);
  const query = search.toString();
  return apiFetch<BankBalanceReport>(
    `/api/v1/accounting/reports/bank-balances${query ? `?${query}` : ""}`,
  );
};
