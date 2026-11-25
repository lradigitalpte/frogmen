import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, lt } from "drizzle-orm";
import { organizations, platformBackups, type Database } from "@frog1/db";
import { RAW_DATABASE } from "../database/database.constants";
import { S3Service } from "../rov-inspection/s3.service";
import { exportOrganization } from "./organization-export";

const STALE_AFTER_MS = 30 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

@Injectable()
export class PlatformBackupsService {
  private readonly logger = new Logger(PlatformBackupsService.name);

  constructor(
    @Inject(RAW_DATABASE) private readonly db: Database,
    private readonly s3: S3Service,
  ) {}

  async list() {
    await this.failStale();
    const rows = await this.db
      .select()
      .from(platformBackups)
      .orderBy(desc(platformBackups.createdAt))
      .limit(200);
    return rows.map((row) => this.toResponse(row));
  }

  /** Starts in the background; the page polls the list until it is ready. */
  async start(organizationId: string, actorEmail: string) {
    const [organization] = await this.db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
      })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);
    if (!organization) {
      throw new NotFoundException("Organization not found");
    }

    await this.failStale();
    const [backup] = await this.db
      .insert(platformBackups)
      .values({
        tenantId: organization.id,
        tenantName: organization.name,
        tenantSlug: organization.slug,
        createdByEmail: actorEmail,
      })
      .onConflictDoNothing()
      .returning();
    if (!backup) {
      throw new ConflictException("A backup of this organization is already running");
    }

    void this.run(backup.id, organization);
    return this.toResponse(backup);
  }

  private async run(
    id: string,
    organization: { id: string; name: string; slug: string },
  ) {
    try {
      const { buffer, tableCount, rowCount } = await exportOrganization(
        this.db,
        organization,
      );
      const objectKey = `platform-backups/${organization.id}/${id}.zip`;
      await this.s3.putObject(objectKey, buffer, "application/zip");
      await this.db
        .update(platformBackups)
        .set({
          status: "ready",
          objectKey,
          sizeBytes: buffer.length,
          tableCount,
          rowCount,
          error: null,
        })
        .where(eq(platformBackups.id, id));
    } catch (error) {
      this.logger.error(
        `Backup ${id} of ${organization.slug} failed`,
        error instanceof Error ? error.stack : String(error),
      );
      const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
      await this.db
        .update(platformBackups)
        .set({
          status: "failed",
          error: (cause instanceof Error ? cause.message : "Backup failed").slice(0, 500),
        })
        .where(eq(platformBackups.id, id))
        .catch(() => undefined);
    }
  }

  async download(id: string, actorEmail: string) {
    const backup = await this.getRow(id);
    if (backup.status !== "ready" || !backup.objectKey) {
      throw new NotFoundException("This backup isn't ready to download");
    }
    const { buffer } = await this.s3.getObjectStream(backup.objectKey);
    await this.db
      .update(platformBackups)
      .set({ lastDownloadedAt: new Date(), lastDownloadedByEmail: actorEmail })
      .where(eq(platformBackups.id, id));
    const stamp = backup.createdAt.toISOString().slice(0, 16).replace(/[:T]/g, "-");
    const slug = backup.tenantSlug.replace(/[^a-z0-9-]/gi, "-");
    return { buffer, filename: `${slug}-backup-${stamp}.zip` };
  }

  async remove(id: string) {
    const backup = await this.getRow(id);
    if (backup.status === "running") {
      throw new ConflictException("Wait for this backup to finish first");
    }
    if (backup.objectKey) {
      await this.s3.deleteObject(backup.objectKey);
    }
    await this.db.delete(platformBackups).where(eq(platformBackups.id, id));
    return { id };
  }

  private async getRow(id: string) {
    const [row] = UUID_RE.test(id)
      ? await this.db
          .select()
          .from(platformBackups)
          .where(eq(platformBackups.id, id))
          .limit(1)
      : [];
    if (!row) {
      throw new NotFoundException("Backup not found");
    }
    return row;
  }

  /** A backup still running after this long was cut off by an API restart. */
  private async failStale() {
    await this.db
      .update(platformBackups)
      .set({ status: "failed", error: "Interrupted before it finished. Start it again." })
      .where(
        and(
          eq(platformBackups.status, "running"),
          lt(platformBackups.createdAt, new Date(Date.now() - STALE_AFTER_MS)),
        ),
      );
  }

  private toResponse(row: typeof platformBackups.$inferSelect) {
    return {
      id: row.id,
      organizationId: row.tenantId,
      organizationName: row.tenantName,
      organizationSlug: row.tenantSlug,
      status: row.status,
      sizeBytes: row.sizeBytes,
      tableCount: row.tableCount,
      rowCount: row.rowCount,
      error: row.error,
      createdByEmail: row.createdByEmail,
      createdAt: row.createdAt,
      lastDownloadedAt: row.lastDownloadedAt,
      lastDownloadedByEmail: row.lastDownloadedByEmail,
    };
  }
}
