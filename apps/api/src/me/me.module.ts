import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { OrgInventoryModule } from "../inventory/org-inventory.module";
import { OrganizationModule } from "../organization/organization.module";
import { MeController } from "./me.controller";
import { SecurityModule } from "../security/security.module";

@Module({
  imports: [DatabaseModule, OrganizationModule, SecurityModule, OrgInventoryModule],
  controllers: [MeController],
})
export class MeModule {}
