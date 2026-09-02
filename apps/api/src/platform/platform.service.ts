import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import {
  type Database,
  exchangeRates,
  members,
  organizations,
  sessions,
  users,
} from "@frog1/db";
import { RAW_DATABASE } from "../database/database.constants";
import { issueTemporaryPassword } from "../auth/provision-user";
import {
  quoteIdent,
  sortTablesForDeletion,
} from "./platform-org-delete";

export type PlatformOrganizationMember = {
  userId: string;
  name: string;
  email: string;
  role: string;
};

export type PlatformOrganization = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  memberCount: number;
  ownerEmails: string[];
  members: PlatformOrganizationMember[];
};

@Injectable()
export class PlatformService {
  private readonly logger = new Logger(PlatformService.name);

  constructor(
    @Inject(RAW_DATABASE) private readonly db: Database,
    private readonly config: ConfigService,
  ) {}

  async listOrganizations(): Promise<PlatformOrganization[]> {
    const orgRows = await this.db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        createdAt: organizations.createdAt,
        memberCount: sql<number>`cast(count(${members.id}) as int)`,
      })
      .from(organizations)
      .leftJoin(members, eq(members.organizationId, organizations.id))
      .groupBy(
        organizations.id,
        organizations.name,
        organizations.slug,
        organizations.createdAt,
      )
      .orderBy(organizations.createdAt);

    if (orgRows.length === 0) {
      return [];
    }

    const memberRows = await this.db
      .select({
        organizationId: members.organizationId,
        userId: members.userId,
        role: members.role,
        name: users.name,
        email: users.email,
      })
      .from(members)
      .innerJoin(users, eq(users.id, members.userId))
      .orderBy(users.email);

    const membersByOrg = new Map<string, PlatformOrganizationMember[]>();
    for (const row of memberRows) {
      const list = membersByOrg.get(row.organizationId) ?? [];
      list.push({
        userId: row.userId,
        name: row.name,
        email: row.email,
        role: row.role,
      });
      membersByOrg.set(row.organizationId, list);
    }

    return orgRows.map((row) => {
      const orgMembers = membersByOrg.get(row.id) ?? [];
      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        createdAt: row.createdAt,
        memberCount: Number(row.memberCount ?? 0),
        ownerEmails: orgMembers
          .filter((member) => member.role === "owner")
          .map((member) => member.email),
        members: orgMembers,
      };
    });
  }

  async deleteOrganization(input: {
    organizationId: string;
    confirmSlug: string;
    actorUserId: string;
  }) {
    const confirmSlug = input.confirmSlug?.trim() ?? "";
    if (!confirmSlug) {
      throw new BadRequestException(
        "Type the organization slug to confirm deletion",
      );
    }

    const [organization] = await this.db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
      })
      .from(organizations)
      .where(eq(organizations.id, input.organizationId))
      .limit(1);

    if (!organization) {
      throw new NotFoundException("Organization not found");
    }

    if (organization.slug !== confirmSlug) {
      throw new BadRequestException(
        "Confirmation slug does not match this organization",
      );
    }

    const [total] = await this.db
      .select({ value: count() })
      .from(organizations);
    if ((total?.value ?? 0) <= 1) {
      throw new BadRequestException(
        "Cannot delete the last remaining organization",
      );
    }

    const memberRows = await this.db
      .select({ userId: members.userId })
      .from(members)
      .where(eq(members.organizationId, organization.id));
    const memberUserIds = [...new Set(memberRows.map((row) => row.userId))];

    const actorMemberships = await this.db
      .select({ organizationId: members.organizationId })
      .from(members)
      .where(eq(members.userId, input.actorUserId));
    if (
      actorMemberships.length === 1 &&
      actorMemberships[0]?.organizationId === organization.id
    ) {
      throw new BadRequestException(
        "Cannot delete this organization because it would remove your own account. Create or switch to another organization first.",
      );
    }

    let deletedOrphanUsers = 0;

    try {
      await this.db.transaction(async (tx) => {
        await this.wipeOrganizationRows(tx, organization.id);

        await tx
          .update(sessions)
          .set({
            activeOrganizationId: null,
            activeBranchId: null,
            branchScope: "single",
          })
          .where(eq(sessions.activeOrganizationId, organization.id));

        await tx
          .delete(exchangeRates)
          .where(eq(exchangeRates.organizationId, organization.id));

        await tx
          .delete(organizations)
          .where(eq(organizations.id, organization.id));

        if (memberUserIds.length > 0) {
          const stillMember = await tx
            .select({ userId: members.userId })
            .from(members)
            .where(inArray(members.userId, memberUserIds));
          const remaining = new Set(stillMember.map((row) => row.userId));
          const orphanUserIds = memberUserIds.filter(
            (id) => !remaining.has(id) && id !== input.actorUserId,
          );

          if (orphanUserIds.length > 0) {
            await tx.delete(users).where(inArray(users.id, orphanUserIds));
            deletedOrphanUsers = orphanUserIds.length;
          }
        }
      });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(
        `Failed to delete organization ${organization.id} (${organization.slug})`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new InternalServerErrorException(
        error instanceof Error
          ? `Failed to delete organization: ${error.message}`
          : "Failed to delete organization",
      );
    }

    return {
      deletedOrganizationId: organization.id,
      name: organization.name,
      slug: organization.slug,
      deletedOrphanUsers,
    };
  }

  async resetOrganizationUserPassword(input: {
    organizationId: string;
    userId: string;
    actorUserId: string;
  }) {
    if (input.userId === input.actorUserId) {
      throw new BadRequestException(
        "Use Profile → Security to change your own password",
      );
    }

    const [member] = await this.db
      .select({
        userId: users.id,
        email: users.email,
        name: users.name,
      })
      .from(members)
      .innerJoin(users, eq(users.id, members.userId))
      .where(
        and(
          eq(members.organizationId, input.organizationId),
          eq(members.userId, input.userId),
        ),
      )
      .limit(1);

    if (!member) {
      throw new NotFoundException("User is not a member of this organization");
    }

    const temporaryPassword = await issueTemporaryPassword(
      this.db,
      member.userId,
    );
    const webUrl = (
      this.config.get<string>("WEB_URL") ?? "http://localhost:3000"
    ).replace(/\/$/, "");

    return {
      userId: member.userId,
      name: member.name,
      email: member.email,
      temporaryPassword,
      loginUrl: `${webUrl}/login?email=${encodeURIComponent(member.email)}`,
      mustChangePassword: true,
    };
  }

  private async wipeOrganizationRows(
    tx: Pick<Database, "execute">,
    organizationId: string,
  ) {
    await tx.execute(
      sql`select set_config('app.organization_id', ${organizationId}, true)`,
    );
    await tx.execute(sql`select set_config('app.all_branches', 'true', true)`);
    await tx.execute(sql`select set_config('app.branch_id', '', true)`);

    await tx.execute(
      sql.raw(
        'ALTER TABLE "audit_logs" DISABLE TRIGGER "audit_logs_immutable"',
      ),
    );

    try {
      const tableRows = Array.from(
        await tx.execute(sql`
          select c.relname as table_name
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          join pg_attribute a on a.attrelid = c.oid
          where n.nspname = 'public'
            and c.relkind = 'r'
            and a.attname = 'organization_id'
            and not a.attisdropped
            and c.relname <> 'organizations'
        `),
      ) as Array<{ table_name: string }>;

      const fkRows = Array.from(
        await tx.execute(sql`
          select src.relname as from_table, dst.relname as to_table
          from pg_constraint con
          join pg_class src on src.oid = con.conrelid
          join pg_class dst on dst.oid = con.confrelid
          join pg_namespace nsrc on nsrc.oid = src.relnamespace
          join pg_namespace ndst on ndst.oid = dst.relnamespace
          where con.contype = 'f'
            and nsrc.nspname = 'public'
            and ndst.nspname = 'public'
        `),
      ) as Array<{ from_table: string; to_table: string }>;

      const tables = [...new Set(tableRows.map((row) => row.table_name))];
      const ordered = sortTablesForDeletion(
        tables,
        fkRows.map((row) => ({
          fromTable: row.from_table,
          toTable: row.to_table,
        })),
      );

      for (const tableName of ordered) {
        await tx.execute(
          sql`delete from ${sql.raw(quoteIdent(tableName))} where organization_id = ${organizationId}`,
        );
      }
    } finally {
      await tx.execute(
        sql.raw(
          'ALTER TABLE "audit_logs" ENABLE TRIGGER "audit_logs_immutable"',
        ),
      );
    }
  }
}
