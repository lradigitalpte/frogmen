import "./load-env";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { resolve } from "node:path";
import { AuthModule } from "./auth/auth.module";
import { DatabaseModule } from "./database/database.module";
import { UploadsModule } from "./uploads/uploads.module";
import { CustomersModule } from "./customers/customers.module";
import { CurrenciesModule } from "./currencies/currencies.module";
import { SalesModule } from "./sales/sales.module";
import { WarehousesModule } from "./warehouses/warehouses.module";
import { ProductsModule } from "./products/products.module";
import { StockModule } from "./stock/stock.module";
import { ProductUnitsModule } from "./product-units/product-units.module";
import { HealthModule } from "./health/health.module";
import { MeModule } from "./me/me.module";
import { SettingsModule } from "./settings/settings.module";
import { InvoicesModule } from "./invoices/invoices.module";
import { AccountingModule } from "./accounting/accounting.module";
import { VendorsModule } from "./vendors/vendors.module";
import { PurchaseOrdersModule } from "./purchase-orders/purchase-orders.module";
import { ProductTagsModule } from "./product-tags/product-tags.module";
import { ProductCategoriesModule } from "./product-categories/product-categories.module";
import { WarrantyModule } from "./warranty/warranty.module";
import { RovInspectionModule } from "./rov-inspection/rov-inspection.module";
import { BankAccountsModule } from "./bank-accounts/bank-accounts.module";
import { ExpensesModule } from "./expenses/expenses.module";
import { SecurityModule } from "./security/security.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolve(__dirname, "../../../.env"),
    }),
    DatabaseModule,
    AuthModule,
    SecurityModule,
    HealthModule,
    MeModule,
    UploadsModule,
    CustomersModule,
    CurrenciesModule,
    SalesModule,
    InvoicesModule,
    AccountingModule,
    BankAccountsModule,
    ExpensesModule,
    VendorsModule,
    PurchaseOrdersModule,
    ProductTagsModule,
    ProductCategoriesModule,
    WarrantyModule,
    WarehousesModule,
    ProductsModule,
    StockModule,
    ProductUnitsModule,
    SettingsModule,
    RovInspectionModule,
  ],
})
export class AppModule {}
