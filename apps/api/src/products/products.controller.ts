import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  RequireActiveOrg,
  Session,
  type UserSession,
} from "@thallesp/nestjs-better-auth";
import { CurrentSecurity } from "../security/current-security.decorator";
import type { SecurityContext } from "../security/security-context";
import { ProductsService } from "./products.service";
import { ProductTransferService } from "./product-transfer.service";
import type {
  CreateProductDto,
  ListProductsQuery,
  UpdateProductDto,
} from "./dto/product.dto";

@Controller("v1/products")
@RequireActiveOrg()
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly productTransfer: ProductTransferService,
  ) {}

  private orgId(session: UserSession) {
    const organizationId = session.session.activeOrganizationId;

    if (!organizationId) {
      throw new Error("Active organization is required");
    }

    return organizationId;
  }

  @Get()
  list(@Session() session: UserSession, @Query() query: ListProductsQuery) {
    return this.productsService.list(this.orgId(session), {
      type: query.type,
      parentId: query.parentId,
      rootOnly:
        String(query.rootOnly) === "true" || query.rootOnly === true,
      forSaleOnly:
        String(query.forSaleOnly) === "true" || query.forSaleOnly === true,
      usageType: query.usageType,
      isRovEquipment:
        query.isRovEquipment === undefined
          ? undefined
          : String(query.isRovEquipment) === "true" ||
            query.isRovEquipment === true,
      search: query.search,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
      archived:
        String(query.archived) === "true" || query.archived === true,
      includeStock:
        String(query.includeStock) === "true" || query.includeStock === true,
      inStockOnly:
        String(query.inStockOnly) === "true" || query.inStockOnly === true,
      page: query.page ? Number(query.page) : undefined,
      perPage: query.perPage ? Number(query.perPage) : undefined,
    });
  }

  @Get("suggest-reference")
  suggestReference(
    @Session() session: UserSession,
    @Query("name") name: string,
  ) {
    return this.productsService.suggestReference(this.orgId(session), name);
  }

  @Post("transfer/export")
  async exportTransfer(
    @Session() session: UserSession,
    @Body() body: { productIds?: string[]; fields?: Array<"description" | "barcode" | "sellingPrice" | "costPrice" | "category" | "tags" | "dimensions" | "images"> },
  ) {
    const result = await this.productTransfer.exportPackage(this.orgId(session), body);
    return new StreamableFile(result.buffer, {
      type: "application/zip",
      disposition: `attachment; filename="frog1-product-catalog-${new Date().toISOString().slice(0, 10)}.zip"`,
      length: result.buffer.length,
    });
  }

  @Post("transfer/preview")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 100 * 1024 * 1024 } }))
  previewTransfer(@Session() session: UserSession, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new Error("Transfer package is required");
    return this.productTransfer.preview(this.orgId(session), file.buffer);
  }

  @Post("transfer/apply")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 100 * 1024 * 1024 } }))
  applyTransfer(
    @Session() session: UserSession,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { existingStrategy?: "skip" | "update"; createCategories?: string; includeCost?: string },
  ) {
    if (!file) throw new Error("Transfer package is required");
    return this.productTransfer.apply(this.orgId(session), file.buffer, {
      existingStrategy: body.existingStrategy,
      createCategories: body.createCategories !== "false",
      includeCost: body.includeCost === "true",
    });
  }

  @Get(":id/sub-products")
  listSubProducts(
    @Session() session: UserSession,
    @Param("id") id: string,
  ) {
    return this.productsService.listSubProducts(this.orgId(session), id);
  }

  @Get(":id")
  get(@Session() session: UserSession, @Param("id") id: string) {
    return this.productsService.getDetail(this.orgId(session), id);
  }

  @Post()
  create(
    @Session() session: UserSession,
    @CurrentSecurity() security: SecurityContext,
    @Body() body: CreateProductDto,
  ) {
    return this.productsService.create(this.orgId(session), body, {
      activeBranchId: security.activeBranchId,
      branchScope: security.branchScope,
    });
  }

  @Patch(":id")
  update(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Body() body: UpdateProductDto,
  ) {
    return this.productsService.update(
      this.orgId(session),
      id,
      body,
      session.user.id,
    );
  }

  @Delete(":id/permanent")
  permanentlyDelete(
    @Session() session: UserSession,
    @Param("id") id: string,
  ) {
    return this.productsService.permanentlyDelete(this.orgId(session), id);
  }

  @Delete(":id")
  archive(@Session() session: UserSession, @Param("id") id: string) {
    return this.productsService.archive(this.orgId(session), id);
  }

  @Post(":id/restore")
  restore(@Session() session: UserSession, @Param("id") id: string) {
    return this.productsService.restore(this.orgId(session), id);
  }

  @Post(":id/images")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadImage(
    @Session() session: UserSession,
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.productsService.addImage(this.orgId(session), id, file);
  }

  @Delete(":id/images")
  removeImage(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Body() body: { imagePath: string },
  ) {
    return this.productsService.removeImage(
      this.orgId(session),
      id,
      body.imagePath,
    );
  }
}
