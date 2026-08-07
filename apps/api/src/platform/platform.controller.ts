import { Body, Controller, Delete, Get, Param, UseGuards } from "@nestjs/common";
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
    @Param("id") id: string,
    @Body() body: { confirmSlug?: string },
  ) {
    return this.platformService.deleteOrganization({
      organizationId: id,
      confirmSlug: body.confirmSlug ?? "",
    });
  }
}
