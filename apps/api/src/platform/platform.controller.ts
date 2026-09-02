import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { PlatformAdminGuard } from "./platform-admin.guard";
import { PlatformService } from "./platform.service";

@Controller("v1/platform")
@UseGuards(PlatformAdminGuard)
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  @Get("organizations")
  listOrganizations() {
    return this.platformService.listOrganizations();
  }

  @Delete("organizations/:id")
  deleteOrganization(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Body() body: { confirmSlug?: string },
  ) {
    return this.platformService.deleteOrganization({
      organizationId: id,
      confirmSlug: body.confirmSlug ?? "",
      actorUserId: session.user.id,
    });
  }

  @Post("organizations/:id/members/:userId/reset-password")
  resetOrganizationUserPassword(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Param("userId") userId: string,
  ) {
    return this.platformService.resetOrganizationUserPassword({
      organizationId: id,
      userId,
      actorUserId: session.user.id,
    });
  }
}
