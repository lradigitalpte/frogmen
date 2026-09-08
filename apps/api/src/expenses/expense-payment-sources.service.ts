import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, isNull } from "drizzle-orm";
import { expensePaymentSources, type Database } from "@frog1/db";
import { DATABASE } from "../database/database.constants";

@Injectable()
export class ExpensePaymentSourcesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  list(organizationId: string) {
    return this.db.select().from(expensePaymentSources).where(and(eq(expensePaymentSources.organizationId, organizationId), isNull(expensePaymentSources.deletedAt))).orderBy(asc(expensePaymentSources.name));
  }
  async create(organizationId: string, input: { name: string; lastFour?: string }) {
    const [created] = await this.db.insert(expensePaymentSources).values({ organizationId, ...this.validate(input) }).returning();
    return created;
  }
  async update(organizationId: string, id: string, input: { name: string; lastFour?: string }) {
    const [updated] = await this.db.update(expensePaymentSources).set({ ...this.validate(input), updatedAt: new Date() }).where(and(eq(expensePaymentSources.id, id), eq(expensePaymentSources.organizationId, organizationId), isNull(expensePaymentSources.deletedAt))).returning();
    if (!updated) throw new NotFoundException("Payment source not found");
    return updated;
  }
  async remove(organizationId: string, id: string) {
    const [removed] = await this.db.update(expensePaymentSources).set({ deletedAt: new Date(), updatedAt: new Date() }).where(and(eq(expensePaymentSources.id, id), eq(expensePaymentSources.organizationId, organizationId), isNull(expensePaymentSources.deletedAt))).returning();
    if (!removed) throw new NotFoundException("Payment source not found");
    return removed;
  }
  private validate(input: { name: string; lastFour?: string }) {
    const name = input.name?.trim().replace(/\s+/g, " ");
    const lastFour = input.lastFour?.trim() || null;
    if (!name) throw new BadRequestException("Name is required");
    if (lastFour && !/^\d{4}$/.test(lastFour)) throw new BadRequestException("Last four must contain four digits");
    return { name, lastFour };
  }
}
