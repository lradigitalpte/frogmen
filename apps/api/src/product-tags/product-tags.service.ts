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
import { OrgInventoryService } from "../inventory/org-inventory.service";

@Injectable()
export class ProductTagsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly orgInventory: OrgInventoryService,
  ) {}

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

    let rows = await this.db
      .select()
      .from(productTagCatalog)
      .where(whereClause)
      .orderBy(asc(sql`lower(${productTagCatalog.name})`))
      .limit(perPage)
      .offset(offset);

    let total = Number(
      (
        await this.db
          .select({ total: count() })
          .from(productTagCatalog)
          .where(whereClause)
      )[0]?.total ?? 0,
    );

    if (total === 0 && !query.search?.trim()) {
      await this.orgInventory.provision(organizationId);
      rows = await this.db
        .select()
        .from(productTagCatalog)
        .where(whereClause)
        .orderBy(asc(sql`lower(${productTagCatalog.name})`))
        .limit(perPage)
        .offset(offset);
      total = Number(
        (
          await this.db
            .select({ total: count() })
            .from(productTagCatalog)
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

  async update(organizationId: string, id: string, nameInput: string) {
    const name = this.normalizeName(nameInput);

    if (!name) {
      throw new BadRequestException("Tag name is required");
    }

    const [duplicate] = await this.db
      .select({ id: productTagCatalog.id })
      .from(productTagCatalog)
      .where(
        and(
          eq(productTagCatalog.organizationId, organizationId),
          isNull(productTagCatalog.deletedAt),
          sql`lower(${productTagCatalog.name}) = lower(${name})`,
          sql`${productTagCatalog.id} <> ${id}`,
        ),
      )
      .limit(1);

    if (duplicate) {
      throw new BadRequestException("A tag with this name already exists");
    }

    const [updated] = await this.db
      .update(productTagCatalog)
      .set({
        name,
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

    if (!updated) {
      throw new NotFoundException("Tag not found");
    }

    return updated;
  }

  async seedDefaults(organizationId: string) {
    await this.orgInventory.provision(organizationId);
    return this.list(organizationId, { perPage: 200 });
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
