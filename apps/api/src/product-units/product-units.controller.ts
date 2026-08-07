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
import { ProductUnitsService } from "./product-units.service";
import { StockService } from "../stock/stock.service";
import type {
  CreateProductUnitDto,
  LinkProductUnitDto,
  ListLinkableUnitsQuery,
  ListProductUnitsQuery,
  RemoveProductUnitDto,
  UpdateProductUnitDto,
} from "./dto/product-unit.dto";

@Controller()
@RequireActiveOrg()
export class ProductUnitsController {
  constructor(
    private readonly productUnitsService: ProductUnitsService,
    private readonly stockService: StockService,
  ) {}

  private orgId(session: UserSession) {
    const organizationId = session.session.activeOrganizationId;

    if (!organizationId) {
      throw new Error("Active organization is required");
    }

    return organizationId;
  }

  @Get("v1/products/:productId/stock")
  getProductStock(
    @Session() session: UserSession,
    @Param("productId") productId: string,
  ) {
    return this.stockService.getProductStock(this.orgId(session), productId);
  }

  @Get("v1/products/:productId/units")
  listByProduct(
    @Session() session: UserSession,
    @Param("productId") productId: string,
    @Query() query: ListProductUnitsQuery,
  ) {
    return this.productUnitsService.listByProduct(
      this.orgId(session),
      productId,
      {
        warehouseId: query.warehouseId,
        status: query.status,
        search: query.search,
        page: query.page ? Number(query.page) : undefined,
        perPage: query.perPage ? Number(query.perPage) : undefined,
      },
    );
  }

  @Post("v1/products/:productId/units")
  create(
    @Session() session: UserSession,
    @Param("productId") productId: string,
    @Body() body: CreateProductUnitDto,
  ) {
    return this.productUnitsService.create(
      this.orgId(session),
      productId,
      body,
    );
  }

  @Get("v1/units/linkable")
  listLinkable(
    @Session() session: UserSession,
    @Query() query: ListLinkableUnitsQuery,
  ) {
    return this.productUnitsService.listLinkable(this.orgId(session), {
      parentProductId: query.parentProductId,
      search: query.search,
      page: query.page ? Number(query.page) : undefined,
      perPage: query.perPage ? Number(query.perPage) : undefined,
    });
  }

  @Get("v1/units/:id")
  get(@Session() session: UserSession, @Param("id") id: string) {
    return this.productUnitsService.getById(this.orgId(session), id);
  }

  @Patch("v1/units/:id")
  update(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Body() body: UpdateProductUnitDto,
  ) {
    return this.productUnitsService.update(this.orgId(session), id, body);
  }

  @Post("v1/units/:id/link")
  link(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Body() body: LinkProductUnitDto,
  ) {
    return this.productUnitsService.link(this.orgId(session), id, body);
  }

  @Delete("v1/units/:id/link")
  unlink(@Session() session: UserSession, @Param("id") id: string) {
    return this.productUnitsService.unlink(this.orgId(session), id);
  }

  @Delete("v1/units/:id")
  remove(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Body() body: RemoveProductUnitDto,
  ) {
    return this.productUnitsService.remove(
      this.orgId(session),
      id,
      body?.reason === "sold" ? "sold" : "scrapped",
    );
  }
}
