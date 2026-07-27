import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import {
  RequireActiveOrg,
  Session,
  type UserSession,
} from "@thallesp/nestjs-better-auth";
import { ProductCategoriesService } from "./product-categories.service";
import type {
  CreateProductCategoryDto,
  ListProductCategoriesQuery,
} from "./dto/product-category.dto";

@Controller("v1/product-categories")
@RequireActiveOrg()
export class ProductCategoriesController {
  constructor(
    private readonly productCategoriesService: ProductCategoriesService,
  ) {}

  private orgId(session: UserSession) {
    const organizationId = session.session.activeOrganizationId;

    if (!organizationId) {
      throw new Error("Active organization is required");
    }

    return organizationId;
  }

  @Get()
  list(
    @Session() session: UserSession,
    @Query() query: ListProductCategoriesQuery,
  ) {
    return this.productCategoriesService.list(this.orgId(session), {
      search: query.search,
      page: query.page ? Number(query.page) : undefined,
      perPage: query.perPage ? Number(query.perPage) : undefined,
    });
  }

  @Post()
  create(
    @Session() session: UserSession,
    @Body() body: CreateProductCategoryDto,
  ) {
    return this.productCategoriesService.create(this.orgId(session), body);
  }

  @Delete(":id")
  archive(@Session() session: UserSession, @Param("id") id: string) {
    return this.productCategoriesService.archive(this.orgId(session), id);
  }
}
