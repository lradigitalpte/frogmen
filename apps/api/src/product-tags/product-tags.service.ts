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

    // How many live products carry each tag (tags are stored by name on products).
    const countById = new Map<string, number>();
    if (rows.length) {
      const names = rows.map((row) => row.name.toLowerCase());
      const result = await this.db.execute<{ name: string; total: number }>(sql`
        select lower(t.tag) as name, count(distinct p.id)::int as total
        from products p
        cross join lateral jsonb_array_elements_text(p.tags) as t(tag)
        where p.organization_id = ${organizationId}
          and p.deleted_at is null
          and lower(t.tag) in (${sql.join(names.map((n) => sql`${n}`), sql`, `)})
        group by lower(t.tag)
      `);
      const byName = new Map(
        (Array.isArray(result) ? result : (result as { rows: Array<{ name: string; total: number }> }).rows).map(
          (row) => [row.name, Number(row.total)] as const,
        ),
      );
      for (const row of rows) countById.set(row.id, byName.get(row.name.toLowerCase()) ?? 0);
    }

    return {
      data: rows.map((row) => ({ ...row, productCount: countById.get(row.id) ?? 0 })),
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

    const [current] = await this.db
      .select({ name: productTagCatalog.name })
      .from(productTagCatalog)
      .where(
        and(
          eq(productTagCatalog.id, id),
          eq(productTagCatalog.organizationId, organizationId),
          isNull(productTagCatalog.deletedAt),
        ),
      )
      .limit(1);

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

    // Products store tag names, so carry the rename over to them.
    if (current && current.name !== name) {
      await this.db.execute(sql`
        update products p
        set tags = (
              select coalesce(
                jsonb_agg(case when lower(e.tag) = lower(${current.name}) then to_jsonb(${name}::text) else to_jsonb(e.tag) end order by e.pos),
                '[]'::jsonb
              )
              from jsonb_array_elements_text(p.tags) with ordinality as e(tag, pos)
            ),
            updated_at = now()
        where p.organization_id = ${organizationId}
          and exists (
            select 1 from jsonb_array_elements_text(p.tags) as x(tag) where lower(x.tag) = lower(${current.name})
          )
      `);
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

    // Take the deleted tag off every product that had it.
    await this.db.execute(sql`
      update products p
      set tags = (
            select coalesce(jsonb_agg(to_jsonb(e.tag) order by e.pos), '[]'::jsonb)
            from jsonb_array_elements_text(p.tags) with ordinality as e(tag, pos)
            where lower(e.tag) <> lower(${tag.name})
          ),
          updated_at = now()
      where p.organization_id = ${organizationId}
        and exists (
          select 1 from jsonb_array_elements_text(p.tags) as x(tag) where lower(x.tag) = lower(${tag.name})
        )
    `);

    return tag;
  }
}
