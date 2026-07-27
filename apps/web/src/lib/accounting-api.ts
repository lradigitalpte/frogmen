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

export interface AccountingOverview {
  journals: AccountingJournalCard[];
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
  expenseDate: string;
  description: string;
  reference: string | null;
  amount: number;
  paymentSource: "cash" | "bank";
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
  return apiFetch<ExpensesListResponse>("/api/v1/accounting/expenses");
}

export function createExpense(input: {
  amount: number;
  expenseDate: string;
  description: string;
  paymentMethod: string;
  reference?: string;
}) {
  return apiFetch<{ id: string }>("/api/v1/accounting/expenses", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
