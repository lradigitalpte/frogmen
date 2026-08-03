import type { DocumentTemplateSettings } from "../schemas/document-templates";
import { resolveDocumentTemplates } from "../schemas/document-templates";

export interface DocumentBankAccount {
  name: string;
  bankName: string | null;
  accountNumber: string | null;
  iban: string | null;
  swiftCode: string | null;
  currencyCode: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hasLegacyTemplateBankDetails(
  templates: Required<DocumentTemplateSettings>,
) {
  return Boolean(
    templates.bankName?.trim() ||
      templates.bankAccount?.trim() ||
      templates.bankIban?.trim() ||
      templates.bankSwiftCode?.trim() ||
      templates.bankAccountName?.trim(),
  );
}

function formatBankAccountLines(account: DocumentBankAccount): string[] {
  const lines = [`${account.name} (${account.currencyCode})`];

  if (account.bankName?.trim()) {
    lines.push(account.bankName.trim());
  }
  if (account.accountNumber?.trim()) {
    lines.push(`Account: ${account.accountNumber.trim()}`);
  }
  if (account.iban?.trim()) {
    lines.push(`IBAN: ${account.iban.trim()}`);
  }
  if (account.swiftCode?.trim()) {
    lines.push(`SWIFT / BIC: ${account.swiftCode.trim()}`);
  }

  return lines;
}

function formatLegacyBankLines(
  companyName: string,
  templates: Required<DocumentTemplateSettings>,
): string[] {
  const lines = [templates.bankAccountName?.trim() || companyName];

  if (templates.bankName?.trim()) {
    lines.push(templates.bankName.trim());
  }
  if (templates.bankAccount?.trim()) {
    lines.push(`Account: ${templates.bankAccount.trim()}`);
  }
  if (templates.bankIban?.trim()) {
    lines.push(`IBAN: ${templates.bankIban.trim()}`);
  }
  if (templates.bankSwiftCode?.trim()) {
    lines.push(`SWIFT / BIC: ${templates.bankSwiftCode.trim()}`);
  }

  return lines;
}

export function buildDocumentPaymentDetailsText(
  companyName: string,
  templates: DocumentTemplateSettings = {},
  accounts: DocumentBankAccount[] = [],
): string | null {
  const resolved = resolveDocumentTemplates(templates);
  const blocks: string[] = [];

  if (accounts.length > 0) {
    for (const account of accounts) {
      blocks.push(formatBankAccountLines(account).join("\n"));
    }
  } else if (hasLegacyTemplateBankDetails(resolved)) {
    blocks.push(formatLegacyBankLines(companyName, resolved).join("\n"));
  }

  if (resolved.paymentInstructions?.trim()) {
    blocks.push(resolved.paymentInstructions.trim());
  }

  if (blocks.length === 0) {
    return null;
  }

  return blocks.join("\n\n");
}

export function renderDocumentPaymentDetailsHtml(options: {
  companyName: string;
  documentTemplates: DocumentTemplateSettings;
  documentBankAccounts?: DocumentBankAccount[];
  className?: string;
}): string {
  const text = buildDocumentPaymentDetailsText(
    options.companyName,
    options.documentTemplates,
    options.documentBankAccounts ?? [],
  );

  if (!text) {
    return "";
  }

  const className = options.className ?? "notes";
  const style =
    className === "notes"
      ? ' style="width:55%;margin-top:24px"'
      : ' class="terms"';

  return `<div class="${className}"${style}><strong>Payment Details</strong>${escapeHtml(text)}</div>`;
}
