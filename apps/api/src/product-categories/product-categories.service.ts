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
  eq,
  ilike,
  isNull,
  sql,
  type SQL,
} from "drizzle-orm";
import { productCategoryCatalog, type Database } from "@frog1/db";
import type {
  CreateProductCategoryDto,
  ListProductCategoriesQuery,
} from "./dto/product-category.dto";
import { DATABASE } from "../database/database.constants";

@Injectable()
export class ProductCategoriesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private normalizeName(name: string) {
    return name.trim().replace(/\s+/g, " ");
  }

  async list(organizationId: string, query: ListProductCategoriesQuery) {
    const page = Math.max(query.page ?? 1, 1);
    const perPage = Math.min(Math.max(query.perPage ?? 50, 1), 200);
    const offset = (page - 1) * perPage;

    const filters: SQL[] = [
      eq(productCategoryCatalog.organizationId, organizationId),
      isNull(productCategoryCatalog.deletedAt),
    ];

    if (query.search?.trim()) {
      filters.push(
        ilike(productCategoryCatalog.name, `%${query.search.trim()}%`),
      );
    }

    const whereClause = and(...filters);

    const [rows, totalResult] = await Promise.all([
      this.db
        .select()
        .from(productCategoryCatalog)
        .where(whereClause)
        .orderBy(asc(sql`lower(${productCategoryCatalog.name})`))
        .limit(perPage)
        .offset(offset),
      this.db
        .select({ total: count() })
        .from(productCategoryCatalog)
        .where(whereClause),
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

  async create(organizationId: string, dto: CreateProductCategoryDto) {
    const name = this.normalizeName(dto.name);

    if (!name) {
      throw new BadRequestException("Category name is required");
    }

    const [existing] = await this.db
      .select()
      .from(productCategoryCatalog)
      .where(
        and(
          eq(productCategoryCatalog.organizationId, organizationId),
          isNull(productCategoryCatalog.deletedAt),
          sql`lower(${productCategoryCatalog.name}) = lower(${name})`,
        ),
      )
      .limit(1);

    if (existing) {
      return existing;
    }

    const [created] = await this.db
      .insert(productCategoryCatalog)
      .values({
        organizationId,
        name,
      })
      .returning();

    return created;
  }

  async archive(organizationId: string, id: string) {
    const [category] = await this.db
      .update(productCategoryCatalog)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(productCategoryCatalog.id, id),
          eq(productCategoryCatalog.organizationId, organizationId),
          isNull(productCategoryCatalog.deletedAt),
        ),
      )
      .returning();

    if (!category) {
      throw new NotFoundException("Category not found");
    }

    return category;
  }
}
