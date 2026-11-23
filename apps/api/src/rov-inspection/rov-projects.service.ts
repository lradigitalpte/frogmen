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
  inspectionMedia,
  inspectionPoints,
  inspectionReports,
  inspectionViews,
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

  /** Dashboard numbers for the ROV overview page, scoped to the organisation. */
  async overview(organizationId: string) {
    const liveProject = and(
      eq(rovProjects.organizationId, organizationId),
      isNull(rovProjects.deletedAt),
    );

    const [projectCounts, structureCounts, findingCounts, mediaCounts, reportCounts, recent, recentFindings] =
      await Promise.all([
        this.db
          .select({
            total: sql<number>`count(*)::int`,
            draft: sql<number>`count(*) filter (where ${rovProjects.status} = 'draft')::int`,
            inProgress: sql<number>`count(*) filter (where ${rovProjects.status} = 'in_progress')::int`,
            completed: sql<number>`count(*) filter (where ${rovProjects.status} = 'completed')::int`,
            archived: sql<number>`count(*) filter (where ${rovProjects.status} = 'archived')::int`,
          })
          .from(rovProjects)
          .where(liveProject),
        this.db
          .select({
            total: sql<number>`count(*)::int`,
            withDiagram: sql<number>`count(*) filter (where ${projectStructures.diagramPath} is not null)::int`,
          })
          .from(projectStructures)
          .innerJoin(rovProjects, eq(rovProjects.id, projectStructures.rovProjectId))
          .where(liveProject),
        this.db
          .select({
            total: sql<number>`count(*)::int`,
            major: sql<number>`count(*) filter (where ${inspectionPoints.severity} = 'major')::int`,
            moderate: sql<number>`count(*) filter (where ${inspectionPoints.severity} = 'moderate')::int`,
            minor: sql<number>`count(*) filter (where ${inspectionPoints.severity} = 'minor')::int`,
          })
          .from(inspectionPoints)
          .innerJoin(inspectionViews, eq(inspectionViews.id, inspectionPoints.inspectionViewId))
          .innerJoin(projectStructures, eq(projectStructures.id, inspectionViews.structureId))
          .innerJoin(rovProjects, eq(rovProjects.id, projectStructures.rovProjectId))
          .where(liveProject),
        this.db
          .select({
            total: sql<number>`count(*)::int`,
            video: sql<number>`count(*) filter (where ${inspectionMedia.mediaType} = 'video')::int`,
            image: sql<number>`count(*) filter (where ${inspectionMedia.mediaType} = 'image')::int`,
            document: sql<number>`count(*) filter (where ${inspectionMedia.mediaType} = 'document')::int`,
            unlinked: sql<number>`count(*) filter (where ${inspectionMedia.inspectionPointId} is null)::int`,
          })
          .from(inspectionMedia)
          .innerJoin(projectStructures, eq(projectStructures.id, inspectionMedia.structureId))
          .innerJoin(rovProjects, eq(rovProjects.id, projectStructures.rovProjectId))
          .where(and(liveProject, isNull(inspectionMedia.deletedAt))),
        this.db
          .select({
            total: sql<number>`count(*)::int`,
            draft: sql<number>`count(*) filter (where ${inspectionReports.status} = 'draft')::int`,
            final: sql<number>`count(*) filter (where ${inspectionReports.status} = 'final')::int`,
            shared: sql<number>`count(*) filter (where ${inspectionReports.status} = 'shared' or ${inspectionReports.sharedLinkHash} is not null)::int`,
            liveLinks: sql<number>`count(*) filter (where ${inspectionReports.sharedLinkHash} is not null and (${inspectionReports.sharedLinkExpiresAt} is null or ${inspectionReports.sharedLinkExpiresAt} > now()))::int`,
          })
          .from(inspectionReports)
          .innerJoin(rovProjects, eq(rovProjects.id, inspectionReports.rovProjectId))
          .where(liveProject),
        this.db
          .select({
            id: rovProjects.id,
            name: rovProjects.name,
            location: rovProjects.location,
            status: rovProjects.status,
            startDate: rovProjects.startDate,
            endDate: rovProjects.endDate,
            planViewPath: rovProjects.planViewPath,
            updatedAt: rovProjects.updatedAt,
            customerName: customers.name,
            structureCount: sql<number>`(select count(*)::int from ${projectStructures} where ${projectStructures.rovProjectId} = ${rovProjects.id})`,
            findingCount: sql<number>`(select count(*)::int from ${inspectionPoints}
              join ${inspectionViews} on ${inspectionViews.id} = ${inspectionPoints.inspectionViewId}
              join ${projectStructures} on ${projectStructures.id} = ${inspectionViews.structureId}
              where ${projectStructures.rovProjectId} = ${rovProjects.id})`,
            majorCount: sql<number>`(select count(*)::int from ${inspectionPoints}
              join ${inspectionViews} on ${inspectionViews.id} = ${inspectionPoints.inspectionViewId}
              join ${projectStructures} on ${projectStructures.id} = ${inspectionViews.structureId}
              where ${projectStructures.rovProjectId} = ${rovProjects.id} and ${inspectionPoints.severity} = 'major')`,
            mediaCount: sql<number>`(select count(*)::int from ${inspectionMedia}
              join ${projectStructures} on ${projectStructures.id} = ${inspectionMedia.structureId}
              where ${projectStructures.rovProjectId} = ${rovProjects.id} and ${inspectionMedia.deletedAt} is null)`,
            reportStatus: sql<string | null>`(select case
                when bool_or(${inspectionReports.sharedLinkHash} is not null or ${inspectionReports.status} = 'shared') then 'shared'
                when bool_or(${inspectionReports.status} = 'final') then 'final'
                when count(*) > 0 then 'draft'
                else null end
              from ${inspectionReports} where ${inspectionReports.rovProjectId} = ${rovProjects.id})`,
          })
          .from(rovProjects)
          .leftJoin(customers, eq(customers.id, rovProjects.customerId))
          .where(and(liveProject, sql`${rovProjects.status} <> 'archived'`))
          .orderBy(desc(rovProjects.updatedAt))
          .limit(6),
        this.db
          .select({
            id: inspectionPoints.id,
            observationId: inspectionPoints.observationId,
            pointNumber: inspectionPoints.pointNumber,
            label: inspectionPoints.label,
            severity: inspectionPoints.severity,
            findingType: inspectionPoints.findingType,
            description: inspectionPoints.description,
            createdAt: inspectionPoints.createdAt,
            structureName: projectStructures.name,
            projectId: rovProjects.id,
            projectName: rovProjects.name,
          })
          .from(inspectionPoints)
          .innerJoin(inspectionViews, eq(inspectionViews.id, inspectionPoints.inspectionViewId))
          .innerJoin(projectStructures, eq(projectStructures.id, inspectionViews.structureId))
          .innerJoin(rovProjects, eq(rovProjects.id, projectStructures.rovProjectId))
          .where(liveProject)
          .orderBy(desc(inspectionPoints.createdAt))
          .limit(6),
      ]);

    return {
      projects: projectCounts[0],
      structures: structureCounts[0],
      findings: findingCounts[0],
      media: mediaCounts[0],
      reports: reportCounts[0],
      recentProjects: recent,
      recentFindings,
    };
  }

  async list(organizationId: string, query: ListRovProjectsQuery) {
    const page = Math.max(query.page ?? 1, 1);
    const perPage = Math.min(Math.max(query.perPage ?? 50, 1), 200);
    const offset = (page - 1) * perPage;

    const filters: SQL[] = [
      eq(rovProjects.organizationId, organizationId),
      isNull(rovProjects.deletedAt),
    ];

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
          ilike(rovProjects.description, term),
        )!,
      );
    }

    // Status counts ignore the status filter so every tab shows its number.
    const summaryWhere = and(...filters);
    if (query.status) {
      filters.push(eq(rovProjects.status, query.status));
    } else if (query.hideArchived === "true") {
      filters.push(sql`${rovProjects.status} <> 'archived'`);
    }

    const whereClause = and(...filters);

    const orderBy =
      query.sort === "newest"
        ? [desc(rovProjects.createdAt)]
        : query.sort === "name"
          ? [asc(rovProjects.name)]
          : query.sort === "start_date"
            ? [sql`${rovProjects.startDate} desc nulls last`, desc(rovProjects.updatedAt)]
            : query.sort === "end_date"
              ? [sql`${rovProjects.endDate} asc nulls last`, desc(rovProjects.updatedAt)]
              : [desc(rovProjects.updatedAt)];

    const [rows, [{ total }], [summary]] = await Promise.all([
      this.db
        .select({
          project: rovProjects,
          customerName: customers.name,
          structureCount: sql<number>`(
            SELECT COUNT(*)::int FROM ${projectStructures}
            WHERE ${projectStructures.rovProjectId} = ${rovProjects.id}
          )`,
          findingCount: sql<number>`(select count(*)::int from ${inspectionPoints}
            join ${inspectionViews} on ${inspectionViews.id} = ${inspectionPoints.inspectionViewId}
            join ${projectStructures} on ${projectStructures.id} = ${inspectionViews.structureId}
            where ${projectStructures.rovProjectId} = ${rovProjects.id})`,
          majorCount: sql<number>`(select count(*)::int from ${inspectionPoints}
            join ${inspectionViews} on ${inspectionViews.id} = ${inspectionPoints.inspectionViewId}
            join ${projectStructures} on ${projectStructures.id} = ${inspectionViews.structureId}
            where ${projectStructures.rovProjectId} = ${rovProjects.id} and ${inspectionPoints.severity} = 'major')`,
          mediaCount: sql<number>`(select count(*)::int from ${inspectionMedia}
            join ${projectStructures} on ${projectStructures.id} = ${inspectionMedia.structureId}
            where ${projectStructures.rovProjectId} = ${rovProjects.id} and ${inspectionMedia.deletedAt} is null)`,
          reportStatus: sql<string | null>`(select case
              when bool_or(${inspectionReports.sharedLinkHash} is not null or ${inspectionReports.status} = 'shared') then 'shared'
              when bool_or(${inspectionReports.status} = 'final') then 'final'
              when count(*) > 0 then 'draft'
              else null end
            from ${inspectionReports} where ${inspectionReports.rovProjectId} = ${rovProjects.id})`,
        })
        .from(rovProjects)
        .leftJoin(customers, eq(customers.id, rovProjects.customerId))
        .where(whereClause)
        .orderBy(...orderBy)
        .limit(perPage)
        .offset(offset),
      this.db
        .select({ total: count() })
        .from(rovProjects)
        .leftJoin(customers, eq(customers.id, rovProjects.customerId))
        .where(whereClause),
      this.db
        .select({
          all: sql<number>`count(*) filter (where ${rovProjects.status} <> 'archived')::int`,
          draft: sql<number>`count(*) filter (where ${rovProjects.status} = 'draft')::int`,
          inProgress: sql<number>`count(*) filter (where ${rovProjects.status} = 'in_progress')::int`,
          completed: sql<number>`count(*) filter (where ${rovProjects.status} = 'completed')::int`,
          archived: sql<number>`count(*) filter (where ${rovProjects.status} = 'archived')::int`,
          overdue: sql<number>`count(*) filter (where ${rovProjects.status} in ('draft', 'in_progress') and ${rovProjects.endDate} < current_date)::int`,
          startingSoon: sql<number>`count(*) filter (where ${rovProjects.status} = 'draft' and ${rovProjects.startDate} between current_date and current_date + 14)::int`,
        })
        .from(rovProjects)
        .leftJoin(customers, eq(customers.id, rovProjects.customerId))
        .where(summaryWhere),
    ]);

    return {
      data: rows.map((row) => ({
        ...row.project,
        customerName: row.customerName,
        structureCount: row.structureCount ?? 0,
        findingCount: row.findingCount ?? 0,
        majorCount: row.majorCount ?? 0,
        mediaCount: row.mediaCount ?? 0,
        reportStatus: row.reportStatus,
      })),
      summary,
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
      .select({
        structure: projectStructures,
        findingCount: sql<number>`(select count(*)::int from ${inspectionPoints}
          join ${inspectionViews} on ${inspectionViews.id} = ${inspectionPoints.inspectionViewId}
          where ${inspectionViews.structureId} = ${projectStructures.id})`,
        majorCount: sql<number>`(select count(*)::int from ${inspectionPoints}
          join ${inspectionViews} on ${inspectionViews.id} = ${inspectionPoints.inspectionViewId}
          where ${inspectionViews.structureId} = ${projectStructures.id} and ${inspectionPoints.severity} = 'major')`,
        moderateCount: sql<number>`(select count(*)::int from ${inspectionPoints}
          join ${inspectionViews} on ${inspectionViews.id} = ${inspectionPoints.inspectionViewId}
          where ${inspectionViews.structureId} = ${projectStructures.id} and ${inspectionPoints.severity} = 'moderate')`,
        minorCount: sql<number>`(select count(*)::int from ${inspectionPoints}
          join ${inspectionViews} on ${inspectionViews.id} = ${inspectionPoints.inspectionViewId}
          where ${inspectionViews.structureId} = ${projectStructures.id} and ${inspectionPoints.severity} = 'minor')`,
        mediaCount: sql<number>`(select count(*)::int from ${inspectionMedia}
          where ${inspectionMedia.structureId} = ${projectStructures.id} and ${inspectionMedia.deletedAt} is null)`,
        viewCount: sql<number>`(select count(*)::int from ${inspectionViews}
          where ${inspectionViews.structureId} = ${projectStructures.id})`,
      })
      .from(projectStructures)
      // The join makes Drizzle qualify every column, which the correlated subqueries need.
      .innerJoin(rovProjects, eq(rovProjects.id, projectStructures.rovProjectId))
      .where(eq(projectStructures.rovProjectId, projectId))
      .orderBy(asc(projectStructures.sort), asc(projectStructures.name));

    const [report] = await this.db
      .select({
        total: sql<number>`count(*)::int`,
        status: sql<string | null>`case
          when bool_or(${inspectionReports.sharedLinkHash} is not null or ${inspectionReports.status} = 'shared') then 'shared'
          when bool_or(${inspectionReports.status} = 'final') then 'final'
          when count(*) > 0 then 'draft'
          else null end`,
      })
      .from(inspectionReports)
      .where(eq(inspectionReports.rovProjectId, projectId));

    const list = structures.map((row) => ({
      ...row.structure,
      findingCount: row.findingCount ?? 0,
      majorCount: row.majorCount ?? 0,
      moderateCount: row.moderateCount ?? 0,
      minorCount: row.minorCount ?? 0,
      mediaCount: row.mediaCount ?? 0,
      viewCount: row.viewCount ?? 0,
    }));
    const sum = (key: "findingCount" | "majorCount" | "moderateCount" | "minorCount" | "mediaCount") =>
      list.reduce((total, item) => total + item[key], 0);

    return {
      ...row.project,
      customerName: row.customerName,
      creatorName: row.creatorName,
      structures: list,
      stats: {
        structureCount: list.length,
        withDiagram: list.filter((item) => item.diagramPath).length,
        findingCount: sum("findingCount"),
        majorCount: sum("majorCount"),
        moderateCount: sum("moderateCount"),
        minorCount: sum("minorCount"),
        mediaCount: sum("mediaCount"),
        reportCount: report?.total ?? 0,
        reportStatus: (report?.status ?? null) as "draft" | "final" | "shared" | null,
      },
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
