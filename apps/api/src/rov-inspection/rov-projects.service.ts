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
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import {
  customers,
  projectStructures,
  rovProjects,
  users,
  type Database,
} from "@frog1/db";
import type {
  CreateRovProjectInput,
  ListRovProjectsQuery,
  UpdateRovProjectInput,
  CreateStructureInput,
  UpdateStructureInput,
} from "./dto/rov.dto";
import { DATABASE } from "../database/database.constants";

@Injectable()
export class RovProjectsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(organizationId: string, query: ListRovProjectsQuery) {
    const page = Math.max(query.page ?? 1, 1);
    const perPage = Math.min(Math.max(query.perPage ?? 50, 1), 200);
    const offset = (page - 1) * perPage;

    const filters: SQL[] = [
      eq(rovProjects.organizationId, organizationId),
      isNull(rovProjects.deletedAt),
    ];

    if (query.status) {
      filters.push(eq(rovProjects.status, query.status));
    }

    if (query.customerId) {
      filters.push(eq(rovProjects.customerId, query.customerId));
    }

    if (query.search?.trim()) {
      const term = `%${query.search.trim()}%`;
      filters.push(
        or(
          ilike(rovProjects.name, term),
          ilike(rovProjects.location, term),
          ilike(customers.name, term),
        )!,
      );
    }

    const whereClause = and(...filters);

    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({
          project: rovProjects,
          customerName: customers.name,
          structureCount: sql<number>`(
            SELECT COUNT(*)::int FROM ${projectStructures}
            WHERE ${projectStructures.rovProjectId} = ${rovProjects.id}
          )`,
        })
        .from(rovProjects)
        .leftJoin(customers, eq(customers.id, rovProjects.customerId))
        .where(whereClause)
        .orderBy(desc(rovProjects.updatedAt))
        .limit(perPage)
        .offset(offset),
      this.db
        .select({ total: count() })
        .from(rovProjects)
        .leftJoin(customers, eq(customers.id, rovProjects.customerId))
        .where(whereClause),
    ]);

    return {
      data: rows.map((row) => ({
        ...row.project,
        customerName: row.customerName,
        structureCount: row.structureCount ?? 0,
      })),
      meta: {
        page,
        perPage,
        total,
        totalPages: Math.ceil(total / perPage),
      },
    };
  }

  async getById(organizationId: string, projectId: string) {
    const [row] = await this.db
      .select({
        project: rovProjects,
        customerName: customers.name,
        creatorName: users.name,
      })
      .from(rovProjects)
      .leftJoin(customers, eq(customers.id, rovProjects.customerId))
      .leftJoin(users, eq(users.id, rovProjects.createdBy))
      .where(
        and(
          eq(rovProjects.id, projectId),
          eq(rovProjects.organizationId, organizationId),
          isNull(rovProjects.deletedAt),
        ),
      )
      .limit(1);

    if (!row) {
      throw new NotFoundException("ROV project not found");
    }

    const structures = await this.db
      .select()
      .from(projectStructures)
      .where(eq(projectStructures.rovProjectId, projectId))
      .orderBy(asc(projectStructures.sort), asc(projectStructures.name));

    return {
      ...row.project,
      customerName: row.customerName,
      creatorName: row.creatorName,
      structures,
    };
  }

  async create(
    organizationId: string,
    userId: string,
    input: CreateRovProjectInput,
  ) {
    const [project] = await this.db
      .insert(rovProjects)
      .values({
        organizationId,
        name: input.name,
        description: input.description,
        location: input.location,
        latitude: input.latitude,
        longitude: input.longitude,
        status: input.status ?? "draft",
        startDate: input.startDate,
        endDate: input.endDate,
        customerId: input.customerId ?? null,
        createdBy: userId,
      })
      .returning();

    return project;
  }

  async update(
    organizationId: string,
    projectId: string,
    input: UpdateRovProjectInput,
  ) {
    await this.getById(organizationId, projectId);

    const [project] = await this.db
      .update(rovProjects)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(rovProjects.id, projectId),
          eq(rovProjects.organizationId, organizationId),
        ),
      )
      .returning();

    return project;
  }

  async delete(organizationId: string, projectId: string) {
    await this.getById(organizationId, projectId);

    const [project] = await this.db
      .update(rovProjects)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(rovProjects.id, projectId),
          eq(rovProjects.organizationId, organizationId),
        ),
      )
      .returning();

    return project;
  }

  async updateSiteMapPath(
    organizationId: string,
    projectId: string,
    siteMapPath: string | null,
  ) {
    await this.getById(organizationId, projectId);

    const [project] = await this.db
      .update(rovProjects)
      .set({ siteMapPath, updatedAt: new Date() })
      .where(
        and(
          eq(rovProjects.id, projectId),
          eq(rovProjects.organizationId, organizationId),
        ),
      )
      .returning();

    return project;
  }

  async updatePlanViewPath(
    organizationId: string,
    projectId: string,
    planViewPath: string | null,
  ) {
    await this.getById(organizationId, projectId);

    const [project] = await this.db
      .update(rovProjects)
      .set({ planViewPath, updatedAt: new Date() })
      .where(
        and(
          eq(rovProjects.id, projectId),
          eq(rovProjects.organizationId, organizationId),
        ),
      )
      .returning();

    return project;
  }

  async listStructures(organizationId: string, projectId: string) {
    await this.getById(organizationId, projectId);

    return this.db
      .select()
      .from(projectStructures)
      .where(eq(projectStructures.rovProjectId, projectId))
      .orderBy(asc(projectStructures.sort), asc(projectStructures.name));
  }

  async getStructure(
    organizationId: string,
    projectId: string,
    structureId: string,
  ) {
    await this.getById(organizationId, projectId);

    const [structure] = await this.db
      .select()
      .from(projectStructures)
      .where(
        and(
          eq(projectStructures.id, structureId),
          eq(projectStructures.rovProjectId, projectId),
        ),
      )
      .limit(1);

    if (!structure) {
      throw new NotFoundException("Structure not found");
    }

    return structure;
  }

  async createStructure(
    organizationId: string,
    projectId: string,
    input: CreateStructureInput,
  ) {
    await this.getById(organizationId, projectId);

    const [structure] = await this.db
      .insert(projectStructures)
      .values({
        rovProjectId: projectId,
        name: input.name,
        description: input.description,
        diagramPath: input.diagramPath,
        photoPath: input.photoPath,
        sort: input.sort ?? 0,
      })
      .returning();

    return structure;
  }

  async updateStructure(
    organizationId: string,
    projectId: string,
    structureId: string,
    input: UpdateStructureInput,
  ) {
    await this.getStructure(organizationId, projectId, structureId);

    const [structure] = await this.db
      .update(projectStructures)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(projectStructures.id, structureId))
      .returning();

    return structure;
  }

  async deleteStructure(
    organizationId: string,
    projectId: string,
    structureId: string,
  ) {
    await this.getStructure(organizationId, projectId, structureId);

    await this.db
      .delete(projectStructures)
      .where(eq(projectStructures.id, structureId));

    return { ok: true };
  }
}
