import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { UploadsModule } from "../uploads/uploads.module";
import { PlatformAdminGuard } from "./platform-admin.guard";
import { PlatformBackupsController } from "./platform-backups.controller";
import { PlatformBackupsService } from "./platform-backups.service";
import { PlatformController } from "./platform.controller";
import { PlatformService } from "./platform.service";

@Module({
  imports: [DatabaseModule, UploadsModule],
  controllers: [PlatformController, PlatformBackupsController],
  providers: [PlatformService, PlatformBackupsService, PlatformAdminGuard],
})
export class PlatformModule {}
