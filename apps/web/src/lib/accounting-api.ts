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
}

export function getChartOfAccounts() {
  return apiFetch<ChartOfAccount[]>("/api/v1/accounting/accounts");
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
