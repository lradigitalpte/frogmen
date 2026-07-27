import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import {
  RequireActiveOrg,
  Session,
  type UserSession,
} from "@thallesp/nestjs-better-auth";
import { WarrantiesService } from "./warranties.service";
import type {
  CreateWarrantyDto,
  ListWarrantiesQuery,
  SearchSalesQuery,
} from "./dto/warranty.dto";

@Controller("v1/warranties")
@RequireActiveOrg()
export class WarrantiesController {
  constructor(private readonly warrantiesService: WarrantiesService) {}

  private orgId(session: UserSession) {
    const organizationId = session.session.activeOrganizationId;

    if (!organizationId) {
      throw new Error("Active organization is required");
    }

    return organizationId;
  }

  @Get("search-sales")
  searchSales(
    @Session() session: UserSession,
    @Query() query: SearchSalesQuery,
  ) {
    return this.warrantiesService.searchSales(this.orgId(session), {
      search: query.search,
      page: query.page ? Number(query.page) : undefined,
      perPage: query.perPage ? Number(query.perPage) : undefined,
    });
  }

  @Get()
  list(@Session() session: UserSession, @Query() query: ListWarrantiesQuery) {
    return this.warrantiesService.list(this.orgId(session), {
      search: query.search,
      status: query.status,
      productId: query.productId,
      productUnitId: query.productUnitId,
      expiringSoon:
        query.expiringSoon === "true" || query.expiringSoon === true,
      page: query.page ? Number(query.page) : undefined,
      perPage: query.perPage ? Number(query.perPage) : undefined,
    });
  }

  @Get(":id")
  getById(@Session() session: UserSession, @Param("id") id: string) {
    return this.warrantiesService.getById(this.orgId(session), id);
  }

  @Post()
  create(@Session() session: UserSession, @Body() body: CreateWarrantyDto) {
    return this.warrantiesService.createManual(this.orgId(session), body);
  }
}
