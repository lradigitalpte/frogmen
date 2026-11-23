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

const CODE_RE = /^[A-Z0-9_-]{2,24}$/;

function assertTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
  } catch {
    throw new BadRequestException(`Unknown timezone: ${value}`);
  }
  return value;
}

/** Drizzle wraps the Postgres error, so the SQLSTATE may sit on `cause`. */
function isUniqueViolation(error: unknown) {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

function optionalText(value: string | null | undefined) {
  if (value === undefined) return undefined;
  return value?.trim() || null;
}

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
    if (!name || !code || !CODE_RE.test(code)) {
      throw new BadRequestException("A valid branch name and code are required");
    }
    const documentPrefix = input.documentPrefix?.trim().toUpperCase() || code;
    if (!CODE_RE.test(documentPrefix)) {
      throw new BadRequestException("Document prefix must be 2–24 letters, numbers, hyphens or underscores");
    }
    const timezone = assertTimezone(input.timezone?.trim() || "UTC");

    try {
      const [created] = await this.db
        .insert(branches)
        .values({
          organizationId: context.organizationId,
          name,
          code,
          documentPrefix,
          timezone,
          street1: input.street1?.trim() || null,
          street2: input.street2?.trim() || null,
          city: input.city?.trim() || null,
          zip: input.zip?.trim() || null,
          countryCode: input.countryCode?.trim().toUpperCase() || null,
        })
        .returning();
      return created;
    } catch (error) {
      if (isUniqueViolation(error)) {
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
    // Only these fields are editable; isMain / isActive / organizationId are never taken from the body.
    const patch: Partial<typeof branches.$inferInsert> = { updatedAt: new Date() };
    if (input.name !== undefined) {
      const name = input.name?.trim();
      if (!name) throw new BadRequestException("Branch name is required");
      patch.name = name;
    }
    if (input.code !== undefined) {
      const code = input.code?.trim().toUpperCase();
      if (!code || !CODE_RE.test(code)) {
        throw new BadRequestException("Branch code must be 2–24 letters, numbers, hyphens or underscores");
      }
      patch.code = code;
    }
    if (input.documentPrefix !== undefined) {
      const prefix = input.documentPrefix?.trim().toUpperCase();
      if (!prefix || !CODE_RE.test(prefix)) {
        throw new BadRequestException("Document prefix must be 2–24 letters, numbers, hyphens or underscores");
      }
      patch.documentPrefix = prefix;
    }
    if (input.timezone !== undefined) {
      patch.timezone = assertTimezone(input.timezone?.trim() || "UTC");
    }
    const street1 = optionalText(input.street1);
    if (street1 !== undefined) patch.street1 = street1;
    const street2 = optionalText(input.street2);
    if (street2 !== undefined) patch.street2 = street2;
    const city = optionalText(input.city);
    if (city !== undefined) patch.city = city;
    const zip = optionalText(input.zip);
    if (zip !== undefined) patch.zip = zip;
    const countryCode = optionalText(input.countryCode);
    if (countryCode !== undefined) patch.countryCode = countryCode?.toUpperCase() ?? null;

    try {
      const [updated] = await this.db
        .update(branches)
        .set(patch)
        .where(
          and(
            eq(branches.id, id),
            eq(branches.organizationId, context.organizationId),
          ),
        )
        .returning();
      if (!updated) throw new NotFoundException("Branch not found");
      return updated;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("Another branch already uses that code");
      }
      throw error;
    }
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

    // Requests already run in a transaction (RlsContextInterceptor), so the branch
    // context can be switched for this check and then restored for later writes (audit log).
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
    const hasRecords = Boolean(rows[0]?.has_records);
    if (hasRecords) {
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

  async reactivate(context: SecurityContext, id: string) {
    const [updated] = await this.db
      .update(branches)
      .set({ isActive: true, updatedAt: new Date() })
      .where(and(eq(branches.id, id), eq(branches.organizationId, context.organizationId)))
      .returning();
    if (!updated) throw new NotFoundException("Branch not found");
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
