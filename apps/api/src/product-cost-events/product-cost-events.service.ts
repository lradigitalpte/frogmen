import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import {
  productCostEvents,
  type Database,
  type ProductCostEvent,
} from "@frog1/db";
import { resolveDeliveryFee, roundMoney } from "@frog1/shared";
import { DATABASE } from "../database/database.constants";

export type ProductCostEventType =
  | "po_receipt"
  | "manual_edit"
  | "invoice_post";

export interface LogProductCostEventInput {
  organizationId: string;
  branchId?: string;
  productId: string;
  productUnitId?: string | null;
  eventType: ProductCostEventType;
  unitCost: string;
  previousUnitCost?: string | null;
  currencyCode?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  referenceLabel?: string | null;
  message?: string | null;
  metadata?: Record<string, unknown> | null;
  userId?: string | null;
}

export interface PoReceiptCostEventInput {
  organizationId: string;
  branchId: string;
  productId: string;
  productUnitId?: string | null;
  previousUnitCost: string | null;
  landedUnitCost: number;
  currencyCode: string;
  purchaseOrderId: string;
  purchaseOrderNumber: string;
  goodsReceiptId: string;
  goodsReceiptNumber: string;
  vendorName: string;
  lineUnitPrice: string;
  poLines: Array<{
    id: string;
    priceSubtotal: string | null;
    quantity: string | null;
  }>;
  poLineId: string;
  freightAmount: string | null;
  freightPercent: string | null;
  otherChargesAmount: string | null;
  serialNumber?: string | null;
  userId?: string | null;
}

@Injectable()
export class ProductCostEventsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async logEvent(input: LogProductCostEventInput) {
    await this.db.insert(productCostEvents).values({
      organizationId: input.organizationId,
      ...(input.branchId ? { branchId: input.branchId } : {}),
      productId: input.productId,
      productUnitId: input.productUnitId ?? null,
      eventType: input.eventType,
      unitCost: input.unitCost,
      previousUnitCost: input.previousUnitCost ?? null,
      currencyCode: input.currencyCode ?? null,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      referenceLabel: input.referenceLabel ?? null,
      message: input.message ?? null,
      metadata: input.metadata ?? null,
      userId: input.userId ?? null,
    });
  }

  async logPoReceipt(input: PoReceiptCostEventInput) {
    const lineNet = input.poLines.reduce(
      (sum, line) => sum + Number(line.priceSubtotal),
      0,
    );
    const poLine = input.poLines.find((line) => line.id === input.poLineId);
    const freight = resolveDeliveryFee(
      lineNet,
      input.freightAmount,
      input.freightPercent,
    );
    const other = Number(input.otherChargesAmount ?? 0) || 0;
    const quantity = Number(poLine?.quantity) || 1;
    const lineSubtotal = Number(poLine?.priceSubtotal);
    const lineShare = lineNet > 0 ? lineSubtotal / lineNet : 0;
    const freightAllocated = roundMoney((freight * lineShare) / quantity);
    const otherAllocated = roundMoney((other * lineShare) / quantity);

    await this.logEvent({
      organizationId: input.organizationId,
      branchId: input.branchId,
      productId: input.productId,
      productUnitId: input.productUnitId ?? null,
      eventType: "po_receipt",
      unitCost: String(roundMoney(input.landedUnitCost)),
      previousUnitCost: input.previousUnitCost,
      currencyCode: input.currencyCode,
      referenceType: "goods_receipt",
      referenceId: input.goodsReceiptId,
      referenceLabel: input.goodsReceiptNumber,
      message: input.serialNumber
        ? `Landed cost set from ${input.goodsReceiptNumber} · S/N ${input.serialNumber}`
        : `Landed cost set from ${input.goodsReceiptNumber}`,
      metadata: {
        purchaseOrderId: input.purchaseOrderId,
        purchaseOrderNumber: input.purchaseOrderNumber,
        goodsReceiptId: input.goodsReceiptId,
        goodsReceiptNumber: input.goodsReceiptNumber,
        vendorName: input.vendorName,
        lineUnitPrice: input.lineUnitPrice,
        freightAllocated: String(freightAllocated),
        otherChargesAllocated: String(otherAllocated),
        landedUnitCost: String(roundMoney(input.landedUnitCost)),
        serialNumber: input.serialNumber ?? null,
      },
      userId: input.userId ?? null,
    });
  }

  async listForUnit(
    organizationId: string,
    unit: { id: string; productId: string },
    limit = 50,
  ) {
    const rows = await this.db
      .select()
      .from(productCostEvents)
      .where(
        and(
          eq(productCostEvents.organizationId, organizationId),
          or(
            eq(productCostEvents.productUnitId, unit.id),
            and(
              eq(productCostEvents.productId, unit.productId),
              isNull(productCostEvents.productUnitId),
            ),
          ),
        ),
      )
      .orderBy(desc(productCostEvents.createdAt))
      .limit(limit);

    return rows.map((row) => this.mapEvent(row));
  }

  private mapEvent(row: ProductCostEvent) {
    return {
      id: row.id,
      eventType: row.eventType,
      unitCost: row.unitCost,
      previousUnitCost: row.previousUnitCost,
      currencyCode: row.currencyCode,
      referenceType: row.referenceType,
      referenceId: row.referenceId,
      referenceLabel: row.referenceLabel,
      message: row.message,
      metadata: row.metadata ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
