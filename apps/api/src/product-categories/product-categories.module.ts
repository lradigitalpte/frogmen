import { Module } from "@nestjs/common";
import { OrgInventoryModule } from "../inventory/org-inventory.module";
import { ProductCategoriesController } from "./product-categories.controller";
import { ProductCategoriesService } from "./product-categories.service";

@Module({
  imports: [OrgInventoryModule],
  controllers: [ProductCategoriesController],
  providers: [ProductCategoriesService],
  exports: [ProductCategoriesService],
})
export class ProductCategoriesModule {}
