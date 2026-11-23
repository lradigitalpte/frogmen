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
  isNotNull,
  inArray,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { purchaseOrders, vendors, type Database } from "@frog1/db";
import type {
  CreateVendorInput,
  ListVendorsQuery,
  UpdateVendorInput,
} from "./dto/vendor.dto";
import { DATABASE } from "../database/database.constants";

@Injectable()
export class VendorsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(organizationId: string, query: ListVendorsQuery) {
    const page = Math.max(query.page ?? 1, 1);
    const perPage = Math.min(Math.max(query.perPage ?? 16, 1), 100);
    const offset = (page - 1) * perPage;

    const filters: SQL[] = [eq(vendors.organizationId, organizationId)];
    const searchFilters: SQL[] = [eq(vendors.organizationId, organizationId)];

    if (query.archived) {
      filters.push(isNotNull(vendors.deletedAt));
    } else {
      filters.push(isNull(vendors.deletedAt));
    }

    if (query.accountType) {
      filters.push(eq(vendors.accountType, query.accountType));
    }

    if (query.search?.trim()) {
      const term = `%${query.search.trim()}%`;
      const match = or(
        ilike(vendors.name, term),
        ilike(vendors.email, term),
        ilike(vendors.phone, term),
        ilike(vendors.mobile, term),
        ilike(vendors.contactName, term),
        ilike(vendors.city, term),
        ilike(vendors.reference, term),
      )!;
      filters.push(match);
      searchFilters.push(match);
    }

    const whereClause = and(...filters);
    const sortColumn =
      query.sortBy === "email"
        ? vendors.email
        : query.sortBy === "createdAt"
          ? vendors.createdAt
          : vendors.name;
    const orderBy =
      query.sortDir === "desc" ? desc(sortColumn) : asc(sortColumn);

    const [rows, totalResult, summaryResult] = await Promise.all([
      this.db
        .select()
        .from(vendors)
        .where(whereClause)
        .orderBy(orderBy)
        .limit(perPage)
        .offset(offset),
      this.db.select({ total: count() }).from(vendors).where(whereClause),
      this.db
        .select({
          all: sql<number>`count(*) filter (where ${vendors.deletedAt} is null)`,
          company: sql<number>`count(*) filter (where ${vendors.deletedAt} is null and ${vendors.accountType} = 'company')`,
          individual: sql<number>`count(*) filter (where ${vendors.deletedAt} is null and ${vendors.accountType} = 'individual')`,
          archived: sql<number>`count(*) filter (where ${vendors.deletedAt} is not null)`,
        })
        .from(vendors)
        .where(and(...searchFilters)),
    ]);

    const total = Number(totalResult[0]?.total ?? 0);
    const stats = await this.purchaseStats(
      organizationId,
      rows.map((row) => row.id),
    );
    const totals = await this.purchaseTotals(organizationId);
    const s = summaryResult[0];

    return {
      data: rows.map((row) => ({
        ...row,
        stats: stats.get(row.id) ?? {
          orderCount: 0,
          openOrders: 0,
          lastOrderDate: null,
          spendBase: "0",
        },
      })),
      summary: {
        all: Number(s?.all ?? 0),
        company: Number(s?.company ?? 0),
        individual: Number(s?.individual ?? 0),
        archived: Number(s?.archived ?? 0),
        ...totals,
      },
      meta: {
        page,
        perPage,
        total,
        totalPages: Math.ceil(total / perPage) || 1,
      },
    };
  }

  /** Purchase order activity per vendor (cancelled orders excluded). */
  private async purchaseStats(organizationId: string, vendorIds: string[]) {
    const map = new Map<
      string,
      {
        orderCount: number;
        openOrders: number;
        lastOrderDate: string | null;
        spendBase: string;
      }
    >();
    if (vendorIds.length === 0) return map;

    const rows = await this.db
      .select({
        vendorId: purchaseOrders.vendorId,
        orderCount: sql<number>`count(*)`,
        openOrders: sql<number>`count(*) filter (where ${purchaseOrders.state} = 'confirmed' and ${purchaseOrders.receiptStatus} in ('to_receive', 'partial'))`,
        lastOrderDate: sql<string | null>`max(${purchaseOrders.orderDate})::text`,
        spendBase: sql<string>`coalesce(sum(${purchaseOrders.amountTotalBase}) filter (where ${purchaseOrders.state} = 'confirmed'), 0)::text`,
      })
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.organizationId, organizationId),
          inArray(purchaseOrders.vendorId, vendorIds),
          sql`${purchaseOrders.state} <> 'cancelled'`,
        ),
      )
      .groupBy(purchaseOrders.vendorId);

    for (const row of rows) {
      map.set(row.vendorId, {
        orderCount: Number(row.orderCount),
        openOrders: Number(row.openOrders),
        lastOrderDate: row.lastOrderDate,
        spendBase: row.spendBase,
      });
    }
    return map;
  }

  /** Org-wide purchasing totals for the vendors hero. */
  private async purchaseTotals(organizationId: string) {
    const [row] = await this.db
      .select({
        withOpenOrders: sql<number>`count(distinct ${purchaseOrders.vendorId}) filter (where ${purchaseOrders.state} = 'confirmed' and ${purchaseOrders.receiptStatus} in ('to_receive', 'partial'))`,
        openOrders: sql<number>`count(*) filter (where ${purchaseOrders.state} = 'confirmed' and ${purchaseOrders.receiptStatus} in ('to_receive', 'partial'))`,
        spendBase: sql<string>`coalesce(sum(${purchaseOrders.amountTotalBase}) filter (where ${purchaseOrders.state} = 'confirmed'), 0)::text`,
        spendLast90Base: sql<string>`coalesce(sum(${purchaseOrders.amountTotalBase}) filter (where ${purchaseOrders.state} = 'confirmed' and ${purchaseOrders.orderDate} >= current_date - 90), 0)::text`,
      })
      .from(purchaseOrders)
      .innerJoin(vendors, eq(vendors.id, purchaseOrders.vendorId))
      .where(
        and(
          eq(purchaseOrders.organizationId, organizationId),
          isNull(vendors.deletedAt),
        ),
      );

    return {
      withOpenOrders: Number(row?.withOpenOrders ?? 0),
      openOrders: Number(row?.openOrders ?? 0),
      spendBase: row?.spendBase ?? "0",
      spendLast90Base: row?.spendLast90Base ?? "0",
    };
  }

  async getById(organizationId: string, id: string) {
    const [vendor] = await this.db
      .select()
      .from(vendors)
      .where(
        and(eq(vendors.id, id), eq(vendors.organizationId, organizationId)),
      )
      .limit(1);

    if (!vendor) {
      throw new NotFoundException("Vendor not found");
    }

    return vendor;
  }

  async create(organizationId: string, dto: CreateVendorInput) {
    const [vendor] = await this.db
      .insert(vendors)
      .values({
        organizationId,
        accountType: dto.accountType,
        name: dto.name,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        mobile: dto.mobile ?? null,
        website: dto.website ?? null,
        taxId: dto.taxId ?? null,
        reference: dto.reference ?? null,
        contactName: dto.contactName ?? null,
        street1: dto.street1 ?? null,
        street2: dto.street2 ?? null,
        city: dto.city ?? null,
        zip: dto.zip ?? null,
        countryCode: dto.countryCode ?? null,
        stateCode: dto.stateCode ?? null,
        defaultCurrencyId: dto.defaultCurrencyId ?? null,
        isActive: dto.isActive ?? true,
        ...(dto.memberSince ? { memberSince: dto.memberSince } : {}),
      })
      .returning();

    return vendor;
  }

  async update(organizationId: string, id: string, dto: UpdateVendorInput) {
    await this.getById(organizationId, id);

    const [vendor] = await this.db
      .update(vendors)
      .set({
        ...(dto.accountType !== undefined ? { accountType: dto.accountType } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.email !== undefined ? { email: dto.email ?? null } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone ?? null } : {}),
        ...(dto.mobile !== undefined ? { mobile: dto.mobile ?? null } : {}),
        ...(dto.website !== undefined ? { website: dto.website ?? null } : {}),
        ...(dto.taxId !== undefined ? { taxId: dto.taxId ?? null } : {}),
        ...(dto.reference !== undefined
          ? { reference: dto.reference ?? null }
          : {}),
        ...(dto.contactName !== undefined
          ? { contactName: dto.contactName ?? null }
          : {}),
        ...(dto.street1 !== undefined ? { street1: dto.street1 ?? null } : {}),
        ...(dto.street2 !== undefined ? { street2: dto.street2 ?? null } : {}),
        ...(dto.city !== undefined ? { city: dto.city ?? null } : {}),
        ...(dto.zip !== undefined ? { zip: dto.zip ?? null } : {}),
        ...(dto.countryCode !== undefined
          ? { countryCode: dto.countryCode ?? null }
          : {}),
        ...(dto.stateCode !== undefined
          ? { stateCode: dto.stateCode ?? null }
          : {}),
        ...(dto.defaultCurrencyId !== undefined
          ? { defaultCurrencyId: dto.defaultCurrencyId ?? null }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.memberSince !== undefined
          ? { memberSince: dto.memberSince }
          : {}),
        updatedAt: new Date(),
      })
      .where(
        and(eq(vendors.id, id), eq(vendors.organizationId, organizationId)),
      )
      .returning();

    return vendor;
  }

  async archive(organizationId: string, id: string) {
    await this.getById(organizationId, id);

    const [vendor] = await this.db
      .update(vendors)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(eq(vendors.id, id), eq(vendors.organizationId, organizationId)),
      )
      .returning();

    return vendor;
  }

  async restore(organizationId: string, id: string) {
    const [existing] = await this.db
      .select()
      .from(vendors)
      .where(
        and(eq(vendors.id, id), eq(vendors.organizationId, organizationId)),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundException("Vendor not found");
    }

    const [vendor] = await this.db
      .update(vendors)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(
        and(eq(vendors.id, id), eq(vendors.organizationId, organizationId)),
      )
      .returning();

    return vendor;
  }
}
