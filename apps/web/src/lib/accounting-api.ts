import { apiFetch } from "./api";

export interface JournalChartDataset {
  label: string;
  data: number[];
  color: string;
}

export interface JournalChart {
  type: "bar" | "line";
  labels: string[];
  datasets: JournalChartDataset[];
}

export interface JournalStat {
  label: string;
  value: number;
  amount?: number;
}

export interface AccountingJournalCard {
  id: string;
  code: string;
  name: string;
  journalType: string;
  balance: number;
  stats: JournalStat[];
  chart: JournalChart;
}

export interface BankAccountBalance {
  id: string;
  name: string;
  currencyCode: string;
  glAccountCode: string;
  balance: number;
  receiptsInPeriod: number;
  expensesInPeriod: number;
}

export interface AccountingOverview {
  journals: AccountingJournalCard[];
  bankAccounts: BankAccountBalance[];
  unpaidInvoiceCount: number;
  unpaidInvoiceTotalBase: number;
}

export interface FinancialReportAccount {
  code: string;
  name: string;
  balance: number;
}

export interface ProfitLossReport {
  dateFrom: string;
  dateTo: string;
  sections: Array<{
    title: string;
    accounts: FinancialReportAccount[];
    total: number;
    isExpense?: boolean;
  }>;
  netIncome: number;
  isProfit: boolean;
}

export interface BalanceSheetReport {
  date: string;
  sections: Array<{
    title: string;
    accounts: FinancialReportAccount[];
    total: number;
  }>;
  assetsTotal: number;
  grandTotal: number;
  isBalanced: boolean;
}

export interface InvoiceJournalLine {
  id: string;
  label: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  lineNumber: number;
}

export interface ChartOfAccount {
  id: string;
  code: string;
  name: string;
  accountType: string;
  isActive: number;
  asOf: string;
  balance: number;
  hasActivity: boolean;
}

export function getChartOfAccounts(asOf?: string) {
  const params = asOf ? `?${new URLSearchParams({ asOf })}` : "";
  return apiFetch<ChartOfAccount[]>(`/api/v1/accounting/accounts${params}`);
}

export interface AccountLedgerEntry {
  id: string;
  moveId: string;
  moveDate: string;
  moveName: string;
  reference: string | null;
  label: string;
  journalCode: string;
  debit: number;
  credit: number;
  amount: number;
  source: {
    type: "invoice" | "payment" | "refund" | "expense" | "journal";
    id: string | null;
    label: string | null;
    invoiceId: string | null;
  };
}

export interface AccountLedgerReport {
  account: {
    id: string;
    code: string;
    name: string;
    accountType: string;
    asOf: string;
    balance: number;
  };
  entries: AccountLedgerEntry[];
  journalCodes: string[];
  periodTotals: {
    debit: number;
    credit: number;
    net: number;
  };
  totals: {
    debit: number;
    credit: number;
    balance: number;
  };
  meta: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}

export interface GetAccountLedgerParams {
  asOf?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  journalCode?: string;
  page?: number;
  perPage?: number;
}

export interface JournalMoveDetail {
  move: {
    id: string;
    name: string;
    reference: string | null;
    moveDate: string;
    journalCode: string;
    journalName: string;
    invoiceId: string | null;
    invoiceNumber: string | null;
    paymentId: string | null;
    refundId: string | null;
  };
  lines: Array<{
    id: string;
    label: string;
    accountId: string;
    accountCode: string;
    accountName: string;
    debit: number;
    credit: number;
    lineNumber: number;
  }>;
  cogsLines: Array<{
    productName: string;
    quantity: string;
    unitCost: string | null;
    costAmount: string;
    serialNumber: string | null;
    productUnitId: string | null;
  }>;
}

export function getAccountLedger(
  accountId: string,
  params: GetAccountLedgerParams = {},
) {
  const searchParams = new URLSearchParams();
  if (params.asOf) searchParams.set("asOf", params.asOf);
  if (params.dateFrom) searchParams.set("dateFrom", params.dateFrom);
  if (params.dateTo) searchParams.set("dateTo", params.dateTo);
  if (params.search?.trim()) searchParams.set("search", params.search.trim());
  if (params.journalCode?.trim()) {
    searchParams.set("journalCode", params.journalCode.trim());
  }
  if (params.page) searchParams.set("page", String(params.page));
  if (params.perPage) searchParams.set("perPage", String(params.perPage));
  const query = searchParams.toString();
  return apiFetch<AccountLedgerReport>(
    `/api/v1/accounting/accounts/${accountId}/ledger${query ? `?${query}` : ""}`,
  );
}

export function getJournalMoveDetail(moveId: string) {
  return apiFetch<JournalMoveDetail>(`/api/v1/accounting/moves/${moveId}`);
}

export function getAccountingOverview() {
  return apiFetch<AccountingOverview>("/api/v1/accounting/overview");
}

export function getProfitLossReport(dateFrom: string, dateTo: string) {
  const params = new URLSearchParams({ dateFrom, dateTo });
  return apiFetch<ProfitLossReport>(
    `/api/v1/accounting/reports/profit-loss?${params}`,
  );
}

export function getBalanceSheetReport(asOf: string) {
  const params = new URLSearchParams({ asOf });
  return apiFetch<BalanceSheetReport>(
    `/api/v1/accounting/reports/balance-sheet?${params}`,
  );
}

export function getInvoiceJournal(invoiceId: string) {
  return apiFetch<{
    move: {
      id: string;
      name: string;
      reference: string | null;
      moveDate: string;
      state: string;
    } | null;
    lines: InvoiceJournalLine[];
  }>(`/api/v1/invoices/${invoiceId}/journal`);
}

export interface ExpenseRecord {
  id: string;
  number: string;
  expenseDate: string;
  description: string;
  reference: string | null;
  amount: number;
  paymentMethod?: string;
  paymentSource: "cash" | "bank";
  bankAccountName?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
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

export {
  listExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  uploadExpenseReceipt,
  getExpenseReceiptUrl,
  listExpenseCategories,
  createExpenseCategory,
  updateExpenseCategory,
  archiveExpenseCategory,
} from "./expenses-api";
