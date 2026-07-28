import { Module } from "@nestjs/common";
import { CurrenciesModule } from "../currencies/currencies.module";
import { VendorsModule } from "../vendors/vendors.module";
import { ProductsModule } from "../products/products.module";
import { WarehousesModule } from "../warehouses/warehouses.module";
import { StockModule } from "../stock/stock.module";
import { ProductUnitsModule } from "../product-units/product-units.module";
import { PurchaseOrdersController } from "./purchase-orders.controller";
import { PurchaseOrdersService } from "./purchase-orders.service";
import { DocumentsModule } from "../documents/documents.module";
import { MailModule } from "../mail/mail.module";
import { SettingsModule } from "../settings/settings.module";

@Module({
  imports: [
    CurrenciesModule,
    VendorsModule,
    ProductsModule,
    WarehousesModule,
    StockModule,
    ProductUnitsModule,
    DocumentsModule,
    MailModule,
    SettingsModule,
  ],
  controllers: [PurchaseOrdersController],
  providers: [PurchaseOrdersService],
  exports: [PurchaseOrdersService],
})
export class PurchaseOrdersModule {}
