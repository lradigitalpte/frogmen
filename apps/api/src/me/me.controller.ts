import { Controller, ForbiddenException, Get, Post } from "@nestjs/common";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { OrganizationContextService } from "../organization/organization-context.service";
import { SecurityContextService } from "../security/security-context.service";

@Controller("v1/me")
export class MeController {
  constructor(
    private readonly organizationContext: OrganizationContextService,
    private readonly securityContext: SecurityContextService,
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

    return {
      user: session.user,
      session: {
        id: session.session.id,
        activeOrganizationId,
        expiresAt: session.session.expiresAt,
      },
      security,
    };
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

    return { activeOrganizationId };
  }
}
