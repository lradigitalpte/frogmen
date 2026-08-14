import { Module } from "@nestjs/common";
import { UploadsModule } from "../uploads/uploads.module";
import { ProductCostEventsModule } from "../product-cost-events/product-cost-events.module";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";
import { ProductTransferService } from "./product-transfer.service";

@Module({
  imports: [UploadsModule, ProductCostEventsModule],
  controllers: [ProductsController],
  providers: [ProductsService, ProductTransferService],
  exports: [ProductsService],
})
export class ProductsModule {}
