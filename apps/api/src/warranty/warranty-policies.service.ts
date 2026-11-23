import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  ne,
  sql,
  type SQL,
} from "drizzle-orm";
import {
  products,
  warrantyPolicies,
  warrantyRegistrations,
  type Database,
} from "@frog1/db";
import type {
  CreateWarrantyPolicyDto,
  ListWarrantyPoliciesQuery,
  UpdateWarrantyPolicyDto,
} from "./dto/warranty-policy.dto";
import { DATABASE } from "../database/database.constants";
import { OrgInventoryService } from "../inventory/org-inventory.service";

@Injectable()
export class WarrantyPoliciesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly orgInventory: OrgInventoryService,
  ) {}

  private normalizeName(name: string) {
    return name.trim().replace(/\s+/g, " ");
  }

  private async assertUniqueName(organizationId: string, name: string, exceptId?: string) {
    const filters: SQL[] = [
      eq(warrantyPolicies.organizationId, organizationId),
      sql`lower(${warrantyPolicies.name}) = lower(${name})`,
    ];
    if (exceptId) filters.push(ne(warrantyPolicies.id, exceptId));
    const [existing] = await this.db
      .select({ id: warrantyPolicies.id })
      .from(warrantyPolicies)
      .where(and(...filters))
      .limit(1);
    if (existing) {
      throw new BadRequestException(`A policy called "${name}" already exists`);
    }
  }

  /** How many registrations and products use each policy. */
  private async usageFor(organizationId: string, ids: string[]) {
    const usage = new Map<string, { registrations: number; activeRegistrations: number; products: number }>();
    if (ids.length === 0) return usage;
    const regs = await this.db
      .select({
        policyId: warrantyRegistrations.policyId,
        total: count(),
        active: sql<number>`count(*) filter (where ${warrantyRegistrations.status} not in ('voided', 'pending_delivery') and ${warrantyRegistrations.endsAt} >= (now() at time zone 'utc')::date)`,
      })
      .from(warrantyRegistrations)
      .where(and(eq(warrantyRegistrations.organizationId, organizationId), inArray(warrantyRegistrations.policyId, ids)))
      .groupBy(warrantyRegistrations.policyId);
    const prods = await this.db
      .select({ policyId: products.defaultWarrantyPolicyId, total: count() })
      .from(products)
      .where(
        and(
          eq(products.organizationId, organizationId),
          isNull(products.deletedAt),
          inArray(products.defaultWarrantyPolicyId, ids),
        ),
      )
      .groupBy(products.defaultWarrantyPolicyId);
    for (const id of ids) usage.set(id, { registrations: 0, activeRegistrations: 0, products: 0 });
    for (const r of regs) {
      const u = usage.get(r.policyId);
      if (u) {
        u.registrations = Number(r.total);
        u.activeRegistrations = Number(r.active);
      }
    }
    for (const r of prods) {
      const u = r.policyId ? usage.get(r.policyId) : undefined;
      if (u) u.products = Number(r.total);
    }
    return usage;
  }

  async list(organizationId: string, query: ListWarrantyPoliciesQuery) {
    const page = Math.max(query.page ?? 1, 1);
    const perPage = Math.min(Math.max(query.perPage ?? 50, 1), 200);
    const offset = (page - 1) * perPage;

    const filters: SQL[] = [eq(warrantyPolicies.organizationId, organizationId)];

    if (query.search?.trim()) {
      filters.push(ilike(warrantyPolicies.name, `%${query.search.trim()}%`));
    }

    if (query.activeOnly) {
      filters.push(eq(warrantyPolicies.isActive, true));
    }

    const whereClause = and(...filters);

    let rows = await this.db
      .select()
      .from(warrantyPolicies)
      .where(whereClause)
      .orderBy(desc(warrantyPolicies.isActive), asc(warrantyPolicies.name))
      .limit(perPage)
      .offset(offset);

    let total = Number(
      (
        await this.db
          .select({ total: count() })
          .from(warrantyPolicies)
          .where(whereClause)
      )[0]?.total ?? 0,
    );

    if (total === 0 && !query.search?.trim()) {
      await this.orgInventory.provision(organizationId);
      rows = await this.db
        .select()
        .from(warrantyPolicies)
        .where(whereClause)
        .orderBy(desc(warrantyPolicies.isActive), asc(warrantyPolicies.name))
        .limit(perPage)
        .offset(offset);
      total = Number(
        (
          await this.db
            .select({ total: count() })
            .from(warrantyPolicies)
            .where(whereClause)
        )[0]?.total ?? 0,
      );
    }

    const usage = await this.usageFor(organizationId, rows.map((r) => r.id));

    return {
      data: rows.map((row) => ({
        ...row,
        usage: usage.get(row.id) ?? { registrations: 0, activeRegistrations: 0, products: 0 },
      })),
      meta: {
        page,
        perPage,
        total,
        totalPages: Math.ceil(total / perPage) || 1,
      },
    };
  }

  async getById(organizationId: string, id: string) {
    const [policy] = await this.db
      .select()
      .from(warrantyPolicies)
      .where(
        and(
          eq(warrantyPolicies.id, id),
          eq(warrantyPolicies.organizationId, organizationId),
        ),
      )
      .limit(1);

    if (!policy) {
      throw new NotFoundException("Warranty policy not found");
    }

    return policy;
  }

  async create(organizationId: string, dto: CreateWarrantyPolicyDto) {
    const name = this.normalizeName(dto.name);

    if (!name) {
      throw new BadRequestException("Policy name is required");
    }

    await this.assertUniqueName(organizationId, name);

    const durationMonths = dto.durationMonths ?? 12;

    if (!Number.isInteger(durationMonths) || durationMonths < 1) {
      throw new BadRequestException("Duration must be at least 1 month");
    }

    const [created] = await this.db
      .insert(warrantyPolicies)
      .values({
        organizationId,
        name,
        description: dto.description?.trim() || null,
        durationMonths,
        isActive: dto.isActive ?? true,
      })
      .returning();

    return created;
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateWarrantyPolicyDto,
  ) {
    await this.getById(organizationId, id);

    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (dto.name !== undefined) {
      const name = this.normalizeName(dto.name);
      if (!name) {
        throw new BadRequestException("Policy name is required");
      }
      await this.assertUniqueName(organizationId, name, id);
      updates.name = name;
    }

    if (dto.description !== undefined) {
      updates.description = dto.description?.trim() || null;
    }

    if (dto.durationMonths !== undefined) {
      if (!Number.isInteger(dto.durationMonths) || dto.durationMonths < 1) {
        throw new BadRequestException("Duration must be at least 1 month");
      }
      updates.durationMonths = dto.durationMonths;
    }

    if (dto.isActive !== undefined) {
      updates.isActive = dto.isActive;
    }

    const [updated] = await this.db
      .update(warrantyPolicies)
      .set(updates)
      .where(
        and(
          eq(warrantyPolicies.id, id),
          eq(warrantyPolicies.organizationId, organizationId),
        ),
      )
      .returning();

    return updated;
  }

  async seedDefaultPolicy(organizationId: string) {
    await this.orgInventory.provision(organizationId);
    return this.list(organizationId, { perPage: 200 });
  }
}
