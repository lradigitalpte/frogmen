import { Inject, Injectable } from "@nestjs/common";
import type { Database } from "@frog1/db";
import { RAW_DATABASE } from "../database/database.constants";
import { provisionOrgInventory } from "./org-inventory-seed";

@Injectable()
export class OrgInventoryService {
  constructor(@Inject(RAW_DATABASE) private readonly db: Database) {}

  provision(organizationId: string) {
    return provisionOrgInventory(this.db, organizationId);
  }
}
