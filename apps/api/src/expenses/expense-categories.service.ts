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
import { expenseCategories, type Database } from "@frog1/db";
import { DATABASE } from "../database/database.constants";
import { DEFAULT_EXPENSE_CATEGORIES } from "./expense-seed";

@Injectable()
export class ExpenseCategoriesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private normalizeName(name: string) {
    return name.trim().replace(/\s+/g, " ");
  }

  async list(
    organizationId: string,
    query?: { search?: string; page?: number; perPage?: number },
  ) {
    const page = Math.max(query?.page ?? 1, 1);
    const perPage = Math.min(Math.max(query?.perPage ?? 50, 1), 200);
    const offset = (page - 1) * perPage;

    const filters: SQL[] = [
      eq(expenseCategories.organizationId, organizationId),
      isNull(expenseCategories.deletedAt),
    ];

    if (query?.search?.trim()) {
      filters.push(
        ilike(expenseCategories.name, `%${query.search.trim()}%`),
      );
    }

    const whereClause = and(...filters);

    const [rows, totalResult] = await Promise.all([
      this.db
        .select()
        .from(expenseCategories)
        .where(whereClause)
        .orderBy(asc(sql`lower(${expenseCategories.name})`))
        .limit(perPage)
        .offset(offset),
      this.db
        .select({ total: count() })
        .from(expenseCategories)
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

  async create(organizationId: string, nameInput: string) {
    const name = this.normalizeName(nameInput);
    if (!name) {
      throw new BadRequestException("Category name is required");
    }

    const [existing] = await this.db
      .select()
      .from(expenseCategories)
      .where(
        and(
          eq(expenseCategories.organizationId, organizationId),
          isNull(expenseCategories.deletedAt),
          sql`lower(${expenseCategories.name}) = lower(${name})`,
        ),
      )
      .limit(1);

    if (existing) {
      return existing;
    }

    const [created] = await this.db
      .insert(expenseCategories)
      .values({ organizationId, name })
      .returning();

    return created;
  }

  async update(organizationId: string, id: string, nameInput: string) {
    const name = this.normalizeName(nameInput);
    if (!name) {
      throw new BadRequestException("Category name is required");
    }

    const [duplicate] = await this.db
      .select({ id: expenseCategories.id })
      .from(expenseCategories)
      .where(
        and(
          eq(expenseCategories.organizationId, organizationId),
          isNull(expenseCategories.deletedAt),
          sql`lower(${expenseCategories.name}) = lower(${name})`,
          sql`${expenseCategories.id} <> ${id}`,
        ),
      )
      .limit(1);

    if (duplicate) {
      throw new BadRequestException("A category with this name already exists");
    }

    const [updated] = await this.db
      .update(expenseCategories)
      .set({ name, updatedAt: new Date() })
      .where(
        and(
          eq(expenseCategories.id, id),
          eq(expenseCategories.organizationId, organizationId),
          isNull(expenseCategories.deletedAt),
        ),
      )
      .returning();

    if (!updated) {
      throw new NotFoundException("Category not found");
    }

    return updated;
  }

  async archive(organizationId: string, id: string) {
    const [category] = await this.db
      .update(expenseCategories)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(expenseCategories.id, id),
          eq(expenseCategories.organizationId, organizationId),
          isNull(expenseCategories.deletedAt),
        ),
      )
      .returning();

    if (!category) {
      throw new NotFoundException("Category not found");
    }

    return category;
  }

  async seedDefaults(organizationId: string) {
    const [existing] = await this.db
      .select({ id: expenseCategories.id })
      .from(expenseCategories)
      .where(
        and(
          eq(expenseCategories.organizationId, organizationId),
          isNull(expenseCategories.deletedAt),
        ),
      )
      .limit(1);

    if (existing) {
      return this.list(organizationId, { perPage: 200 });
    }

    for (const name of DEFAULT_EXPENSE_CATEGORIES) {
      await this.create(organizationId, name);
    }

    return this.list(organizationId, { perPage: 200 });
  }
}
