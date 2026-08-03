import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  bankAccountBranches,
  bankAccounts,
  branches,
  currencies,
  glAccounts,
  type Database,
} from "@frog1/db";
import { AccountingProvisionerService } from "../accounting/accounting-provisioner.service";
import { DATABASE } from "../database/database.constants";
import type { SecurityContext } from "../security/security-context";

export interface BankAccountListItem {
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

@Injectable()
export class BankAccountsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly provisioner: AccountingProvisionerService,
  ) {}

  async list(
    organizationId: string,
    options?: { branchId?: string | null; activeOnly?: boolean },
  ): Promise<BankAccountListItem[]> {
    await this.provisioner.ensureProvisioned(organizationId);

    const rows = await this.db
      .select({
        account: bankAccounts,
        currencyCode: currencies.code,
        glAccountCode: glAccounts.code,
      })
      .from(bankAccounts)
      .innerJoin(currencies, eq(currencies.id, bankAccounts.currencyId))
      .innerJoin(glAccounts, eq(glAccounts.id, bankAccounts.glAccountId))
      .where(
        and(
          eq(bankAccounts.organizationId, organizationId),
          options?.activeOnly ? eq(bankAccounts.isActive, true) : undefined,
        ),
      )
      .orderBy(asc(bankAccounts.name));

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

    return filtered.map((row) => ({
      id: row.account.id,
      name: row.account.name,
      bankName: row.account.bankName,
      accountNumber: row.account.accountNumber,
      iban: row.account.iban,
      swiftCode: row.account.swiftCode,
      currencyId: row.account.currencyId,
      currencyCode: row.currencyCode,
      glAccountId: row.account.glAccountId,
      glAccountCode: row.glAccountCode,
      isActive: row.account.isActive,
      isDefault: row.account.isDefault,
      showOnDocuments: row.account.showOnDocuments,
      branchIds: branchMap.get(row.account.id) ?? [],
    }));
  }

  async getById(organizationId: string, id: string) {
    const items = await this.list(organizationId);
    const account = items.find((item) => item.id === id);
    if (!account) {
      throw new NotFoundException("Bank account not found");
    }
    return account;
  }

  async create(
    context: SecurityContext,
    input: {
      name?: string;
      bankName?: string;
      accountNumber?: string;
      iban?: string;
      swiftCode?: string;
      currencyId?: string;
      isDefault?: boolean;
      showOnDocuments?: boolean;
      branchIds?: string[];
    },
  ) {
    const name = input.name?.trim();
    if (!name) {
      throw new BadRequestException("Bank account name is required");
    }
    if (!input.currencyId) {
      throw new BadRequestException("Currency is required");
    }
    const currencyId = input.currencyId;

    const [currency] = await this.db
      .select({ id: currencies.id })
      .from(currencies)
      .where(eq(currencies.id, currencyId))
      .limit(1);
    if (!currency) {
      throw new BadRequestException("Invalid currency");
    }

    const branchIds = [...new Set(input.branchIds ?? [])];
    if (branchIds.length > 0) {
      const valid = await this.db
        .select({ id: branches.id })
        .from(branches)
        .where(
          and(
            eq(branches.organizationId, context.organizationId),
            eq(branches.isActive, true),
            inArray(branches.id, branchIds),
          ),
        );
      if (valid.length !== branchIds.length) {
        throw new BadRequestException("One or more branches are invalid");
      }
    }

    const [existing] = await this.db
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(
        and(
          eq(bankAccounts.organizationId, context.organizationId),
          sql`lower(${bankAccounts.name}) = ${name.toLowerCase()}`,
        ),
      )
      .limit(1);
    if (existing) {
      throw new ConflictException("A bank account with this name already exists");
    }

    const glAccount = await this.provisioner.allocateBankGlAccount(
      context.organizationId,
      name,
    );
    if (!glAccount?.id) {
      throw new Error("Failed to provision bank GL account");
    }

    const [account] = await this.db.transaction(async (transaction) => {
      if (input.isDefault) {
        await transaction
          .update(bankAccounts)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(eq(bankAccounts.organizationId, context.organizationId));
      }

      const [created] = await transaction
        .insert(bankAccounts)
        .values({
          organizationId: context.organizationId,
          name,
          bankName: input.bankName?.trim() || null,
          accountNumber: input.accountNumber?.trim() || null,
          iban: input.iban?.trim() || null,
          swiftCode: input.swiftCode?.trim() || null,
          currencyId,
          glAccountId: glAccount.id,
          isDefault: Boolean(input.isDefault),
          showOnDocuments: input.showOnDocuments ?? true,
        })
        .returning();

      if (branchIds.length > 0) {
        await transaction.insert(bankAccountBranches).values(
          branchIds.map((branchId) => ({
            bankAccountId: created.id,
            branchId,
          })),
        );
      }

      return [created];
    });

    return this.getById(context.organizationId, account.id);
  }

  async update(
    context: SecurityContext,
    id: string,
    input: {
      name?: string;
      bankName?: string;
      accountNumber?: string;
      iban?: string;
      swiftCode?: string;
      currencyId?: string;
      isActive?: boolean;
      isDefault?: boolean;
      showOnDocuments?: boolean;
      branchIds?: string[];
    },
  ) {
    const [current] = await this.db
      .select()
      .from(bankAccounts)
      .where(
        and(
          eq(bankAccounts.id, id),
          eq(bankAccounts.organizationId, context.organizationId),
        ),
      )
      .limit(1);
    if (!current) {
      throw new NotFoundException("Bank account not found");
    }

    const nextName = input.name?.trim() ?? current.name;
    if (!nextName) {
      throw new BadRequestException("Bank account name is required");
    }

    if (input.currencyId && input.currencyId !== current.currencyId) {
      const [currency] = await this.db
        .select({ id: currencies.id })
        .from(currencies)
        .where(eq(currencies.id, input.currencyId))
        .limit(1);
      if (!currency) {
        throw new BadRequestException("Invalid currency");
      }
    }

    if (input.branchIds) {
      const branchIds = [...new Set(input.branchIds)];
      if (branchIds.length > 0) {
        const valid = await this.db
          .select({ id: branches.id })
          .from(branches)
          .where(
            and(
              eq(branches.organizationId, context.organizationId),
              eq(branches.isActive, true),
              inArray(branches.id, branchIds),
            ),
          );
        if (valid.length !== branchIds.length) {
          throw new BadRequestException("One or more branches are invalid");
        }
      }
    }

    await this.db.transaction(async (transaction) => {
      if (input.isDefault) {
        await transaction
          .update(bankAccounts)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(eq(bankAccounts.organizationId, context.organizationId));
      }

      await transaction
        .update(bankAccounts)
        .set({
          name: nextName,
          bankName:
            input.bankName !== undefined
              ? input.bankName.trim() || null
              : current.bankName,
          accountNumber:
            input.accountNumber !== undefined
              ? input.accountNumber.trim() || null
              : current.accountNumber,
          iban:
            input.iban !== undefined ? input.iban.trim() || null : current.iban,
          swiftCode:
            input.swiftCode !== undefined
              ? input.swiftCode.trim() || null
              : current.swiftCode,
          currencyId: input.currencyId ?? current.currencyId,
          isActive: input.isActive ?? current.isActive,
          isDefault: input.isDefault ?? current.isDefault,
          showOnDocuments: input.showOnDocuments ?? current.showOnDocuments,
          updatedAt: new Date(),
        })
        .where(eq(bankAccounts.id, id));

      await transaction
        .update(glAccounts)
        .set({ name: nextName.slice(0, 255), updatedAt: new Date() })
        .where(eq(glAccounts.id, current.glAccountId));

      if (input.branchIds) {
        await transaction
          .delete(bankAccountBranches)
          .where(eq(bankAccountBranches.bankAccountId, id));
        if (input.branchIds.length > 0) {
          await transaction.insert(bankAccountBranches).values(
            [...new Set(input.branchIds)].map((branchId) => ({
              bankAccountId: id,
              branchId,
            })),
          );
        }
      }
    });

    return this.getById(context.organizationId, id);
  }

  async deactivate(context: SecurityContext, id: string) {
    return this.update(context, id, { isActive: false, isDefault: false });
  }

  async assertUsableForTransaction(
    organizationId: string,
    bankAccountId: string,
    options?: { branchId?: string | null; currencyId?: string | null },
  ) {
    const account = await this.getById(organizationId, bankAccountId);
    if (!account.isActive) {
      throw new BadRequestException("Bank account is inactive");
    }

    if (options?.branchId && account.branchIds.length > 0) {
      if (!account.branchIds.includes(options.branchId)) {
        throw new BadRequestException(
          "This bank account is not available for the selected branch",
        );
      }
    }

    if (
      options?.currencyId &&
      options.currencyId !== account.currencyId
    ) {
      throw new BadRequestException(
        "Payment currency does not match the selected bank account currency",
      );
    }

    return account;
  }
}
