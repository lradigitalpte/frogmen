import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { glAccounts, journals, type Database } from "@frog1/db";
import { DATABASE } from "../database/database.constants";

const DEFAULT_ACCOUNTS = [
  { code: "1100", name: "Accounts Receivable", accountType: "asset_receivable" as const },
  { code: "101501", name: "Cash", accountType: "asset_cash" as const },
  { code: "101401", name: "Bank", accountType: "asset_current" as const },
  { code: "1200", name: "Inventory", accountType: "asset_current" as const },
  { code: "2200", name: "VAT Output", accountType: "liability_current" as const },
  { code: "4000", name: "Sales Revenue", accountType: "income" as const },
  { code: "5000", name: "Cost of Goods Sold", accountType: "expense_direct_cost" as const },
  { code: "600000", name: "Operating Expenses", accountType: "expense" as const },
];

const DEFAULT_JOURNALS = [
  { code: "SALES", name: "Customer Invoices", journalType: "sale" as const, accountCode: "4000" },
  { code: "BANK", name: "Bank Transactions", journalType: "bank" as const, accountCode: "101401" },
  { code: "CASH", name: "Cash Transactions", journalType: "cash" as const, accountCode: "101501" },
  { code: "MISC", name: "Miscellaneous", journalType: "general" as const, accountCode: "600000" },
];

@Injectable()
export class AccountingProvisionerService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async ensureProvisioned(organizationId: string) {
    const existingAccounts = await this.db
      .select({ id: glAccounts.id, code: glAccounts.code })
      .from(glAccounts)
      .where(eq(glAccounts.organizationId, organizationId));

    const accountIds = new Map(
      existingAccounts.map((account) => [account.code, account.id]),
    );

    for (const account of DEFAULT_ACCOUNTS) {
      if (accountIds.has(account.code)) {
        continue;
      }

      const [row] = await this.db
        .insert(glAccounts)
        .values({
          organizationId,
          code: account.code,
          name: account.name,
          accountType: account.accountType,
        })
        .returning();
      accountIds.set(account.code, row.id);
    }

    const existingJournals = await this.db
      .select({ code: journals.code })
      .from(journals)
      .where(eq(journals.organizationId, organizationId));
    const journalCodes = new Set(existingJournals.map((journal) => journal.code));

    for (const journal of DEFAULT_JOURNALS) {
      if (journalCodes.has(journal.code)) {
        continue;
      }

      await this.db.insert(journals).values({
        organizationId,
        code: journal.code,
        name: journal.name,
        journalType: journal.journalType,
        defaultAccountId: accountIds.get(journal.accountCode) ?? null,
      });
    }
  }

  async getAccountByCode(organizationId: string, code: string) {
    await this.ensureProvisioned(organizationId);

    const [account] = await this.db
      .select()
      .from(glAccounts)
      .where(
        and(
          eq(glAccounts.organizationId, organizationId),
          eq(glAccounts.code, code),
        ),
      )
      .limit(1);

    return account ?? null;
  }

  async getJournalByCode(organizationId: string, code: string) {
    await this.ensureProvisioned(organizationId);

    const [journal] = await this.db
      .select()
      .from(journals)
      .where(
        and(
          eq(journals.organizationId, organizationId),
          eq(journals.code, code),
        ),
      )
      .limit(1);

    return journal ?? null;
  }
}
