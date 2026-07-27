import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { normalizeSeverity } from "@frog1/shared";
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNull,
  max,
  sql,
} from "drizzle-orm";
import {
  customers,
  inspectionMedia,
  inspectionPoints,
  inspectionReports,
  inspectionViews,
  projectStructures,
  reportAccessLogs,
  rovProjects,
  users,
  type Database,
} from "@frog1/db";
import { randomUUID } from "node:crypto";
import type {
  CreateMediaInput,
  CreatePointInput,
  CreateReportInput,
  CreateViewInput,
  UpdateMediaInput,
  UpdatePointInput,
  UpdateReportInput,
  UpdateViewInput,
} from "./dto/rov.dto";
import { DATABASE } from "../database/database.constants";
import { UploadsService } from "../uploads/uploads.service";
import { clampPointCoordinates } from "./rov-coordinates";
import { RovProjectsService } from "./rov-projects.service";
import { S3Service } from "./s3.service";

@Injectable()
export class RovInspectionService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly projectsService: RovProjectsService,
    private readonly s3Service: S3Service,
    private readonly uploadsService: UploadsService,
  ) {}

  // ── Views ────────────────────────────────────────────────────────────────

  async listViews(
    organizationId: string,
    projectId: string,
    structureId: string,
  ) {
    const structure = await this.projectsService.getStructure(
      organizationId,
      projectId,
      structureId,
    );

    const views = await this.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${structureId}))`,
      );

      let rows = await tx
        .select()
        .from(inspectionViews)
        .where(eq(inspectionViews.structureId, structureId))
        .orderBy(asc(inspectionViews.name));

      if (rows.length === 0) {
        const [created] = await tx
          .insert(inspectionViews)
          .values({
            structureId,
            name: `${structure.name}_ROV`,
            viewType: "rov",
          })
          .returning();
        return [created];
      }

      rows = await this.deduplicateViews(tx, rows);
      return rows;
    });

    return views;
  }

  private async deduplicateViews(
    db: Pick<Database, "select" | "delete">,
    views: (typeof inspectionViews.$inferSelect)[],
  ) {
    const groups = new Map<string, (typeof inspectionViews.$inferSelect)[]>();
    for (const view of views) {
      const key = `${view.name}\0${view.viewType}`;
      const group = groups.get(key) ?? [];
      group.push(view);
      groups.set(key, group);
    }

    const duplicateIds = [...groups.values()]
      .filter((group) => group.length > 1)
      .flatMap((group) => group.map((view) => view.id));

    if (duplicateIds.length === 0) {
      return views;
    }

    const pointCounts = await db
      .select({
        viewId: inspectionPoints.inspectionViewId,
        pointCount: count(),
      })
      .from(inspectionPoints)
      .where(inArray(inspectionPoints.inspectionViewId, duplicateIds))
      .groupBy(inspectionPoints.inspectionViewId);

    const countByViewId = new Map(
      pointCounts.map((row) => [row.viewId, Number(row.pointCount)]),
    );

    const deleteIds: string[] = [];
    const keptIds = new Set<string>();

    for (const group of groups.values()) {
      if (group.length === 1) {
        keptIds.add(group[0].id);
        continue;
      }

      const ranked = [...group].sort((a, b) => {
        const aCount = countByViewId.get(a.id) ?? 0;
        const bCount = countByViewId.get(b.id) ?? 0;
        if (bCount !== aCount) return bCount - aCount;
        return a.createdAt.getTime() - b.createdAt.getTime();
      });

      keptIds.add(ranked[0].id);
      for (const duplicate of ranked.slice(1)) {
        if ((countByViewId.get(duplicate.id) ?? 0) === 0) {
          deleteIds.push(duplicate.id);
        } else {
          keptIds.add(duplicate.id);
        }
      }
    }

    if (deleteIds.length > 0) {
      await db
        .delete(inspectionViews)
        .where(inArray(inspectionViews.id, deleteIds));
    }

    return views
      .filter((view) => keptIds.has(view.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async createView(
    organizationId: string,
    projectId: string,
    structureId: string,
    input: CreateViewInput,
  ) {
    await this.projectsService.getStructure(
      organizationId,
      projectId,
      structureId,
    );

    const [view] = await this.db
      .insert(inspectionViews)
      .values({
        structureId,
        name: input.name,
        viewType: input.viewType ?? "rov",
      })
      .returning();

    return view;
  }

  async updateView(
    organizationId: string,
    projectId: string,
    structureId: string,
    viewId: string,
    input: UpdateViewInput,
  ) {
    await this.getView(organizationId, projectId, structureId, viewId);

    const [view] = await this.db
      .update(inspectionViews)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(inspectionViews.id, viewId))
      .returning();

    return view;
  }

  async deleteView(
    organizationId: string,
    projectId: string,
    structureId: string,
    viewId: string,
  ) {
    await this.getView(organizationId, projectId, structureId, viewId);

    await this.db.delete(inspectionViews).where(eq(inspectionViews.id, viewId));

    return { ok: true };
  }

  private async getView(
    organizationId: string,
    projectId: string,
    structureId: string,
    viewId: string,
  ) {
    await this.projectsService.getStructure(
      organizationId,
      projectId,
      structureId,
    );

    const [view] = await this.db
      .select()
      .from(inspectionViews)
      .where(
        and(
          eq(inspectionViews.id, viewId),
          eq(inspectionViews.structureId, structureId),
        ),
      )
      .limit(1);

    if (!view) {
      throw new NotFoundException("Inspection view not found");
    }

    return view;
  }

  // ── Points ───────────────────────────────────────────────────────────────

  async listPoints(
    organizationId: string,
    projectId: string,
    structureId: string,
    viewId: string,
  ) {
    await this.getView(organizationId, projectId, structureId, viewId);

    const points = await this.db
      .select()
      .from(inspectionPoints)
      .where(eq(inspectionPoints.inspectionViewId, viewId))
      .orderBy(asc(inspectionPoints.pointNumber));

    const enriched = await Promise.all(
      points.map(async (point) => {
        const media = await this.db
          .select()
          .from(inspectionMedia)
          .where(
            and(
              eq(inspectionMedia.inspectionPointId, point.id),
              isNull(inspectionMedia.deletedAt),
            ),
          );

        const mediaWithUrls = await this.enrichMedia(media);

        return { ...point, media: mediaWithUrls };
      }),
    );

    return enriched;
  }

  async listAllProjectPoints(organizationId: string, projectId: string) {
    await this.projectsService.getById(organizationId, projectId);

    const rows = await this.db
      .select({
        point: inspectionPoints,
        view: inspectionViews,
        structure: projectStructures,
      })
      .from(inspectionPoints)
      .innerJoin(
        inspectionViews,
        eq(inspectionViews.id, inspectionPoints.inspectionViewId),
      )
      .innerJoin(
        projectStructures,
        eq(projectStructures.id, inspectionViews.structureId),
      )
      .where(eq(projectStructures.rovProjectId, projectId))
      .orderBy(
        asc(projectStructures.sort),
        asc(inspectionViews.name),
        asc(inspectionPoints.pointNumber),
      );

    return rows.map((row) => ({
      ...row.point,
      viewName: row.view.name,
      viewType: row.view.viewType,
      structureId: row.structure.id,
      structureName: row.structure.name,
    }));
  }

  async createPoint(
    organizationId: string,
    projectId: string,
    structureId: string,
    viewId: string,
    input: CreatePointInput,
  ) {
    await this.getView(organizationId, projectId, structureId, viewId);

    const [{ maxNum }] = await this.db
      .select({ maxNum: max(inspectionPoints.pointNumber) })
      .from(inspectionPoints)
      .where(eq(inspectionPoints.inspectionViewId, viewId));

    const pointNumber = (maxNum ?? 0) + 1;
    const [{ pointCount }] = await this.db
      .select({ pointCount: count() })
      .from(inspectionPoints)
      .where(eq(inspectionPoints.inspectionViewId, viewId));

    const observationId = `O${(pointCount ?? 0) + 1}`;
    const coords = clampPointCoordinates({
      xCoordinate: input.xCoordinate,
      yCoordinate: input.yCoordinate,
    });

    const [point] = await this.db
      .insert(inspectionPoints)
      .values({
        inspectionViewId: viewId,
        observationId,
        pointNumber,
        label: input.label ?? observationId,
        xCoordinate: coords.xCoordinate,
        yCoordinate: coords.yCoordinate,
        severity: input.severity,
        findingType: input.findingType,
        description: input.description,
        diveLocation: input.diveLocation,
        depthM: input.depthM,
        dimensionMm: input.dimensionMm,
        recommendations: input.recommendations,
      })
      .returning();

    return point;
  }

  async updatePoint(
    organizationId: string,
    projectId: string,
    structureId: string,
    viewId: string,
    pointId: string,
    input: UpdatePointInput,
  ) {
    await this.getPoint(organizationId, projectId, structureId, viewId, pointId);

    const [point] = await this.db
      .update(inspectionPoints)
      .set({ ...clampPointCoordinates(input), updatedAt: new Date() })
      .where(eq(inspectionPoints.id, pointId))
      .returning();

    return point;
  }

  async deletePoint(
    organizationId: string,
    projectId: string,
    structureId: string,
    viewId: string,
    pointId: string,
  ) {
    await this.getPoint(organizationId, projectId, structureId, viewId, pointId);

    await this.db
      .update(inspectionMedia)
      .set({ inspectionPointId: null })
      .where(eq(inspectionMedia.inspectionPointId, pointId));

    await this.db
      .delete(inspectionPoints)
      .where(eq(inspectionPoints.id, pointId));

    return { ok: true };
  }

  private async getPoint(
    organizationId: string,
    projectId: string,
    structureId: string,
    viewId: string,
    pointId: string,
  ) {
    await this.getView(organizationId, projectId, structureId, viewId);

    const [point] = await this.db
      .select()
      .from(inspectionPoints)
      .where(
        and(
          eq(inspectionPoints.id, pointId),
          eq(inspectionPoints.inspectionViewId, viewId),
        ),
      )
      .limit(1);

    if (!point) {
      throw new NotFoundException("Inspection point not found");
    }

    return point;
  }

  // ── Media ────────────────────────────────────────────────────────────────

  async listMedia(
    organizationId: string,
    projectId: string,
    structureId?: string,
  ) {
    await this.projectsService.getById(organizationId, projectId);

    const filters = [
      isNull(inspectionMedia.deletedAt),
      eq(projectStructures.rovProjectId, projectId),
    ];

    if (structureId) {
      await this.projectsService.getStructure(
        organizationId,
        projectId,
        structureId,
      );
      filters.push(eq(inspectionMedia.structureId, structureId));
    }

    const rows = await this.db
      .select({
        media: inspectionMedia,
        structureName: projectStructures.name,
        uploaderName: users.name,
      })
      .from(inspectionMedia)
      .innerJoin(
        projectStructures,
        eq(projectStructures.id, inspectionMedia.structureId),
      )
      .leftJoin(users, eq(users.id, inspectionMedia.uploadedBy))
      .where(and(...filters))
      .orderBy(desc(inspectionMedia.uploadedAt));

    const enriched = await this.enrichMedia(
      rows.map((row) => row.media),
    );

    return enriched.map((media, index) => ({
      ...media,
      structureName: rows[index].structureName,
      uploaderName: rows[index].uploaderName,
    }));
  }

  async createMedia(
    organizationId: string,
    projectId: string,
    userId: string,
    input: CreateMediaInput,
  ) {
    await this.projectsService.getStructure(
      organizationId,
      projectId,
      input.structureId,
    );

    if (!input.filePath.startsWith("rov-inspection/")) {
      throw new BadRequestException("Invalid media file path");
    }

    const [media] = await this.db
      .insert(inspectionMedia)
      .values({
        structureId: input.structureId,
        inspectionPointId: input.inspectionPointId ?? null,
        mediaType: input.mediaType,
        fileName: input.fileName,
        filePath: input.filePath,
        mimeType: input.mimeType,
        fileSize: input.fileSize,
        duration: input.duration,
        uploadedBy: userId,
      })
      .returning();

    const [enriched] = await this.enrichMedia([media]);
    return enriched;
  }

  async updateMedia(
    organizationId: string,
    projectId: string,
    mediaId: string,
    input: UpdateMediaInput,
  ) {
    const media = await this.getMediaRecord(organizationId, projectId, mediaId);

    const [updated] = await this.db
      .update(inspectionMedia)
      .set(input)
      .where(eq(inspectionMedia.id, mediaId))
      .returning();

    const [enriched] = await this.enrichMedia([updated]);
    return enriched ?? { ...media, ...input };
  }

  async deleteMedia(
    organizationId: string,
    projectId: string,
    mediaId: string,
  ) {
    await this.getMediaRecord(organizationId, projectId, mediaId);

    await this.db
      .update(inspectionMedia)
      .set({ deletedAt: new Date() })
      .where(eq(inspectionMedia.id, mediaId));

    return { ok: true };
  }

  private async getMediaRecord(
    organizationId: string,
    projectId: string,
    mediaId: string,
  ) {
    const [row] = await this.db
      .select({ media: inspectionMedia })
      .from(inspectionMedia)
      .innerJoin(
        projectStructures,
        eq(projectStructures.id, inspectionMedia.structureId),
      )
      .where(
        and(
          eq(inspectionMedia.id, mediaId),
          eq(projectStructures.rovProjectId, projectId),
          isNull(inspectionMedia.deletedAt),
        ),
      )
      .limit(1);

    if (!row) {
      throw new NotFoundException("Media not found");
    }

    await this.projectsService.getById(organizationId, projectId);

    return row.media;
  }

  private async safePresignedUrl(key: string | null | undefined) {
    if (!key) return null;

    try {
      return await this.s3Service.getPresignedUrl(key);
    } catch {
      return null;
    }
  }

  private async enrichMedia(
    items: (typeof inspectionMedia.$inferSelect)[],
  ) {
    return Promise.all(
      items.map(async (item) => {
        const url = await this.safePresignedUrl(item.filePath);
        const thumbnailUrl = item.thumbnailPath
          ? await this.safePresignedUrl(item.thumbnailPath)
          : item.mediaType === "image"
            ? url
            : null;

        return {
          ...item,
          url,
          thumbnailUrl,
        };
      }),
    );
  }

  // ── Reports ──────────────────────────────────────────────────────────────

  async listReports(organizationId: string, projectId?: string) {
    const filters = [eq(inspectionReports.organizationId, organizationId)];

    if (projectId) {
      filters.push(eq(inspectionReports.rovProjectId, projectId));
    }

    const rows = await this.db
      .select({
        report: inspectionReports,
        projectName: rovProjects.name,
      })
      .from(inspectionReports)
      .innerJoin(rovProjects, eq(rovProjects.id, inspectionReports.rovProjectId))
      .where(and(...filters))
      .orderBy(desc(inspectionReports.updatedAt));

    return rows.map((row) => ({
      ...row.report,
      projectName: row.projectName,
    }));
  }

  async getReport(organizationId: string, reportId: string) {
    const [row] = await this.db
      .select({
        report: inspectionReports,
        projectName: rovProjects.name,
      })
      .from(inspectionReports)
      .innerJoin(rovProjects, eq(rovProjects.id, inspectionReports.rovProjectId))
      .where(
        and(
          eq(inspectionReports.id, reportId),
          eq(inspectionReports.organizationId, organizationId),
        ),
      )
      .limit(1);

    if (!row) {
      throw new NotFoundException("Report not found");
    }

    return { ...row.report, projectName: row.projectName };
  }

  async createReport(
    organizationId: string,
    projectId: string,
    userId: string,
    input: CreateReportInput,
  ) {
    await this.projectsService.getById(organizationId, projectId);

    const existing = await this.db
      .select()
      .from(inspectionReports)
      .where(eq(inspectionReports.rovProjectId, projectId))
      .limit(1);

    if (existing.length > 0) {
      throw new BadRequestException(
        "A report already exists for this project. Edit the existing report instead.",
      );
    }

    const autoSummary = await this.buildAutoSummary(organizationId, projectId);

    const [report] = await this.db
      .insert(inspectionReports)
      .values({
        organizationId,
        rovProjectId: projectId,
        title: input.title ?? `Inspection Report`,
        summary: input.summary ?? autoSummary.summary,
        fullReport: input.fullReport,
        conclusions: input.conclusions ?? autoSummary.conclusions,
        recommendations: input.recommendations,
        status: input.status ?? "draft",
        clientCanDownload: input.clientCanDownload ?? true,
        clientCanPrint: input.clientCanPrint ?? false,
        sharedLinkExpiresAt: input.sharedLinkExpiresAt
          ? new Date(input.sharedLinkExpiresAt)
          : null,
        sharedBy: userId,
      })
      .returning();

    return report;
  }

  async updateReport(
    organizationId: string,
    reportId: string,
    input: UpdateReportInput,
  ) {
    await this.getReport(organizationId, reportId);

    const [report] = await this.db
      .update(inspectionReports)
      .set({
        ...input,
        sharedLinkExpiresAt: input.sharedLinkExpiresAt
          ? new Date(input.sharedLinkExpiresAt)
          : input.sharedLinkExpiresAt === null
            ? null
            : undefined,
        updatedAt: new Date(),
      })
      .where(eq(inspectionReports.id, reportId))
      .returning();

    return report;
  }

  async generateShareLink(organizationId: string, reportId: string, userId: string) {
    await this.getReport(organizationId, reportId);

    const hash = randomUUID();

    const [report] = await this.db
      .update(inspectionReports)
      .set({
        sharedLinkHash: hash,
        sharedDate: new Date(),
        sharedBy: userId,
        status: "shared",
        updatedAt: new Date(),
      })
      .where(eq(inspectionReports.id, reportId))
      .returning();

    return report;
  }

  private async buildAutoSummary(organizationId: string, projectId: string) {
    const points = await this.listAllProjectPoints(organizationId, projectId);
    const counts = { major: 0, moderate: 0, minor: 0 };

    for (const point of points) {
      const severity = normalizeSeverity(point.severity);
      if (severity) {
        counts[severity]++;
      }
    }

    const total = counts.major + counts.moderate + counts.minor;

    return {
      summary: `Inspection completed with ${total} observation(s): ${counts.major} major, ${counts.moderate} moderate, ${counts.minor} minor.`,
      conclusions:
        counts.major > 0
          ? "Major findings require immediate attention."
          : total > 0
            ? "Findings documented for review."
            : "No significant findings recorded.",
    };
  }

  // ── Public report ────────────────────────────────────────────────────────

  private async getValidatedPublicReport(hash: string) {
    const [report] = await this.db
      .select()
      .from(inspectionReports)
      .where(eq(inspectionReports.sharedLinkHash, hash))
      .limit(1);

    if (!report) {
      throw new NotFoundException("Report not found");
    }

    if (
      report.sharedLinkExpiresAt &&
      report.sharedLinkExpiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException("This report link has expired.");
    }

    return report;
  }

  private async resolvePublicAssetUrl(
    hash: string | null,
    filePath: string | null | undefined,
  ): Promise<string | null> {
    if (!filePath || !hash) return null;

    if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
      return filePath;
    }

    if (filePath.startsWith("rov-inspection/")) {
      return this.s3Service.getPresignedUrl(filePath);
    }

    if (filePath.startsWith("rov/")) {
      const parts = filePath.split("/");
      if (parts.length < 3) return null;
      const suffix = parts.slice(2).join("/");
      return `/api/v1/public/report/${hash}/assets/${suffix}`;
    }

    return null;
  }

  async getPublicReportAsset(hash: string, suffix: string) {
    const report = await this.getValidatedPublicReport(hash);

    const [projectRow] = await this.db
      .select({ project: rovProjects })
      .from(rovProjects)
      .where(eq(rovProjects.id, report.rovProjectId))
      .limit(1);

    if (!projectRow) {
      throw new NotFoundException("Project not found");
    }

    const relativePath = `rov/${projectRow.project.organizationId}/${suffix}`;
    return this.uploadsService.getRovFileStream(
      projectRow.project.organizationId,
      relativePath,
    );
  }

  async getPublicReport(hash: string, ipAddress?: string, userAgent?: string) {
    const report = await this.getValidatedPublicReport(hash);

    await this.db.insert(reportAccessLogs).values({
      reportId: report.id,
      accessedBy: userAgent ?? "Anonymous",
      ipAddress: ipAddress ?? null,
      accessedAt: new Date(),
    });

    return this.buildReportPayload(report);
  }

  async buildReportPayload(report: typeof inspectionReports.$inferSelect) {
    const [projectRow] = await this.db
      .select({
        project: rovProjects,
        customerName: customers.name,
      })
      .from(rovProjects)
      .leftJoin(customers, eq(customers.id, rovProjects.customerId))
      .where(eq(rovProjects.id, report.rovProjectId))
      .limit(1);

    if (!projectRow) {
      throw new NotFoundException("Project not found");
    }

    const project = projectRow.project;
    const shareHash = report.sharedLinkHash;
    const structures = await this.db
      .select()
      .from(projectStructures)
      .where(eq(projectStructures.rovProjectId, project.id))
      .orderBy(asc(projectStructures.sort));

    const severityCounts = { major: 0, moderate: 0, minor: 0 };

    const structurePayload = await Promise.all(
      structures.map(async (structure) => {
        const views = await this.db
          .select()
          .from(inspectionViews)
          .where(eq(inspectionViews.structureId, structure.id))
          .orderBy(asc(inspectionViews.name));

        const unlinkedMediaRows = await this.db
          .select()
          .from(inspectionMedia)
          .where(
            and(
              eq(inspectionMedia.structureId, structure.id),
              isNull(inspectionMedia.inspectionPointId),
              isNull(inspectionMedia.deletedAt),
            ),
          );

        const unlinkedMedia = await this.enrichMedia(unlinkedMediaRows);

        const viewsPayload = await Promise.all(
          views.map(async (view) => {
            const points = await this.db
              .select()
              .from(inspectionPoints)
              .where(eq(inspectionPoints.inspectionViewId, view.id))
              .orderBy(asc(inspectionPoints.pointNumber));

            const pointsPayload = await Promise.all(
              points.map(async (point) => {
                const severity = normalizeSeverity(point.severity) ?? "minor";
                severityCounts[severity]++;

                const mediaRows = await this.db
                  .select()
                  .from(inspectionMedia)
                  .where(
                    and(
                      eq(inspectionMedia.inspectionPointId, point.id),
                      isNull(inspectionMedia.deletedAt),
                    ),
                  );

                const media = await this.enrichMedia(mediaRows);

                return {
                  id: point.id,
                  observationId: point.observationId,
                  pointNumber: point.pointNumber,
                  label: point.label,
                  severity,
                  findingType: point.findingType,
                  description: point.description,
                  diveLocation: point.diveLocation,
                  depthM: point.depthM,
                  dimensionMm: point.dimensionMm,
                  recommendations: point.recommendations,
                  xCoordinate: point.xCoordinate,
                  yCoordinate: point.yCoordinate,
                  media,
                };
              }),
            );

            return {
              id: view.id,
              name: view.name,
              viewType: view.viewType,
              points: pointsPayload,
            };
          }),
        );

        return {
          id: structure.id,
          name: structure.name,
          description: structure.description,
          photoUrl: await this.resolvePublicAssetUrl(
            shareHash,
            structure.photoPath,
          ),
          diagramUrl: await this.resolvePublicAssetUrl(
            shareHash,
            structure.diagramPath,
          ),
          views: viewsPayload,
          unlinkedMedia,
        };
      }),
    );

    return {
      report: {
        id: report.id,
        title: report.title,
        summary: report.summary,
        fullReport: report.fullReport,
        conclusions: report.conclusions,
        recommendations: report.recommendations,
        status: report.status,
        sharedDate: report.sharedDate?.toISOString() ?? null,
        expiresAt: report.sharedLinkExpiresAt?.toISOString() ?? null,
        clientCanDownload: report.clientCanDownload,
        clientCanPrint: report.clientCanPrint,
      },
      project: {
        id: project.id,
        name: project.name,
        location: project.location,
        latitude: project.latitude,
        longitude: project.longitude,
        startDate: project.startDate,
        endDate: project.endDate,
        planViewUrl: await this.resolvePublicAssetUrl(
          shareHash,
          project.planViewPath,
        ),
        siteMapUrl: await this.resolvePublicAssetUrl(
          shareHash,
          project.siteMapPath,
        ),
        customer: projectRow.customerName
          ? { name: projectRow.customerName }
          : null,
        structures: structurePayload,
      },
      severityCounts,
    };
  }
}
