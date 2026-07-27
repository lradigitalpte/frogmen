import { Module } from "@nestjs/common";
import { OrganizationModule } from "../organization/organization.module";
import { MeController } from "./me.controller";
import { SecurityModule } from "../security/security.module";

@Module({
  imports: [OrganizationModule, SecurityModule],
  controllers: [MeController],
})
export class MeModule {}
