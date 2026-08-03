import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq } from "drizzle-orm";
import {
  bankAccountBranches,
  bankAccounts,
  currencies,
  type Database,
} from "@frog1/db";
import type { DocumentBankAccount } from "@frog1/shared";
import { DATABASE } from "../database/database.constants";

@Injectable()
export class DocumentBankAccountsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listForDocuments(
    organizationId: string,
    options?: { branchId?: string | null },
  ): Promise<DocumentBankAccount[]> {
    const rows = await this.db
      .select({
        account: bankAccounts,
        currencyCode: currencies.code,
      })
      .from(bankAccounts)
      .innerJoin(currencies, eq(currencies.id, bankAccounts.currencyId))
      .where(
        and(
          eq(bankAccounts.organizationId, organizationId),
          eq(bankAccounts.isActive, true),
          eq(bankAccounts.showOnDocuments, true),
        ),
      )
      .orderBy(asc(bankAccounts.name));

    if (rows.length === 0) {
      return [];
    }

    const branchRows = await this.db
      .select({
        bankAccountId: bankAccountBranches.bankAccountId,
        branchId: bankAccountBranches.branchId,
      })
      .from(bankAccountBranches)
      .innerJoin(bankAccounts, eq(bankAccounts.id, bankAccountBranches.bankAccountId))
      .where(eq(bankAccounts.organizationId, organizationId));

    const branchMap = new Map<string, string[]>();
    for (const row of branchRows) {
      const current = branchMap.get(row.bankAccountId) ?? [];
      current.push(row.branchId);
      branchMap.set(row.bankAccountId, current);
    }

    const filtered = rows.filter((row) => {
      if (!options?.branchId) {
        return true;
      }
      const assigned = branchMap.get(row.account.id) ?? [];
      return assigned.length === 0 || assigned.includes(options.branchId);
    });

    return filtered
      .sort((left, right) => {
        if (left.account.isDefault !== right.account.isDefault) {
          return left.account.isDefault ? -1 : 1;
        }
        return left.account.name.localeCompare(right.account.name);
      })
      .map((row) => ({
        name: row.account.name,
        bankName: row.account.bankName,
        accountNumber: row.account.accountNumber,
        iban: row.account.iban,
        swiftCode: row.account.swiftCode,
        currencyCode: row.currencyCode,
      }));
  }
}
