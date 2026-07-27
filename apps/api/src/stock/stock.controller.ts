import { Body, Controller, Get, Patch, Query } from "@nestjs/common";
import {
  RequireActiveOrg,
  Session,
  type UserSession,
} from "@thallesp/nestjs-better-auth";
import { StockService } from "./stock.service";
import type { AdjustStockDto, ListStockQuery } from "./dto/stock.dto";

@Controller("v1/stock")
@RequireActiveOrg()
export class StockController {
  constructor(private readonly stockService: StockService) {}

  private orgId(session: UserSession) {
    const organizationId = session.session.activeOrganizationId;

    if (!organizationId) {
      throw new Error("Active organization is required");
    }

    return organizationId;
  }

  @Get()
  list(@Session() session: UserSession, @Query() query: ListStockQuery) {
    return this.stockService.list(this.orgId(session), {
      productId: query.productId,
      warehouseId: query.warehouseId,
      search: query.search,
      page: query.page ? Number(query.page) : undefined,
      perPage: query.perPage ? Number(query.perPage) : undefined,
    });
  }

  @Patch()
  adjust(@Session() session: UserSession, @Body() body: AdjustStockDto) {
    return this.stockService.adjust(this.orgId(session), body);
  }
}
