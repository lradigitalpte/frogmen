import {
  resolveDocumentBankAccountsForPayment,
  type DocumentBankAccount,
} from "@frog1/shared";
import type { BankAccount } from "@/lib/bank-accounts-api";

export function toDocumentBankAccounts(
  accounts: BankAccount[],
): DocumentBankAccount[] {
  return accounts
    .filter((account) => account.isActive && account.showOnDocuments)
    .map((account) => ({
      id: account.id,
      name: account.name,
      bankName: account.bankName,
      accountNumber: account.accountNumber,
      iban: account.iban,
      swiftCode: account.swiftCode,
      currencyCode: account.currencyCode,
      isDefault: account.isDefault,
    }));
}

export function getInvoiceDocumentBankCandidates(
  accounts: BankAccount[],
  currencyCode: string,
): BankAccount[] {
  const normalized = currencyCode.trim().toUpperCase();
  return accounts.filter(
    (account) =>
      account.isActive &&
      account.showOnDocuments &&
      account.currencyCode.trim().toUpperCase() === normalized,
  );
}

export function resolveInvoiceDocumentBankAccountId(
  accounts: BankAccount[],
  currencyCode: string,
  selectedBankAccountId?: string | null,
): string | null {
  const resolved = resolveDocumentBankAccountsForPayment({
    accounts: toDocumentBankAccounts(accounts),
    currencyCode,
    selectedBankAccountId,
  });
  return resolved[0]?.id ?? null;
}

export type InvoicePaymentBankStatus = "ready" | "choose" | "missing";

export function getInvoicePaymentBankStatus(
  accounts: BankAccount[],
  currencyCode: string,
  selectedBankAccountId?: string | null,
): InvoicePaymentBankStatus {
  const candidates = getInvoiceDocumentBankCandidates(accounts, currencyCode);
  if (candidates.length === 0) {
    return "missing";
  }

  if (candidates.length === 1) {
    return "ready";
  }

  if (
    selectedBankAccountId &&
    candidates.some((account) => account.id === selectedBankAccountId)
  ) {
    return "ready";
  }

  return "choose";
}

export function resolveInvoiceDocumentBankIdForCreate(
  accounts: BankAccount[],
  currencyCode: string,
  selectedBankAccountId?: string | null,
): string | undefined {
  if (selectedBankAccountId) {
    return selectedBankAccountId;
  }
  const candidates = getInvoiceDocumentBankCandidates(accounts, currencyCode);
  if (candidates.length === 1) {
    return candidates[0]!.id;
  }
  return undefined;
}
