import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  RequireActiveOrg,
  Session,
  type UserSession,
} from "@thallesp/nestjs-better-auth";
import { WarehousesService } from "./warehouses.service";
import type {
  CreateWarehouseDto,
  ListWarehousesQuery,
  UpdateWarehouseDto,
} from "./dto/warehouse.dto";

@Controller("v1/warehouses")
@RequireActiveOrg()
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  private orgId(session: UserSession) {
    const organizationId = session.session.activeOrganizationId;

    if (!organizationId) {
      throw new Error("Active organization is required");
    }

    return organizationId;
  }

  @Get()
  list(@Session() session: UserSession, @Query() query: ListWarehousesQuery) {
    return this.warehousesService.list(this.orgId(session), {
      search: query.search,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
      archived:
        String(query.archived) === "true" || query.archived === true,
      page: query.page ? Number(query.page) : undefined,
      perPage: query.perPage ? Number(query.perPage) : undefined,
    });
  }

  @Get(":id")
  get(@Session() session: UserSession, @Param("id") id: string) {
    return this.warehousesService.getById(this.orgId(session), id);
  }

  @Post()
  create(@Session() session: UserSession, @Body() body: CreateWarehouseDto) {
    return this.warehousesService.create(this.orgId(session), body);
  }

  @Patch(":id")
  update(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Body() body: UpdateWarehouseDto,
  ) {
    return this.warehousesService.update(this.orgId(session), id, body);
  }

  @Delete(":id")
  archive(@Session() session: UserSession, @Param("id") id: string) {
    return this.warehousesService.archive(this.orgId(session), id);
  }

  @Post(":id/restore")
  restore(@Session() session: UserSession, @Param("id") id: string) {
    return this.warehousesService.restore(this.orgId(session), id);
  }
}
