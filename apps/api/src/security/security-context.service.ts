import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { and, asc, eq } from "drizzle-orm";
import {
  branchMembers,
  branches,
  members,
  sessions,
  type Database,
} from "@frog1/db";
import { DATABASE } from "../database/database.constants";
import { normalizeRole, permissionsForRole } from "./permissions";
import type { SecurityContext } from "./security-context";

@Injectable()
export class SecurityContextService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async resolve(input: {
    sessionId: string;
    userId: string;
    organizationId: string;
    activeBranchId?: string | null;
    branchScope?: string | null;
  }): Promise<SecurityContext> {
    const [persistedSession] = await this.db
      .select({
        activeBranchId: sessions.activeBranchId,
        branchScope: sessions.branchScope,
      })
      .from(sessions)
      .where(eq(sessions.id, input.sessionId))
      .limit(1);
    const persistedBranchId =
      persistedSession?.activeBranchId ?? input.activeBranchId;
    const persistedScope =
      persistedSession?.branchScope ?? input.branchScope;

    const [member] = await this.db
      .select()
      .from(members)
      .where(
        and(
          eq(members.organizationId, input.organizationId),
          eq(members.userId, input.userId),
        ),
      )
      .limit(1);

    if (!member) {
      throw new UnauthorizedException("Organization membership is required");
    }

    const role = normalizeRole(member.role);
    const canAccessAllBranches = role === "owner" || role === "admin";
    const availableBranches = canAccessAllBranches
      ? await this.db
          .select({
            id: branches.id,
            name: branches.name,
            code: branches.code,
            documentPrefix: branches.documentPrefix,
            isMain: branches.isMain,
          })
          .from(branches)
          .where(
            and(
              eq(branches.organizationId, input.organizationId),
              eq(branches.isActive, true),
            ),
          )
          .orderBy(asc(branches.name))
      : await this.db
          .select({
            id: branches.id,
            name: branches.name,
            code: branches.code,
            documentPrefix: branches.documentPrefix,
            isMain: branches.isMain,
          })
          .from(branchMembers)
          .innerJoin(branches, eq(branches.id, branchMembers.branchId))
          .where(
            and(
              eq(branchMembers.memberId, member.id),
              eq(branches.organizationId, input.organizationId),
              eq(branches.isActive, true),
            ),
          )
          .orderBy(asc(branches.name));

    if (availableBranches.length === 0) {
      throw new ForbiddenException("No active branch is assigned");
    }

    const requestedAll =
      persistedScope === "all" && canAccessAllBranches;
    let activeBranchId = requestedAll ? null : persistedBranchId ?? null;

    if (
      activeBranchId &&
      !availableBranches.some((branch) => branch.id === activeBranchId)
    ) {
      activeBranchId = null;
    }

    if (!requestedAll && !activeBranchId) {
      activeBranchId =
        availableBranches.find((branch) => branch.isMain)?.id ??
        availableBranches[0]!.id;
      await this.db
        .update(sessions)
        .set({ activeBranchId, branchScope: "single" })
        .where(eq(sessions.id, input.sessionId));
    }

    return {
      organizationId: input.organizationId,
      userId: input.userId,
      memberId: member.id,
      role,
      permissions: permissionsForRole(role),
      branchScope: requestedAll ? "all" : "single",
      activeBranchId,
      branches: availableBranches,
      canAccessAllBranches,
    };
  }
}
