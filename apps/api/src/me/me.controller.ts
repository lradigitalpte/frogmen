import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Post,
} from "@nestjs/common";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import type { Database } from "@frog1/db";
import {
  clearMustChangePassword,
  findUserAuthFlags,
  updateUserCredentialPassword,
} from "../auth/provision-user";
import { DATABASE } from "../database/database.constants";
import { OrganizationContextService } from "../organization/organization-context.service";
import { SecurityContextService } from "../security/security-context.service";
import { OrgInventoryService } from "../inventory/org-inventory.service";

@Controller("v1/me")
export class MeController {
  constructor(
    private readonly organizationContext: OrganizationContextService,
    private readonly securityContext: SecurityContextService,
    private readonly orgInventory: OrgInventoryService,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  @Get()
  async getMe(@Session() session: UserSession) {
    const activeOrganizationId =
      await this.organizationContext.ensureActiveOrganization(
        session.session.id,
        session.user.id,
        session.session.activeOrganizationId,
      );

    const security = activeOrganizationId
      ? await this.securityContext.resolve({
          sessionId: session.session.id,
          userId: session.user.id,
          organizationId: activeOrganizationId,
          activeBranchId: (
            session.session as typeof session.session & {
              activeBranchId?: string | null;
            }
          ).activeBranchId,
          branchScope: (
            session.session as typeof session.session & {
              branchScope?: string | null;
            }
          ).branchScope,
        })
      : null;

    const authFlags = await findUserAuthFlags(this.db, session.user.id);

    return {
      user: {
        ...session.user,
        mustChangePassword: authFlags?.mustChangePassword ?? false,
      },
      session: {
        id: session.session.id,
        activeOrganizationId,
        expiresAt: session.session.expiresAt,
      },
      security,
    };
  }

  @Post("set-initial-password")
  async setInitialPassword(
    @Session() session: UserSession,
    @Body() body: { newPassword?: string },
  ) {
    const authFlags = await findUserAuthFlags(this.db, session.user.id);
    if (!authFlags?.mustChangePassword) {
      throw new ForbiddenException("Password change is not required");
    }

    const newPassword = body.newPassword?.trim() ?? "";
    if (newPassword.length < 8) {
      throw new BadRequestException(
        "New password must be at least 8 characters",
      );
    }

    await updateUserCredentialPassword(this.db, session.user.id, newPassword);
    await clearMustChangePassword(this.db, session.user.id);

    return { success: true };
  }

  @Post("ensure-organization")
  async ensureOrganization(@Session() session: UserSession) {
    const activeOrganizationId =
      await this.organizationContext.ensureActiveOrganization(
        session.session.id,
        session.user.id,
        session.session.activeOrganizationId,
      );

    if (!activeOrganizationId) {
      throw new ForbiddenException("No organization found for this account");
    }

    await this.orgInventory.provision(activeOrganizationId);

    return { activeOrganizationId };
  }
}
