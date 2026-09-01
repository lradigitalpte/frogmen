import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { UploadsModule } from "../uploads/uploads.module";
import { SettingsController } from "./settings.controller";
import { SettingsService } from "./settings.service";
import { CompanyVaultController } from "./company-vault.controller";
import { CompanyVaultService } from "./company-vault.service";

@Module({
  imports: [DatabaseModule, UploadsModule],
  controllers: [SettingsController, CompanyVaultController],
  providers: [SettingsService, CompanyVaultService],
  exports: [SettingsService, CompanyVaultService],
})
export class SettingsModule {}