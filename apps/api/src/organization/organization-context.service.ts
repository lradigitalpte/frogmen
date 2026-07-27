import { Inject, Injectable } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
import { members, sessions, type Database } from "@frog1/db";
import { DATABASE } from "../database/database.constants";

@Injectable()
export class OrganizationContextService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async ensureActiveOrganization(
    sessionId: string,
    userId: string,
    currentOrganizationId?: string | null,
  ) {
    if (currentOrganizationId) {
      return currentOrganizationId;
    }

    const [member] = await this.db
      .select({ organizationId: members.organizationId })
      .from(members)
      .where(eq(members.userId, userId))
      .orderBy(asc(members.createdAt))
      .limit(1);

    if (!member) {
      return null;
    }

    await this.db
      .update(sessions)
      .set({ activeOrganizationId: member.organizationId })
      .where(eq(sessions.id, sessionId));

    return member.organizationId;
  }
}
