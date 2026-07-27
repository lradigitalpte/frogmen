import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, eq, sql } from "drizzle-orm";
import { branches, sessions, type Database } from "@frog1/db";
import { DATABASE } from "../database/database.constants";
import type { SecurityContext } from "./security-context";

@Injectable()
export class BranchesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  list(organizationId: string) {
    return this.db
      .select()
      .from(branches)
      .where(eq(branches.organizationId, organizationId))
      .orderBy(asc(branches.name));
  }

  async create(
    context: SecurityContext,
    input: {
      name?: string;
      code?: string;
      documentPrefix?: string;
      timezone?: string;
      street1?: string;
      street2?: string;
      city?: string;
      zip?: string;
      countryCode?: string;
    },
  ) {
    const name = input.name?.trim();
    const code = input.code?.trim().toUpperCase();
    if (!name || !code || !/^[A-Z0-9_-]{2,24}$/.test(code)) {
      throw new BadRequestException("A valid branch name and code are required");
    }

    try {
      const [created] = await this.db
        .insert(branches)
        .values({
          organizationId: context.organizationId,
          name,
          code,
          documentPrefix:
            input.documentPrefix?.trim().toUpperCase() || code,
          timezone: input.timezone?.trim() || "UTC",
          street1: input.street1?.trim() || null,
          street2: input.street2?.trim() || null,
          city: input.city?.trim() || null,
          zip: input.zip?.trim() || null,
          countryCode: input.countryCode?.trim().toUpperCase() || null,
        })
        .returning();
      return created;
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        throw new ConflictException("Branch code already exists");
      }
      throw error;
    }
  }

  async update(
    context: SecurityContext,
    id: string,
    input: Partial<{
      name: string;
      code: string;
      documentPrefix: string;
      timezone: string;
      street1: string | null;
      street2: string | null;
      city: string | null;
      zip: string | null;
      countryCode: string | null;
    }>,
  ) {
    const [updated] = await this.db
      .update(branches)
      .set({
        ...input,
        code: input.code?.trim().toUpperCase(),
        documentPrefix: input.documentPrefix?.trim().toUpperCase(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(branches.id, id),
          eq(branches.organizationId, context.organizationId),
        ),
      )
      .returning();
    if (!updated) throw new NotFoundException("Branch not found");
    return updated;
  }

  async deactivate(context: SecurityContext, id: string) {
    const [branch] = await this.db
      .select()
      .from(branches)
      .where(
        and(
          eq(branches.id, id),
          eq(branches.organizationId, context.organizationId),
        ),
      )
      .limit(1);
    if (!branch) throw new NotFoundException("Branch not found");
    if (branch.isMain) {
      throw new BadRequestException("The main branch cannot be deactivated");
    }

    await this.db.execute(
      sql`select set_config('app.branch_id', ${id}, true)`,
    );
    const rows = await this.db.execute(sql`
        select (
          exists(select 1 from warehouses where branch_id = ${id}::uuid)
          or exists(select 1 from sales_orders where branch_id = ${id}::uuid)
          or exists(select 1 from invoices where branch_id = ${id}::uuid)
          or exists(select 1 from purchase_orders where branch_id = ${id}::uuid)
          or exists(select 1 from rov_projects where branch_id = ${id}::uuid)
        ) as has_records
      `);
    await this.db.execute(
      sql`select set_config('app.branch_id', ${context.activeBranchId ?? ""}, true)`,
    );
    if (Boolean(rows[0]?.has_records)) {
      throw new ConflictException(
        "Branch has operational records and cannot be deactivated",
      );
    }

    const [updated] = await this.db
      .update(branches)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(branches.id, id))
      .returning();
    return updated;
  }

  async selectScope(
    context: SecurityContext,
    sessionId: string,
    input: { mode?: string; branchId?: string | null },
  ) {
    if (input.mode === "all") {
      if (!context.canAccessAllBranches) {
        throw new BadRequestException("All-branch access is not allowed");
      }
      await this.db
        .update(sessions)
        .set({ activeBranchId: null, branchScope: "all" })
        .where(eq(sessions.id, sessionId));
      return { mode: "all", branchId: null };
    }

    const branchId = input.branchId;
    if (!branchId || !context.branches.some((branch) => branch.id === branchId)) {
      throw new BadRequestException("An accessible branch is required");
    }
    await this.db
      .update(sessions)
      .set({ activeBranchId: branchId, branchScope: "single" })
      .where(eq(sessions.id, sessionId));
    return { mode: "single", branchId };
  }
}
