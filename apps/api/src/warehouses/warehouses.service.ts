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
import { warehouses, type Database } from "@frog1/db";
import type {
  CreateWarehouseDto,
  ListWarehousesQuery,
  UpdateWarehouseDto,
} from "./dto/warehouse.dto";
import { DATABASE } from "../database/database.constants";

@Injectable()
export class WarehousesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(organizationId: string, query: ListWarehousesQuery) {
    const page = Math.max(query.page ?? 1, 1);
    const perPage = Math.min(Math.max(query.perPage ?? 16, 1), 100);
    const offset = (page - 1) * perPage;

    const filters: SQL[] = [eq(warehouses.organizationId, organizationId)];

    if (query.archived) {
      filters.push(isNotNull(warehouses.deletedAt));
    } else {
      filters.push(isNull(warehouses.deletedAt));
    }

    if (query.search?.trim()) {
      const term = `%${query.search.trim()}%`;
      filters.push(
        or(
          ilike(warehouses.name, term),
          ilike(warehouses.code, term),
          ilike(warehouses.city, term),
        )!,
      );
    }

    const whereClause = and(...filters);

    const sortColumn =
      query.sortBy === "code"
        ? warehouses.code
        : query.sortBy === "createdAt"
          ? warehouses.createdAt
          : warehouses.name;

    const orderBy =
      query.sortDir === "desc" ? desc(sortColumn) : asc(sortColumn);

    const [rows, totalResult] = await Promise.all([
      this.db
        .select()
        .from(warehouses)
        .where(whereClause)
        .orderBy(orderBy)
        .limit(perPage)
        .offset(offset),
      this.db.select({ total: count() }).from(warehouses).where(whereClause),
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
    const [warehouse] = await this.db
      .select()
      .from(warehouses)
      .where(
        and(
          eq(warehouses.id, id),
          eq(warehouses.organizationId, organizationId),
        ),
      )
      .limit(1);

    if (!warehouse) {
      throw new NotFoundException("Warehouse not found");
    }

    return warehouse;
  }

  async create(organizationId: string, dto: CreateWarehouseDto) {
    if (!dto.name?.trim()) {
      throw new BadRequestException("Name is required");
    }

    if (!dto.code?.trim()) {
      throw new BadRequestException("Code is required");
    }

    const [warehouse] = await this.db
      .insert(warehouses)
      .values({
        organizationId,
        name: dto.name.trim(),
        code: dto.code.trim().toUpperCase(),
        street1: dto.street1?.trim() || null,
        city: dto.city?.trim() || null,
        zip: dto.zip?.trim() || null,
        countryCode: dto.countryCode?.trim().toUpperCase() || null,
        isActive: dto.isActive ?? true,
      })
      .returning();

    return warehouse;
  }

  async update(organizationId: string, id: string, dto: UpdateWarehouseDto) {
    await this.getById(organizationId, id);

    const [warehouse] = await this.db
      .update(warehouses)
      .set({
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.code !== undefined
          ? { code: dto.code.trim().toUpperCase() }
          : {}),
        ...(dto.street1 !== undefined
          ? { street1: dto.street1?.trim() || null }
          : {}),
        ...(dto.city !== undefined ? { city: dto.city?.trim() || null } : {}),
        ...(dto.zip !== undefined ? { zip: dto.zip?.trim() || null } : {}),
        ...(dto.countryCode !== undefined
          ? { countryCode: dto.countryCode?.trim().toUpperCase() || null }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(warehouses.id, id),
          eq(warehouses.organizationId, organizationId),
        ),
      )
      .returning();

    return warehouse;
  }

  async archive(organizationId: string, id: string) {
    await this.getById(organizationId, id);

    const [warehouse] = await this.db
      .update(warehouses)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(warehouses.id, id),
          eq(warehouses.organizationId, organizationId),
        ),
      )
      .returning();

    return warehouse;
  }

  async restore(organizationId: string, id: string) {
    const [existing] = await this.db
      .select()
      .from(warehouses)
      .where(
        and(
          eq(warehouses.id, id),
          eq(warehouses.organizationId, organizationId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundException("Warehouse not found");
    }

    const [warehouse] = await this.db
      .update(warehouses)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(
        and(
          eq(warehouses.id, id),
          eq(warehouses.organizationId, organizationId),
        ),
      )
      .returning();

    return warehouse;
  }
}
