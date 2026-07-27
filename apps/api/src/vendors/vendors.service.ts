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
  isNull,
  or,
  type SQL,
} from "drizzle-orm";
import { vendors, type Database } from "@frog1/db";
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
      filters.push(
        or(
          ilike(vendors.name, term),
          ilike(vendors.email, term),
          ilike(vendors.phone, term),
          ilike(vendors.mobile, term),
        )!,
      );
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

    const [rows, totalResult] = await Promise.all([
      this.db
        .select()
        .from(vendors)
        .where(whereClause)
        .orderBy(orderBy)
        .limit(perPage)
        .offset(offset),
      this.db.select({ total: count() }).from(vendors).where(whereClause),
    ]);

    const total = Number(totalResult[0]?.total ?? 0);

    return {
      data: rows,
      meta: {
        page,
        perPage,
        total,
        totalPages: Math.ceil(total / perPage) || 1,
      },
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
