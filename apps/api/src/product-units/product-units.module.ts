import { Module } from "@nestjs/common";
import { ProductsModule } from "../products/products.module";
import { ProductCostEventsModule } from "../product-cost-events/product-cost-events.module";
import { SecurityModule } from "../security/security.module";
import { StockModule } from "../stock/stock.module";
import { WarehousesModule } from "../warehouses/warehouses.module";
import { ProductUnitsController } from "./product-units.controller";
import { ProductUnitsService } from "./product-units.service";

@Module({
  imports: [ProductsModule, ProductCostEventsModule, WarehousesModule, StockModule, SecurityModule],
  controllers: [ProductUnitsController],
  providers: [ProductUnitsService],
  exports: [ProductUnitsService],
})
export class ProductUnitsModule {}
