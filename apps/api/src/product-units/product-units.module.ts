import { Module } from "@nestjs/common";
import { ProductsModule } from "../products/products.module";
import { StockModule } from "../stock/stock.module";
import { WarehousesModule } from "../warehouses/warehouses.module";
import { ProductUnitsController } from "./product-units.controller";
import { ProductUnitsService } from "./product-units.service";

@Module({
  imports: [ProductsModule, WarehousesModule, StockModule],
  controllers: [ProductUnitsController],
  providers: [ProductUnitsService],
  exports: [ProductUnitsService],
})
export class ProductUnitsModule {}
