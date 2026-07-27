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
import { productTagCatalog, type Database } from "@frog1/db";
import type {
  CreateProductTagDto,
  ListProductTagsQuery,
} from "./dto/product-tag.dto";
import { DATABASE } from "../database/database.constants";

@Injectable()
export class ProductTagsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private normalizeName(name: string) {
    return name.trim().replace(/\s+/g, " ");
  }

  async list(organizationId: string, query: ListProductTagsQuery) {
    const page = Math.max(query.page ?? 1, 1);
    const perPage = Math.min(Math.max(query.perPage ?? 50, 1), 200);
    const offset = (page - 1) * perPage;

    const filters: SQL[] = [
      eq(productTagCatalog.organizationId, organizationId),
      isNull(productTagCatalog.deletedAt),
    ];

    if (query.search?.trim()) {
      filters.push(ilike(productTagCatalog.name, `%${query.search.trim()}%`));
    }

    const whereClause = and(...filters);

    const [rows, totalResult] = await Promise.all([
      this.db
        .select()
        .from(productTagCatalog)
        .where(whereClause)
        .orderBy(asc(sql`lower(${productTagCatalog.name})`))
        .limit(perPage)
        .offset(offset),
      this.db.select({ total: count() }).from(productTagCatalog).where(whereClause),
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

  async create(organizationId: string, dto: CreateProductTagDto) {
    const name = this.normalizeName(dto.name);

    if (!name) {
      throw new BadRequestException("Tag name is required");
    }

    const [existing] = await this.db
      .select()
      .from(productTagCatalog)
      .where(
        and(
          eq(productTagCatalog.organizationId, organizationId),
          isNull(productTagCatalog.deletedAt),
          sql`lower(${productTagCatalog.name}) = lower(${name})`,
        ),
      )
      .limit(1);

    if (existing) {
      return existing;
    }

    const [created] = await this.db
      .insert(productTagCatalog)
      .values({
        organizationId,
        name,
      })
      .returning();

    return created;
  }

  async archive(organizationId: string, id: string) {
    const [tag] = await this.db
      .update(productTagCatalog)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(productTagCatalog.id, id),
          eq(productTagCatalog.organizationId, organizationId),
          isNull(productTagCatalog.deletedAt),
        ),
      )
      .returning();

    if (!tag) {
      throw new NotFoundException("Tag not found");
    }

    return tag;
  }
}
