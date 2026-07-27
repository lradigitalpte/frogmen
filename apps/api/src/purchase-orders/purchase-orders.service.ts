import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  isNull,
  lte,
  or,
  type SQL,
} from "drizzle-orm";
import {
  currencies,
  goodsReceiptLines,
  goodsReceipts,
  organizations,
  products,
  purchaseActivities,
  purchaseOrderLines,
  purchaseOrders,
  users,
  vendors,
  warehouses,
  type Database,
} from "@frog1/db";
import { DATABASE } from "../database/database.constants";
import { ExchangeRatesService } from "../currencies/exchange-rates.service";
import { VendorsService } from "../vendors/vendors.service";
import { ProductsService } from "../products/products.service";
import { WarehousesService } from "../warehouses/warehouses.service";
import { StockService } from "../stock/stock.service";
import { ProductUnitsService } from "../product-units/product-units.service";
import { nextDocumentNumber } from "../sales/document-sequences";
import {
  calculateLineAmounts,
  sumDocumentAmounts,
} from "../sales/sales-calculations";

export interface ListPurchaseOrdersQuery {
  state?: "draft" | "confirmed" | "cancelled";
  receiptStatus?: "none" | "to_receive" | "partial" | "received";
  vendorId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  perPage?: number;
  sortBy?: "number" | "orderDate" | "amountTotal" | "createdAt";
  sortDir?: "asc" | "desc";
}

export interface CreatePurchaseOrderInput {
  vendorId: string;
  currencyId: string;
  orderDate: string;
  expectedDate?: string;
  vendorReference?: string;
  internalReference?: string;
  notes?: string;
}

export interface UpdatePurchaseOrderInput {
  vendorId?: string;
  currencyId?: string;
  orderDate?: string;
  expectedDate?: string | null;
  vendorReference?: string | null;
  internalReference?: string | null;
  notes?: string | null;
}

export interface AddPurchaseOrderLineInput {
  productId: string;
  warehouseId: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  taxRatePercent?: number;
}

export interface UpdatePurchaseOrderLineInput {
  warehouseId?: string;
  description?: string;
  quantity?: number;
  unitPrice?: number;
  discountPercent?: number;
  taxRatePercent?: number;
}

export interface UpdateGoodsReceiptLineInput {
  quantity: number;
  serialNumbers?: string[];
}

@Injectable()
export class PurchaseOrdersService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly exchangeRatesService: ExchangeRatesService,
    private readonly vendorsService: VendorsService,
    private readonly productsService: ProductsService,
    private readonly warehousesService: WarehousesService,
    private readonly stockService: StockService,
    private readonly productUnitsService: ProductUnitsService,
  ) {}

  async list(organizationId: string, query: ListPurchaseOrdersQuery) {
    const page = Math.max(query.page ?? 1, 1);
    const perPage = Math.min(Math.max(query.perPage ?? 16, 1), 100);
    const offset = (page - 1) * perPage;

    const filters: SQL[] = [
      eq(purchaseOrders.organizationId, organizationId),
      isNull(purchaseOrders.deletedAt),
    ];

    if (query.state) filters.push(eq(purchaseOrders.state, query.state));
    if (query.receiptStatus) {
      filters.push(eq(purchaseOrders.receiptStatus, query.receiptStatus));
    }
    if (query.vendorId) filters.push(eq(purchaseOrders.vendorId, query.vendorId));
    if (query.dateFrom) filters.push(gte(purchaseOrders.orderDate, query.dateFrom));
    if (query.dateTo) filters.push(lte(purchaseOrders.orderDate, query.dateTo));

    if (query.search?.trim()) {
      const term = `%${query.search.trim()}%`;
      filters.push(
        or(
          ilike(purchaseOrders.number, term),
          ilike(purchaseOrders.vendorReference, term),
          ilike(purchaseOrders.internalReference, term),
        )!,
      );
    }

    const whereClause = and(...filters);
    const sortColumn =
      query.sortBy === "orderDate"
        ? purchaseOrders.orderDate
        : query.sortBy === "amountTotal"
          ? purchaseOrders.amountTotal
          : query.sortBy === "createdAt"
            ? purchaseOrders.createdAt
            : purchaseOrders.number;
    const orderBy =
      query.sortDir === "desc" ? desc(sortColumn) : asc(sortColumn);

    const [rows, totalResult] = await Promise.all([
      this.db
        .select({
          order: purchaseOrders,
          vendorName: vendors.name,
          currencyCode: currencies.code,
        })
        .from(purchaseOrders)
        .innerJoin(vendors, eq(purchaseOrders.vendorId, vendors.id))
        .innerJoin(currencies, eq(purchaseOrders.currencyId, currencies.id))
        .where(whereClause)
        .orderBy(orderBy)
        .limit(perPage)
        .offset(offset),
      this.db
        .select({ total: count() })
        .from(purchaseOrders)
        .where(whereClause),
    ]);

    const total = Number(totalResult[0]?.total ?? 0);

    return {
      data: rows.map((row) => ({
        ...row.order,
        vendorName: row.vendorName,
        currencyCode: row.currencyCode,
      })),
      meta: {
        page,
        perPage,
        total,
        totalPages: Math.ceil(total / perPage) || 1,
      },
    };
  }

  async getById(organizationId: string, id: string) {
    const [header] = await this.db
      .select({
        order: purchaseOrders,
        vendorName: vendors.name,
        vendorEmail: vendors.email,
        currencyCode: currencies.code,
        currencySymbol: currencies.symbol,
      })
      .from(purchaseOrders)
      .innerJoin(vendors, eq(purchaseOrders.vendorId, vendors.id))
      .innerJoin(currencies, eq(purchaseOrders.currencyId, currencies.id))
      .where(
        and(
          eq(purchaseOrders.id, id),
          eq(purchaseOrders.organizationId, organizationId),
          isNull(purchaseOrders.deletedAt),
        ),
      )
      .limit(1);

    if (!header) {
      throw new NotFoundException("Purchase order not found");
    }

    const lines = await this.db
      .select({
        line: purchaseOrderLines,
        productName: products.name,
        productSku: products.sku,
        trackSerial: products.trackSerial,
        productType: products.type,
        warehouseName: warehouses.name,
      })
      .from(purchaseOrderLines)
      .leftJoin(products, eq(purchaseOrderLines.productId, products.id))
      .leftJoin(warehouses, eq(purchaseOrderLines.warehouseId, warehouses.id))
      .where(eq(purchaseOrderLines.purchaseOrderId, id))
      .orderBy(asc(purchaseOrderLines.lineNumber));

    const receipts = await this.db
      .select()
      .from(goodsReceipts)
      .where(
        and(
          eq(goodsReceipts.purchaseOrderId, id),
          eq(goodsReceipts.organizationId, organizationId),
        ),
      )
      .orderBy(desc(goodsReceipts.createdAt));

    const activities = await this.db
      .select({
        id: purchaseActivities.id,
        organizationId: purchaseActivities.organizationId,
        entityType: purchaseActivities.entityType,
        entityId: purchaseActivities.entityId,
        userId: purchaseActivities.userId,
        activityType: purchaseActivities.activityType,
        message: purchaseActivities.message,
        metadata: purchaseActivities.metadata,
        createdAt: purchaseActivities.createdAt,
        userName: users.name,
        userEmail: users.email,
      })
      .from(purchaseActivities)
      .leftJoin(users, eq(users.id, purchaseActivities.userId))
      .where(
        and(
          eq(purchaseActivities.organizationId, organizationId),
          eq(purchaseActivities.entityType, "purchase_order"),
          eq(purchaseActivities.entityId, id),
        ),
      )
      .orderBy(desc(purchaseActivities.createdAt));

    return {
      ...header.order,
      vendorName: header.vendorName,
      vendorEmail: header.vendorEmail,
      currencyCode: header.currencyCode,
      currencySymbol: header.currencySymbol,
      lines: lines.map((row) => ({
        ...row.line,
        productName: row.productName,
        productSku: row.productSku,
        trackSerial: row.trackSerial,
        productType: row.productType,
        warehouseName: row.warehouseName,
        qtyRemaining:
          Number(row.line.quantity) - Number(row.line.qtyReceived),
      })),
      receipts,
      activities,
    };
  }

  async create(
    organizationId: string,
    userId: string | undefined,
    input: CreatePurchaseOrderInput,
  ) {
    await this.vendorsService.getById(organizationId, input.vendorId);

    const number = await nextDocumentNumber(
      this.db,
      organizationId,
      "purchase_order",
      "PO-",
    );
    const exchangeRate = await this.resolveExchangeRate(
      organizationId,
      input.currencyId,
      input.orderDate,
    );

    const [order] = await this.db
      .insert(purchaseOrders)
      .values({
        organizationId,
        number,
        vendorId: input.vendorId,
        currencyId: input.currencyId,
        exchangeRate: String(exchangeRate),
        orderDate: input.orderDate,
        expectedDate: input.expectedDate ?? null,
        vendorReference: input.vendorReference ?? null,
        internalReference: input.internalReference ?? null,
        notes: input.notes ?? null,
        createdByUserId: userId ?? null,
      })
      .returning();

    await this.logActivity(
      organizationId,
      order.id,
      userId,
      "created",
      `Purchase order ${number} created`,
    );

    return this.getById(organizationId, order.id);
  }

  async update(
    organizationId: string,
    orderId: string,
    userId: string | undefined,
    input: UpdatePurchaseOrderInput,
  ) {
    const order = await this.getEditableOrder(organizationId, orderId);

    if (input.vendorId) {
      await this.vendorsService.getById(organizationId, input.vendorId);
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (input.vendorId !== undefined) updates.vendorId = input.vendorId;
    if (input.orderDate !== undefined) updates.orderDate = input.orderDate;
    if (input.expectedDate !== undefined) {
      updates.expectedDate = input.expectedDate;
    }
    if (input.vendorReference !== undefined) {
      updates.vendorReference = input.vendorReference;
    }
    if (input.internalReference !== undefined) {
      updates.internalReference = input.internalReference;
    }
    if (input.notes !== undefined) updates.notes = input.notes;

    if (
      input.currencyId !== undefined &&
      input.currencyId !== order.currencyId
    ) {
      updates.currencyId = input.currencyId;
      updates.exchangeRate = String(
        await this.resolveExchangeRate(
          organizationId,
          input.currencyId,
          input.orderDate ?? order.orderDate,
        ),
      );
    }

    await this.db
      .update(purchaseOrders)
      .set(updates)
      .where(eq(purchaseOrders.id, orderId));

    if (input.currencyId && input.currencyId !== order.currencyId) {
      await this.recomputeOrderTotals(organizationId, orderId, {
        currencyId: input.currencyId,
        exchangeRate: String(updates.exchangeRate),
        exchangeRateLockedAt: order.exchangeRateLockedAt,
      });
    }

    await this.logActivity(
      organizationId,
      orderId,
      userId,
      "updated",
      `Purchase order ${order.number} updated`,
    );

    return this.getById(organizationId, orderId);
  }

  async addLine(
    organizationId: string,
    orderId: string,
    input: AddPurchaseOrderLineInput,
  ) {
    const order = await this.getEditableOrder(organizationId, orderId);
    const product = await this.productsService.getById(
      organizationId,
      input.productId,
    );

    if (product.type === "service") {
      throw new BadRequestException(
        "Service products cannot be added to purchase orders",
      );
    }

    if (!product.isStorable) {
      throw new BadRequestException(
        "Only storable products can be purchased",
      );
    }

    await this.warehousesService.getById(organizationId, input.warehouseId);

    const amounts = calculateLineAmounts({
      quantity: input.quantity,
      unitPrice: input.unitPrice,
      discountPercent: input.discountPercent ?? 0,
      taxRatePercent: input.taxRatePercent ?? 0,
    });

    const [lastLine] = await this.db
      .select({ lineNumber: purchaseOrderLines.lineNumber })
      .from(purchaseOrderLines)
      .where(eq(purchaseOrderLines.purchaseOrderId, orderId))
      .orderBy(desc(purchaseOrderLines.lineNumber))
      .limit(1);

    const lineNumber = (lastLine?.lineNumber ?? 0) + 1;

    await this.db.insert(purchaseOrderLines).values({
      purchaseOrderId: orderId,
      lineNumber,
      productId: input.productId,
      warehouseId: input.warehouseId,
      description: input.description?.trim() || product.name,
      quantity: String(input.quantity),
      unitPrice: String(input.unitPrice),
      discountPercent: String(input.discountPercent ?? 0),
      taxRatePercent: String(input.taxRatePercent ?? 0),
      priceSubtotal: String(amounts.priceSubtotal),
      priceTax: String(amounts.priceTax),
      priceTotal: String(amounts.priceTotal),
    });

    await this.recomputeOrderTotals(organizationId, orderId, order);

    return this.getById(organizationId, orderId);
  }

  async updateLine(
    organizationId: string,
    orderId: string,
    lineId: string,
    input: UpdatePurchaseOrderLineInput,
  ) {
    const order = await this.getEditableOrder(organizationId, orderId);

    const [line] = await this.db
      .select()
      .from(purchaseOrderLines)
      .where(
        and(
          eq(purchaseOrderLines.id, lineId),
          eq(purchaseOrderLines.purchaseOrderId, orderId),
        ),
      )
      .limit(1);

    if (!line) {
      throw new NotFoundException("Line not found");
    }

    if (input.warehouseId) {
      await this.warehousesService.getById(organizationId, input.warehouseId);
    }

    const quantity = input.quantity ?? Number(line.quantity);
    const unitPrice = input.unitPrice ?? Number(line.unitPrice);
    const discountPercent =
      input.discountPercent ?? Number(line.discountPercent);
    const taxRatePercent =
      input.taxRatePercent ?? Number(line.taxRatePercent);

    const amounts = calculateLineAmounts({
      quantity,
      unitPrice,
      discountPercent,
      taxRatePercent,
    });

    await this.db
      .update(purchaseOrderLines)
      .set({
        ...(input.warehouseId !== undefined
          ? { warehouseId: input.warehouseId }
          : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        quantity: String(quantity),
        unitPrice: String(unitPrice),
        discountPercent: String(discountPercent),
        taxRatePercent: String(taxRatePercent),
        priceSubtotal: String(amounts.priceSubtotal),
        priceTax: String(amounts.priceTax),
        priceTotal: String(amounts.priceTotal),
        updatedAt: new Date(),
      })
      .where(eq(purchaseOrderLines.id, lineId));

    await this.recomputeOrderTotals(organizationId, orderId, order);

    return this.getById(organizationId, orderId);
  }

  async deleteLine(organizationId: string, orderId: string, lineId: string) {
    const order = await this.getEditableOrder(organizationId, orderId);

    const [line] = await this.db
      .select({ id: purchaseOrderLines.id })
      .from(purchaseOrderLines)
      .where(
        and(
          eq(purchaseOrderLines.id, lineId),
          eq(purchaseOrderLines.purchaseOrderId, orderId),
        ),
      )
      .limit(1);

    if (!line) {
      throw new NotFoundException("Line not found");
    }

    await this.db
      .delete(purchaseOrderLines)
      .where(eq(purchaseOrderLines.id, lineId));

    await this.recomputeOrderTotals(organizationId, orderId, order);

    return this.getById(organizationId, orderId);
  }

  async confirm(
    organizationId: string,
    orderId: string,
    userId: string | undefined,
  ) {
    const order = await this.getEditableOrder(organizationId, orderId);

    const lines = await this.db
      .select()
      .from(purchaseOrderLines)
      .where(eq(purchaseOrderLines.purchaseOrderId, orderId));

    if (lines.length === 0) {
      throw new BadRequestException("Add at least one line before confirming");
    }

    for (const line of lines) {
      if (!line.productId || !line.warehouseId) {
        throw new BadRequestException(
          "Each line must have a product and warehouse before confirming",
        );
      }
    }

    const exchangeRate = await this.resolveExchangeRate(
      organizationId,
      order.currencyId,
      order.orderDate,
    );
    const lockTime = new Date();

    await this.recomputeOrderTotals(organizationId, orderId, {
      currencyId: order.currencyId,
      exchangeRate: String(exchangeRate),
      exchangeRateLockedAt: lockTime,
    });

    await this.db
      .update(purchaseOrders)
      .set({
        state: "confirmed",
        receiptStatus: "to_receive",
        exchangeRate: String(exchangeRate),
        exchangeRateLockedAt: lockTime,
        confirmedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(purchaseOrders.id, orderId));

    await this.logActivity(
      organizationId,
      orderId,
      userId,
      "confirmed",
      `Purchase order ${order.number} confirmed`,
    );

    return this.getById(organizationId, orderId);
  }

  async cancel(
    organizationId: string,
    orderId: string,
    userId: string | undefined,
  ) {
    const order = await this.getById(organizationId, orderId);

    if (order.state === "cancelled") {
      throw new BadRequestException("Purchase order is already cancelled");
    }

    const hasReceived = order.lines.some(
      (line) => Number(line.qtyReceived) > 0,
    );

    if (hasReceived) {
      throw new BadRequestException(
        "Cannot cancel a purchase order with received quantities",
      );
    }

    await this.db
      .update(purchaseOrders)
      .set({ state: "cancelled", updatedAt: new Date() })
      .where(eq(purchaseOrders.id, orderId));

    await this.logActivity(
      organizationId,
      orderId,
      userId,
      "cancelled",
      `Purchase order ${order.number} cancelled`,
    );

    return this.getById(organizationId, orderId);
  }

  async delete(organizationId: string, orderId: string) {
    const order = await this.getById(organizationId, orderId);

    if (order.state !== "cancelled") {
      throw new BadRequestException(
        "Only cancelled purchase orders can be deleted. Cancel the purchase order first.",
      );
    }

    await this.db
      .update(purchaseOrders)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(purchaseOrders.id, orderId),
          eq(purchaseOrders.organizationId, organizationId),
        ),
      );

    return { success: true };
  }

  async addNote(
    organizationId: string,
    orderId: string,
    userId: string | undefined,
    message: string,
  ) {
    await this.getById(organizationId, orderId);

    await this.logActivity(
      organizationId,
      orderId,
      userId,
      "note",
      message.trim(),
    );

    return this.getById(organizationId, orderId);
  }

  async createReceipt(
    organizationId: string,
    orderId: string,
    userId: string | undefined,
  ) {
    const order = await this.getById(organizationId, orderId);

    if (order.state !== "confirmed") {
      throw new BadRequestException(
        "Only confirmed purchase orders can be received",
      );
    }

    if (order.receiptStatus === "received") {
      throw new BadRequestException("Purchase order is fully received");
    }

    const pendingLines = order.lines.filter((line) => line.qtyRemaining > 0);

    if (pendingLines.length === 0) {
      throw new BadRequestException("No remaining quantities to receive");
    }

    const number = await nextDocumentNumber(
      this.db,
      organizationId,
      "goods_receipt",
      "GR-",
    );

    const today = new Date().toISOString().slice(0, 10);

    const [receipt] = await this.db
      .insert(goodsReceipts)
      .values({
        organizationId,
        purchaseOrderId: orderId,
        number,
        receiptDate: today,
        createdByUserId: userId ?? null,
      })
      .returning();

    let lineNumber = 1;

    for (const line of pendingLines) {
      await this.db.insert(goodsReceiptLines).values({
        goodsReceiptId: receipt.id,
        purchaseOrderLineId: line.id,
        lineNumber: lineNumber++,
        productId: line.productId!,
        warehouseId: line.warehouseId!,
        quantity: String(line.qtyRemaining),
        serialNumbers: line.trackSerial ? [] : null,
      });
    }

    return this.getReceiptById(organizationId, receipt.id);
  }

  async listReceipts(organizationId: string, query: { page?: number; perPage?: number }) {
    const page = Math.max(query.page ?? 1, 1);
    const perPage = Math.min(Math.max(query.perPage ?? 16, 1), 100);
    const offset = (page - 1) * perPage;

    const whereClause = eq(goodsReceipts.organizationId, organizationId);

    const [rows, totalResult] = await Promise.all([
      this.db
        .select({
          receipt: goodsReceipts,
          purchaseOrderNumber: purchaseOrders.number,
          vendorName: vendors.name,
        })
        .from(goodsReceipts)
        .innerJoin(
          purchaseOrders,
          eq(goodsReceipts.purchaseOrderId, purchaseOrders.id),
        )
        .innerJoin(vendors, eq(purchaseOrders.vendorId, vendors.id))
        .where(whereClause)
        .orderBy(desc(goodsReceipts.createdAt))
        .limit(perPage)
        .offset(offset),
      this.db
        .select({ total: count() })
        .from(goodsReceipts)
        .where(whereClause),
    ]);

    const total = Number(totalResult[0]?.total ?? 0);

    return {
      data: rows.map((row) => ({
        ...row.receipt,
        purchaseOrderNumber: row.purchaseOrderNumber,
        vendorName: row.vendorName,
      })),
      meta: {
        page,
        perPage,
        total,
        totalPages: Math.ceil(total / perPage) || 1,
      },
    };
  }

  async getReceiptById(organizationId: string, receiptId: string) {
    const [header] = await this.db
      .select({
        receipt: goodsReceipts,
        purchaseOrderNumber: purchaseOrders.number,
        vendorName: vendors.name,
      })
      .from(goodsReceipts)
      .innerJoin(
        purchaseOrders,
        eq(goodsReceipts.purchaseOrderId, purchaseOrders.id),
      )
      .innerJoin(vendors, eq(purchaseOrders.vendorId, vendors.id))
      .where(
        and(
          eq(goodsReceipts.id, receiptId),
          eq(goodsReceipts.organizationId, organizationId),
        ),
      )
      .limit(1);

    if (!header) {
      throw new NotFoundException("Goods receipt not found");
    }

    const lines = await this.db
      .select({
        line: goodsReceiptLines,
        productName: products.name,
        productSku: products.sku,
        trackSerial: products.trackSerial,
        warehouseName: warehouses.name,
        poLineQuantity: purchaseOrderLines.quantity,
        poLineQtyReceived: purchaseOrderLines.qtyReceived,
      })
      .from(goodsReceiptLines)
      .innerJoin(products, eq(goodsReceiptLines.productId, products.id))
      .innerJoin(warehouses, eq(goodsReceiptLines.warehouseId, warehouses.id))
      .innerJoin(
        purchaseOrderLines,
        eq(goodsReceiptLines.purchaseOrderLineId, purchaseOrderLines.id),
      )
      .where(eq(goodsReceiptLines.goodsReceiptId, receiptId))
      .orderBy(asc(goodsReceiptLines.lineNumber));

    return {
      ...header.receipt,
      purchaseOrderNumber: header.purchaseOrderNumber,
      vendorName: header.vendorName,
      lines: lines.map((row) => ({
        ...row.line,
        productName: row.productName,
        productSku: row.productSku,
        trackSerial: row.trackSerial,
        warehouseName: row.warehouseName,
        poLineQuantity: row.poLineQuantity,
        poLineQtyReceived: row.poLineQtyReceived,
        qtyRemaining:
          Number(row.poLineQuantity) - Number(row.poLineQtyReceived),
      })),
    };
  }

  async updateReceipt(
    organizationId: string,
    receiptId: string,
    input: { receiptDate?: string; notes?: string | null },
  ) {
    const receipt = await this.getReceiptById(organizationId, receiptId);

    if (receipt.state !== "draft") {
      throw new BadRequestException("Only draft receipts can be edited");
    }

    await this.db
      .update(goodsReceipts)
      .set({
        ...(input.receiptDate !== undefined
          ? { receiptDate: input.receiptDate }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        updatedAt: new Date(),
      })
      .where(eq(goodsReceipts.id, receiptId));

    return this.getReceiptById(organizationId, receiptId);
  }

  async updateReceiptLine(
    organizationId: string,
    receiptId: string,
    lineId: string,
    input: UpdateGoodsReceiptLineInput,
  ) {
    const receipt = await this.getReceiptById(organizationId, receiptId);

    if (receipt.state !== "draft") {
      throw new BadRequestException("Only draft receipts can be edited");
    }

    const line = receipt.lines.find((item) => item.id === lineId);

    if (!line) {
      throw new NotFoundException("Receipt line not found");
    }

    if (input.quantity <= 0) {
      throw new BadRequestException("Quantity must be greater than zero");
    }

    if (input.quantity > line.qtyRemaining) {
      throw new BadRequestException(
        `Cannot receive more than ${line.qtyRemaining} remaining on this line`,
      );
    }

    if (line.trackSerial) {
      const serials = input.serialNumbers ?? [];

      if (serials.length !== input.quantity) {
        throw new BadRequestException(
          "Provide one serial number per unit received",
        );
      }

      const unique = new Set(serials.map((s) => s.trim()).filter(Boolean));

      if (unique.size !== serials.length) {
        throw new BadRequestException("Serial numbers must be unique");
      }
    }

    await this.db
      .update(goodsReceiptLines)
      .set({
        quantity: String(input.quantity),
        serialNumbers: line.trackSerial ? input.serialNumbers ?? [] : null,
      })
      .where(eq(goodsReceiptLines.id, lineId));

    return this.getReceiptById(organizationId, receiptId);
  }

  async validateReceipt(
    organizationId: string,
    receiptId: string,
    userId: string | undefined,
  ) {
    const receipt = await this.getReceiptById(organizationId, receiptId);

    if (receipt.state !== "draft") {
      throw new BadRequestException("Receipt is already validated");
    }

    if (receipt.lines.length === 0) {
      throw new BadRequestException("Receipt has no lines");
    }

    const order = await this.getById(organizationId, receipt.purchaseOrderId);

    for (const line of receipt.lines) {
      const qty = Number(line.quantity);

      if (qty <= 0) {
        throw new BadRequestException("All line quantities must be greater than zero");
      }

      if (qty > line.qtyRemaining) {
        throw new BadRequestException(
          `Cannot receive ${qty} — only ${line.qtyRemaining} remaining on PO line`,
        );
      }

      if (line.trackSerial) {
        const serials = line.serialNumbers ?? [];

        if (serials.length !== qty) {
          throw new BadRequestException(
            `Provide ${qty} serial number(s) for ${line.productName}`,
          );
        }
      }
    }

    for (const line of receipt.lines) {
      const qty = Number(line.quantity);
      const poLine = order.lines.find(
        (item) => item.id === line.purchaseOrderLineId,
      );

      if (!poLine) {
        throw new BadRequestException("Purchase order line not found");
      }

      if (line.trackSerial) {
        for (const serial of line.serialNumbers ?? []) {
          await this.productUnitsService.create(organizationId, line.productId, {
            warehouseId: line.warehouseId,
            serialNumber: serial.trim(),
          });
        }
      } else {
        await this.stockService.adjust(organizationId, {
          productId: line.productId,
          warehouseId: line.warehouseId,
          adjustment: String(qty),
        });
      }

      const newQtyReceived = Number(poLine.qtyReceived) + qty;

      await this.db
        .update(purchaseOrderLines)
        .set({
          qtyReceived: String(newQtyReceived),
          updatedAt: new Date(),
        })
        .where(eq(purchaseOrderLines.id, line.purchaseOrderLineId));

      if (poLine.unitPrice) {
        await this.db
          .update(products)
          .set({
            costPrice: poLine.unitPrice,
            updatedAt: new Date(),
          })
          .where(eq(products.id, line.productId));
      }
    }

    await this.db
      .update(goodsReceipts)
      .set({
        state: "done",
        validatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(goodsReceipts.id, receiptId));

    await this.syncReceiptStatus(organizationId, receipt.purchaseOrderId);

    await this.logActivity(
      organizationId,
      receipt.purchaseOrderId,
      userId,
      "received",
      `Goods receipt ${receipt.number} validated`,
    );

    return this.getReceiptById(organizationId, receiptId);
  }

  private async syncReceiptStatus(organizationId: string, orderId: string) {
    const order = await this.getById(organizationId, orderId);

    let allReceived = true;
    let anyReceived = false;

    for (const line of order.lines) {
      const received = Number(line.qtyReceived);
      const ordered = Number(line.quantity);

      if (received > 0) anyReceived = true;
      if (received < ordered) allReceived = false;
    }

    const receiptStatus = allReceived
      ? "received"
      : anyReceived
        ? "partial"
        : "to_receive";

    await this.db
      .update(purchaseOrders)
      .set({ receiptStatus, updatedAt: new Date() })
      .where(eq(purchaseOrders.id, orderId));
  }

  private async getEditableOrder(organizationId: string, orderId: string) {
    const [order] = await this.db
      .select()
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.id, orderId),
          eq(purchaseOrders.organizationId, organizationId),
          isNull(purchaseOrders.deletedAt),
        ),
      )
      .limit(1);

    if (!order) {
      throw new NotFoundException("Purchase order not found");
    }

    if (order.state !== "draft") {
      throw new BadRequestException("Only draft purchase orders can be edited");
    }

    return order;
  }

  private async recomputeOrderTotals(
    organizationId: string,
    orderId: string,
    order: {
      currencyId: string;
      exchangeRate: string | null;
      exchangeRateLockedAt: Date | null;
    },
  ) {
    const exchangeRate = await this.getOrderExchangeRate(organizationId, order);
    const lines = await this.db
      .select()
      .from(purchaseOrderLines)
      .where(eq(purchaseOrderLines.purchaseOrderId, orderId));

    const totals = sumDocumentAmounts(
      lines.map((line) => ({
        priceSubtotal: Number(line.priceSubtotal),
        priceTax: Number(line.priceTax),
        priceTotal: Number(line.priceTotal),
      })),
      exchangeRate,
    );

    await this.db
      .update(purchaseOrders)
      .set({
        amountUntaxed: String(totals.amountUntaxed),
        amountTax: String(totals.amountTax),
        amountTotal: String(totals.amountTotal),
        amountUntaxedBase: String(totals.amountUntaxedBase),
        amountTaxBase: String(totals.amountTaxBase),
        amountTotalBase: String(totals.amountTotalBase),
        updatedAt: new Date(),
      })
      .where(eq(purchaseOrders.id, orderId));
  }

  private async getOrderExchangeRate(
    organizationId: string,
    order: {
      currencyId: string;
      exchangeRate: string | null;
      exchangeRateLockedAt: Date | null;
    },
  ) {
    if (order.exchangeRateLockedAt && order.exchangeRate) {
      return Number(order.exchangeRate);
    }

    return this.resolveExchangeRate(organizationId, order.currencyId);
  }

  private async resolveExchangeRate(
    organizationId: string,
    currencyId: string,
    asOfDate?: string,
  ) {
    const [org] = await this.db
      .select({ baseCurrencyId: organizations.baseCurrencyId })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!org?.baseCurrencyId || org.baseCurrencyId === currencyId) {
      return 1;
    }

    return this.exchangeRatesService.getRequiredRate(
      organizationId,
      currencyId,
      org.baseCurrencyId,
      asOfDate,
    );
  }

  private async logActivity(
    organizationId: string,
    entityId: string,
    userId: string | undefined,
    activityType:
      | "created"
      | "updated"
      | "note"
      | "confirmed"
      | "received"
      | "cancelled",
    message: string,
  ) {
    await this.db.insert(purchaseActivities).values({
      organizationId,
      entityType: "purchase_order",
      entityId,
      userId: userId ?? null,
      activityType,
      message,
    });
  }
}
