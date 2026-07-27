import { Module } from "@nestjs/common";
import { WarrantyPoliciesController } from "./warranty-policies.controller";
import { WarrantyPoliciesService } from "./warranty-policies.service";
import { WarrantiesController } from "./warranties.controller";
import { WarrantiesService } from "./warranties.service";

@Module({
  controllers: [WarrantyPoliciesController, WarrantiesController],
  providers: [WarrantyPoliciesService, WarrantiesService],
  exports: [WarrantyPoliciesService, WarrantiesService],
})
export class WarrantyModule {}
