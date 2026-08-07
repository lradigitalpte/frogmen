import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { count, eq, inArray, sql } from "drizzle-orm";
import {
  type Database,
  exchangeRates,
  members,
  organizations,
  sessions,
  users,
} from "@frog1/db";
import { RAW_DATABASE } from "../database/database.constants";

export type PlatformOrganization = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  memberCount: number;
  ownerEmails: string[];
};

@Injectable()
export class PlatformService {
  constructor(@Inject(RAW_DATABASE) private readonly db: Database) {}

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

    const ownerRows = await this.db
      .select({
        organizationId: members.organizationId,
        email: users.email,
      })
      .from(members)
      .innerJoin(users, eq(users.id, members.userId))
      .where(eq(members.role, "owner"));

    const ownersByOrg = new Map<string, string[]>();
    for (const row of ownerRows) {
      const list = ownersByOrg.get(row.organizationId) ?? [];
      list.push(row.email);
      ownersByOrg.set(row.organizationId, list);
    }

    return orgRows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      createdAt: row.createdAt,
      memberCount: Number(row.memberCount ?? 0),
      ownerEmails: ownersByOrg.get(row.id) ?? [],
    }));
  }

  async deleteOrganization(input: {
    organizationId: string;
    confirmSlug: string;
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

    let deletedOrphanUsers = 0;

    await this.db.transaction(async (tx) => {
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
        const orphanUserIds = memberUserIds.filter((id) => !remaining.has(id));

        if (orphanUserIds.length > 0) {
          await tx.delete(users).where(inArray(users.id, orphanUserIds));
          deletedOrphanUsers = orphanUserIds.length;
        }
      }
    });

    return {
      deletedOrganizationId: organization.id,
      name: organization.name,
      slug: organization.slug,
      deletedOrphanUsers,
    };
  }
}
