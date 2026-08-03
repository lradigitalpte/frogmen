import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { OrgInventoryService } from "./org-inventory.service";

@Module({
  imports: [DatabaseModule],
  providers: [OrgInventoryService],
  exports: [OrgInventoryService],
})
export class OrgInventoryModule {}
