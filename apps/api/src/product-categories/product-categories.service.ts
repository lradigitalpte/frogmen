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
import { OrgInventoryService } from "../inventory/org-inventory.service";

@Injectable()
export class ProductCategoriesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly orgInventory: OrgInventoryService,
  ) {}

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

    let rows = await this.db
      .select()
      .from(productCategoryCatalog)
      .where(whereClause)
      .orderBy(asc(sql`lower(${productCategoryCatalog.name})`))
      .limit(perPage)
      .offset(offset);

    let total = Number(
      (
        await this.db
          .select({ total: count() })
          .from(productCategoryCatalog)
          .where(whereClause)
      )[0]?.total ?? 0,
    );

    if (total === 0 && !query.search?.trim()) {
      await this.orgInventory.provision(organizationId);
      rows = await this.db
        .select()
        .from(productCategoryCatalog)
        .where(whereClause)
        .orderBy(asc(sql`lower(${productCategoryCatalog.name})`))
        .limit(perPage)
        .offset(offset);
      total = Number(
        (
          await this.db
            .select({ total: count() })
            .from(productCategoryCatalog)
            .where(whereClause)
        )[0]?.total ?? 0,
      );
    }

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

  async update(organizationId: string, id: string, nameInput: string) {
    const name = this.normalizeName(nameInput);

    if (!name) {
      throw new BadRequestException("Category name is required");
    }

    const [duplicate] = await this.db
      .select({ id: productCategoryCatalog.id })
      .from(productCategoryCatalog)
      .where(
        and(
          eq(productCategoryCatalog.organizationId, organizationId),
          isNull(productCategoryCatalog.deletedAt),
          sql`lower(${productCategoryCatalog.name}) = lower(${name})`,
          sql`${productCategoryCatalog.id} <> ${id}`,
        ),
      )
      .limit(1);

    if (duplicate) {
      throw new BadRequestException("A category with this name already exists");
    }

    const [updated] = await this.db
      .update(productCategoryCatalog)
      .set({
        name,
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

    if (!updated) {
      throw new NotFoundException("Category not found");
    }

    return updated;
  }

  async seedDefaults(organizationId: string) {
    await this.orgInventory.provision(organizationId);
    return this.list(organizationId, { perPage: 200 });
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
