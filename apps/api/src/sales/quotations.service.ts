import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
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
  inArray,
  isNull,
  isNotNull,
  lte,
  or,
  sum,
  type SQL,
} from "drizzle-orm";
import {
  currencies,
  customers,
  deals,
  invoices,
  organizations,
  products,
  productUnits,
  salesActivities,
  salesOrderLines,
  salesOrders,
  stockLevels,
  type Database,
} from "@frog1/db";
import { DATABASE, RAW_DATABASE } from "../database/database.constants";
import { DocumentRendererService } from "../documents/document-renderer.service";
import { ExchangeRatesService } from "../currencies/exchange-rates.service";
import { MailService } from "../mail/mail.service";
import { SettingsService } from "../settings/settings.service";
import { UploadsService } from "../uploads/uploads.service";
import { applyTemplatePlaceholders, parseOrgCompanyProfile, parseOrgDocumentTemplates, resolveDocumentTemplates } from "@frog1/shared";
import { nextDocumentNumber } from "./document-sequences";
import {
  publicQuotationSigningUrl,
  resolvePublicAppUrl,
} from "../lib/public-app-url";
import { hasCustomerAuthorization } from "./quotation-authorization";
import {
  calculateLineAmounts,
  roundMoney,
  sumDocumentAmounts,
} from "./sales-calculations";

export interface ListQuotationsQuery {
  state?: "draft" | "sent" | "signed" | "confirmed" | "cancelled";
  invoiceStatus?: "none" | "to_invoice" | "invoiced";
  customerId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  perPage?: number;
  sortBy?: "number" | "quoteDate" | "amountTotal" | "createdAt";
  sortDir?: "asc" | "desc";
}

export interface CreateQuotationInput {
  customerId: string;
  currencyId: string;
  paymentTermId?: string;
  quoteDate: string;
  validityDate?: string;
  customerReference?: string;
  internalReference?: string;
  paymentReference?: string;
  notes?: string;
  internalNotes?: string;
  deliveryFeeAmount?: number | null;
  deliveryFeePercent?: number | null;
}

export interface UpdateQuotationInput {
  customerId?: string;
  currencyId?: string;
  paymentTermId?: string | null;
  quoteDate?: string;
  validityDate?: string | null;
  customerReference?: string | null;
  internalReference?: string | null;
  paymentReference?: string | null;
  notes?: string | null;
  internalNotes?: string | null;
  deliveryFeeAmount?: number | null;
  deliveryFeePercent?: number | null;
}

export interface UpdateQuotationLineInput {
  description?: string;
  quantity?: number;
  unitPrice?: number;
  discountPercent?: number;
  discountAmount?: number;
  taxRatePercent?: number;
  warrantyPolicyId?: string | null;
}

export interface AddQuotationLineInput {
  productId: string;
  productUnitId?: string;
  warehouseId?: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  discountAmount?: number;
  taxRatePercent?: number;
  warrantyPolicyId?: string | null;
}

export interface CurrencyRow {
  id: string;
  code: string;
  name: string;
  symbol: string;
  decimalPlaces: number;
}

@Injectable()
export class QuotationsService {
  private readonly logger = new Logger(QuotationsService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(RAW_DATABASE) private readonly rawDb: Database,
    private readonly mail: MailService,
    private readonly documentRenderer: DocumentRendererService,
    private readonly settingsService: SettingsService,
    private readonly exchangeRatesService: ExchangeRatesService,
    private readonly uploadsService: UploadsService,
  ) {}

  async uploadCustomerPoDocument(
    organizationId: string,
    orderId: string,
    userId: string | undefined,
    file: Express.Multer.File,
  ) {
    const order = await this.getById(organizationId, orderId);
    const relativePath = await this.uploadsService.saveCustomerPoDocument(
      organizationId,
      orderId,
      file,
    );

    await this.db
      .update(salesOrders)
      .set({
        customerPoDocumentUrl: relativePath,
        updatedAt: new Date(),
      })
      .where(eq(salesOrders.id, orderId));

    await this.logActivity(
      organizationId,
      orderId,
      userId,
      "updated",
      `Uploaded customer PO document: ${file.originalname}`,
    );

    return this.getById(organizationId, orderId);
  }

  listCurrencies(): Promise<CurrencyRow[]> {
    return this.db
      .select({
        id: currencies.id,
        code: currencies.code,
        name: currencies.name,
        symbol: currencies.symbol,
        decimalPlaces: currencies.decimalPlaces,
      })
      .from(currencies)
      .where(eq(currencies.isActive, true))
      .orderBy(asc(currencies.code));
  }

  async list(organizationId: string, query: ListQuotationsQuery) {
    if (query.state === "confirmed") {
      await this.syncInvoicedSalesOrderStatus(organizationId);
    }

    const page = Math.max(query.page ?? 1, 1);
    const perPage = Math.min(Math.max(query.perPage ?? 16, 1), 100);
    const offset = (page - 1) * perPage;

    const filters: SQL[] = [
      eq(salesOrders.organizationId, organizationId),
      isNull(salesOrders.deletedAt),
    ];

    if (query.state) {
      filters.push(eq(salesOrders.state, query.state));
    }

    if (query.invoiceStatus) {
      filters.push(eq(salesOrders.invoiceStatus, query.invoiceStatus));
    }

    if (query.customerId) {
      filters.push(eq(salesOrders.customerId, query.customerId));
    }

    if (query.dateFrom) {
      filters.push(gte(salesOrders.quoteDate, query.dateFrom));
    }

    if (query.dateTo) {
      filters.push(lte(salesOrders.quoteDate, query.dateTo));
    }

    if (query.search?.trim()) {
      const term = `%${query.search.trim()}%`;
      filters.push(
        or(
          ilike(salesOrders.number, term),
          ilike(salesOrders.customerReference, term),
          ilike(salesOrders.internalReference, term),
        )!,
      );
    }

    const whereClause = and(...filters);
    const sortColumn =
      query.sortBy === "quoteDate"
        ? salesOrders.quoteDate
        : query.sortBy === "amountTotal"
          ? salesOrders.amountTotal
          : query.sortBy === "createdAt"
            ? salesOrders.createdAt
            : salesOrders.number;

    const orderBy =
      query.sortDir === "desc" ? desc(sortColumn) : asc(sortColumn);

    const [rows, totalResult, pipelineResult, toInvoiceResult, invoicedResult] =
      await Promise.all([
      this.db
        .select({
          order: salesOrders,
          customerName: customers.name,
          currencyCode: currencies.code,
        })
        .from(salesOrders)
        .innerJoin(customers, eq(customers.id, salesOrders.customerId))
        .innerJoin(currencies, eq(currencies.id, salesOrders.currencyId))
        .where(whereClause)
        .orderBy(orderBy)
        .limit(perPage)
        .offset(offset),
      this.db.select({ total: count() }).from(salesOrders).where(whereClause),
      this.db
        .select({ total: sum(salesOrders.amountTotalBase) })
        .from(salesOrders)
        .where(
          and(
            eq(salesOrders.organizationId, organizationId),
            isNull(salesOrders.deletedAt),
            inArray(salesOrders.state, ["draft", "sent", "signed"]),
          ),
        ),
      query.state === "confirmed"
        ? this.db
            .select({ total: count() })
            .from(salesOrders)
            .where(
              and(
                eq(salesOrders.organizationId, organizationId),
                eq(salesOrders.state, "confirmed"),
                eq(salesOrders.invoiceStatus, "to_invoice"),
                isNull(salesOrders.deletedAt),
              ),
            )
        : Promise.resolve([{ total: 0 }]),
      query.state === "confirmed"
        ? this.db
            .select({ total: count() })
            .from(salesOrders)
            .where(
              and(
                eq(salesOrders.organizationId, organizationId),
                eq(salesOrders.state, "confirmed"),
                eq(salesOrders.invoiceStatus, "invoiced"),
                isNull(salesOrders.deletedAt),
              ),
            )
        : Promise.resolve([{ total: 0 }]),
    ]);

    return {
      data: rows.map((row) => ({
        ...row.order,
        amountTotalBase: String(row.order.amountTotalBase ?? "0"),
        customerName: row.customerName,
        currencyCode: row.currencyCode?.trim() ?? null,
      })),
      meta: {
        page,
        perPage,
        total: Number(totalResult[0]?.total ?? 0),
        totalPages:
          Math.ceil(Number(totalResult[0]?.total ?? 0) / perPage) || 1,
        pipelineTotalBase: String(pipelineResult[0]?.total ?? "0"),
        toInvoiceCount: Number(toInvoiceResult[0]?.total ?? 0),
        invoicedCount: Number(invoicedResult[0]?.total ?? 0),
      },
    };
  }

  private async syncInvoicedSalesOrderStatus(organizationId: string) {
    const linked = await this.db
      .selectDistinct({ salesOrderId: invoices.salesOrderId })
      .from(invoices)
      .where(
        and(
          eq(invoices.organizationId, organizationId),
          eq(invoices.state, "posted"),
          isNull(invoices.deletedAt),
          isNotNull(invoices.salesOrderId),
        ),
      );

    const salesOrderIds = linked
      .map((row) => row.salesOrderId)
      .filter((id): id is string => Boolean(id));

    if (salesOrderIds.length === 0) {
      return;
    }

    await this.db
      .update(salesOrders)
      .set({
        invoiceStatus: "invoiced",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(salesOrders.organizationId, organizationId),
          eq(salesOrders.invoiceStatus, "to_invoice"),
          inArray(salesOrders.id, salesOrderIds),
        ),
      );
  }

  async getById(organizationId: string, id: string) {
    const [header] = await this.db
      .select({
        order: salesOrders,
        customerName: customers.name,
        currencyCode: currencies.code,
      })
      .from(salesOrders)
      .innerJoin(customers, eq(customers.id, salesOrders.customerId))
      .innerJoin(currencies, eq(currencies.id, salesOrders.currencyId))
      .where(
        and(
          eq(salesOrders.id, id),
          eq(salesOrders.organizationId, organizationId),
          isNull(salesOrders.deletedAt),
        ),
      )
      .limit(1);

    if (!header) {
      throw new NotFoundException("Quotation not found");
    }

    const lines = await this.db
      .select({
        line: salesOrderLines,
        serialNumber: productUnits.serialNumber,
        productDescription: products.description,
      })
      .from(salesOrderLines)
      .leftJoin(productUnits, eq(productUnits.id, salesOrderLines.productUnitId))
      .leftJoin(products, eq(products.id, salesOrderLines.productId))
      .where(eq(salesOrderLines.salesOrderId, id))
      .orderBy(asc(salesOrderLines.lineNumber));

    const activities = await this.db
      .select()
      .from(salesActivities)
      .where(
        and(
          eq(salesActivities.entityType, "sales_order"),
          eq(salesActivities.entityId, id),
        ),
      )
      .orderBy(desc(salesActivities.createdAt));

    // Fetch deal siblings if this order is part of a deal
    let dealSiblings: Array<{
      id: string;
      number: string;
      state: string;
      amountTotal: string;
      currencyCode: string | null;
      quoteDate: string;
    }> = [];

    if (header.order.dealId) {
      const siblings = await this.db
        .select({
          order: salesOrders,
          currencyCode: currencies.code,
        })
        .from(salesOrders)
        .innerJoin(currencies, eq(currencies.id, salesOrders.currencyId))
        .where(
          and(
            eq(salesOrders.dealId, header.order.dealId),
            isNull(salesOrders.deletedAt),
          ),
        )
        .orderBy(asc(salesOrders.createdAt));

      dealSiblings = siblings.map((s) => ({
        id: s.order.id,
        number: s.order.number,
        state: s.order.state,
        amountTotal: String(s.order.amountTotal),
        currencyCode: s.currencyCode?.trim() ?? null,
        quoteDate: s.order.quoteDate,
      }));
    }

    return {
      ...header.order,
      amountTotalBase: String(header.order.amountTotalBase ?? "0"),
      customerName: header.customerName,
      currencyCode: header.currencyCode?.trim() ?? null,
      dealId: header.order.dealId ?? null,
      dealSiblings,
      lines: lines.map((row) => ({
        ...row.line,
        serialNumber: row.serialNumber,
        productDescription: row.productDescription,
      })),
      activities,
    };
  }

  async create(
    organizationId: string,
    userId: string | undefined,
    input: CreateQuotationInput,
  ) {
    await this.getCustomer(organizationId, input.customerId);

    const number = await nextDocumentNumber(
      this.db,
      organizationId,
      "quotation",
      "Q-",
    );

    const exchangeRate = await this.resolveExchangeRate(
      organizationId,
      input.currencyId,
    );

    const [order] = await this.db
      .insert(salesOrders)
      .values({
        organizationId,
        number,
        customerId: input.customerId,
        currencyId: input.currencyId,
        exchangeRate: String(exchangeRate),
        paymentTermId: input.paymentTermId ?? null,
        quoteDate: input.quoteDate,
        validityDate: input.validityDate ?? null,
        customerReference: input.customerReference ?? null,
        internalReference: input.internalReference ?? null,
        paymentReference: input.paymentReference ?? null,
        notes: input.notes ?? null,
        internalNotes: input.internalNotes ?? null,
        accessToken: randomUUID(),
        ...this.resolveDeliveryFeeFields(input),
        createdByUserId: userId ?? null,
      })
      .returning();

    await this.logActivity(
      organizationId,
      order.id,
      userId,
      "created",
      `Quotation ${number} created`,
    );

    return this.getById(organizationId, order.id);
  }

  async addLine(
    organizationId: string,
    orderId: string,
    input: AddQuotationLineInput,
  ) {
    const order = await this.getEditableOrder(organizationId, orderId);
    const product = await this.getProduct(organizationId, input.productId);

    if (product.trackSerial) {
      if (!input.productUnitId) {
        throw new BadRequestException(
          "Serial number is required for this product",
        );
      }

      if (input.quantity !== 1) {
        throw new BadRequestException(
          "Serial-tracked products must have quantity 1 per line",
        );
      }

      await this.validateSerialUnit(
        organizationId,
        input.productId,
        input.productUnitId,
      );
    } else {
      await this.validateBulkStockAvailability(
        organizationId,
        input.productId,
        input.quantity,
        orderId,
        input.warehouseId,
      );
    }

    const amounts = calculateLineAmounts({
      quantity: input.quantity,
      unitPrice: input.unitPrice,
      discountPercent: input.discountPercent ?? 0,
      discountAmount: input.discountAmount ?? 0,
      taxRatePercent: input.taxRatePercent ?? 0,
    });

    const [lastLine] = await this.db
      .select({ lineNumber: salesOrderLines.lineNumber })
      .from(salesOrderLines)
      .where(eq(salesOrderLines.salesOrderId, orderId))
      .orderBy(desc(salesOrderLines.lineNumber))
      .limit(1);

    const lineNumber = (lastLine?.lineNumber ?? 0) + 1;

    await this.db.insert(salesOrderLines).values({
      salesOrderId: orderId,
      lineNumber,
      productId: input.productId,
      productUnitId: input.productUnitId ?? null,
      warehouseId: input.warehouseId ?? null,
      description: input.description?.trim() || product.name,
      quantity: String(input.quantity),
      unitPrice: String(input.unitPrice),
      discountPercent: String(input.discountPercent ?? 0),
      discountAmount: String(input.discountAmount ?? 0),
      taxRatePercent: String(input.taxRatePercent ?? 0),
      priceSubtotal: String(amounts.priceSubtotal),
      priceTax: String(amounts.priceTax),
      priceTotal: String(amounts.priceTotal),
      warrantyPolicyId: input.warrantyPolicyId ?? null,
    });

    await this.recomputeOrderTotals(
      organizationId,
      orderId,
      order,
    );

    return this.getById(organizationId, orderId);
  }

  async update(
    organizationId: string,
    orderId: string,
    userId: string | undefined,
    input: UpdateQuotationInput,
  ) {
    const order = await this.getEditableOrder(organizationId, orderId);

    if (input.customerId) {
      await this.getCustomer(organizationId, input.customerId);
    }

    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (
      input.currencyId !== undefined &&
      input.currencyId !== order.currencyId
    ) {
      await this.convertQuotationCurrency(
        organizationId,
        orderId,
        order.currencyId,
        input.currencyId,
      );

      updates.currencyId = input.currencyId;
      updates.exchangeRate = String(
        await this.resolveExchangeRate(organizationId, input.currencyId),
      );
    }

    if (input.customerId !== undefined) updates.customerId = input.customerId;
    if (input.paymentTermId !== undefined) {
      updates.paymentTermId = input.paymentTermId;
    }
    if (input.quoteDate !== undefined) updates.quoteDate = input.quoteDate;
    if (input.validityDate !== undefined) {
      updates.validityDate = input.validityDate;
    }
    if (input.customerReference !== undefined) {
      updates.customerReference = input.customerReference;
    }
    if (input.internalReference !== undefined) {
      updates.internalReference = input.internalReference;
    }
    if (input.paymentReference !== undefined) {
      updates.paymentReference = input.paymentReference;
    }
    if (input.notes !== undefined) updates.notes = input.notes;
    if (input.internalNotes !== undefined) {
      updates.internalNotes = input.internalNotes;
    }

    this.applyDeliveryFeeUpdates(input, updates);

    await this.db
      .update(salesOrders)
      .set(updates)
      .where(
        and(
          eq(salesOrders.id, orderId),
          eq(salesOrders.organizationId, organizationId),
        ),
      );

    await this.recomputeOrderTotals(organizationId, orderId, order);

    await this.logActivity(
      organizationId,
      orderId,
      userId,
      "updated",
      "Quotation details updated",
    );

    return this.getById(organizationId, orderId);
  }

  async updateInternalNotes(
    organizationId: string,
    orderId: string,
    userId: string | undefined,
    internalNotes: string,
  ) {
    await this.db
      .update(salesOrders)
      .set({ internalNotes, updatedAt: new Date() })
      .where(
        and(
          eq(salesOrders.id, orderId),
          eq(salesOrders.organizationId, organizationId),
        ),
      );

    await this.logActivity(
      organizationId,
      orderId,
      userId,
      "updated",
      "Internal team notes updated",
    );

    return this.getById(organizationId, orderId);
  }

  async updateLine(
    organizationId: string,
    orderId: string,
    lineId: string,
    input: UpdateQuotationLineInput,
  ) {
    const order = await this.getEditableOrder(organizationId, orderId);

    const [line] = await this.db
      .select()
      .from(salesOrderLines)
      .where(
        and(
          eq(salesOrderLines.id, lineId),
          eq(salesOrderLines.salesOrderId, orderId),
        ),
      )
      .limit(1);

    if (!line) {
      throw new NotFoundException("Line not found");
    }

    const quantity =
      input.quantity !== undefined ? input.quantity : Number(line.quantity);
    const unitPrice =
      input.unitPrice !== undefined
        ? input.unitPrice
        : Number(line.unitPrice);
    const discountPercent =
      input.discountPercent !== undefined
        ? input.discountPercent
        : Number(line.discountPercent);
    const discountAmount =
      input.discountAmount !== undefined
        ? input.discountAmount
        : Number(line.discountAmount ?? 0);
    const taxRatePercent =
      input.taxRatePercent !== undefined
        ? input.taxRatePercent
        : Number(line.taxRatePercent);

    if (line.productId) {
      const product = await this.getProduct(organizationId, line.productId);

      if (product.trackSerial && quantity !== 1) {
        throw new BadRequestException(
          "Serial-tracked products must have quantity 1 per line",
        );
      }

      if (!product.trackSerial) {
        await this.validateBulkStockAvailability(
          organizationId,
          line.productId,
          quantity,
          orderId,
          line.warehouseId,
          lineId,
        );
      }
    }

    const amounts = calculateLineAmounts({
      quantity,
      unitPrice,
      discountPercent,
      discountAmount,
      taxRatePercent,
    });

    await this.db
      .update(salesOrderLines)
      .set({
        description:
          input.description !== undefined
            ? input.description.trim() || line.description
            : line.description,
        quantity: String(quantity),
        unitPrice: String(unitPrice),
        discountPercent: String(discountPercent),
        discountAmount: String(discountAmount),
        taxRatePercent: String(taxRatePercent),
        priceSubtotal: String(amounts.priceSubtotal),
        priceTax: String(amounts.priceTax),
        priceTotal: String(amounts.priceTotal),
        ...(input.warrantyPolicyId !== undefined
          ? { warrantyPolicyId: input.warrantyPolicyId }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(salesOrderLines.id, lineId));

    await this.recomputeOrderTotals(
      organizationId,
      orderId,
      order,
    );

    return this.getById(organizationId, orderId);
  }

  async deleteLine(
    organizationId: string,
    orderId: string,
    lineId: string,
  ) {
    const order = await this.getEditableOrder(organizationId, orderId);

    const [line] = await this.db
      .select({ id: salesOrderLines.id })
      .from(salesOrderLines)
      .where(
        and(
          eq(salesOrderLines.id, lineId),
          eq(salesOrderLines.salesOrderId, orderId),
        ),
      )
      .limit(1);

    if (!line) {
      throw new NotFoundException("Line not found");
    }

    await this.db
      .delete(salesOrderLines)
      .where(eq(salesOrderLines.id, lineId));

    await this.recomputeOrderTotals(
      organizationId,
      orderId,
      order,
    );

    return this.getById(organizationId, orderId);
  }

  async confirm(
    organizationId: string,
    orderId: string,
    userId: string | undefined,
  ) {
    const order = await this.getEditableOrder(organizationId, orderId);

    if (order.state !== "sent" && order.state !== "signed") {
      throw new BadRequestException(
        "Send the quotation to the customer before confirming it as a sales order",
      );
    }

    if (!hasCustomerAuthorization(order)) {
      throw new BadRequestException(
        "Customer authorization is required. Add a customer PO reference or ask the customer to digitally sign the quotation before confirming it",
      );
    }

    const lines = await this.db
      .select()
      .from(salesOrderLines)
      .where(eq(salesOrderLines.salesOrderId, orderId));

    if (lines.length === 0) {
      throw new BadRequestException("Add at least one line before confirming");
    }

    const exchangeRate = await this.resolveExchangeRate(
      organizationId,
      order.currencyId,
      order.quoteDate,
    );
    const lockTime = new Date();

    await this.recomputeOrderTotals(organizationId, orderId, {
      currencyId: order.currencyId,
      exchangeRate: String(exchangeRate),
      exchangeRateLockedAt: lockTime,
    });

    const [updated] = await this.db
      .update(salesOrders)
      .set({
        state: "confirmed",
        invoiceStatus: "to_invoice",
        exchangeRate: String(exchangeRate),
        exchangeRateLockedAt: lockTime,
        confirmedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(salesOrders.id, orderId))
      .returning();

    await this.logActivity(
      organizationId,
      orderId,
      userId,
      "confirmed",
      `Quotation ${updated.number} confirmed as sales order`,
    );

    return this.getById(organizationId, orderId);
  }

  async markSent(
    organizationId: string,
    orderId: string,
    userId: string | undefined,
  ) {
    const order = await this.getEditableOrder(organizationId, orderId);

    if (order.state !== "draft") {
      throw new BadRequestException(
        "Only draft quotations can be marked as sent",
      );
    }

    const lines = await this.db
      .select({ id: salesOrderLines.id })
      .from(salesOrderLines)
      .where(eq(salesOrderLines.salesOrderId, orderId));

    if (lines.length === 0) {
      throw new BadRequestException("Add at least one line before sending");
    }

    const [updated] = await this.db
      .update(salesOrders)
      .set({
        state: "sent",
        sentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(salesOrders.id, orderId))
      .returning();

    await this.logActivity(
      organizationId,
      orderId,
      userId,
      "sent",
      `Quotation ${updated.number} marked as sent to customer`,
    );

    return this.getById(organizationId, orderId);
  }

  async cancel(
    organizationId: string,
    orderId: string,
    userId: string | undefined,
  ) {
    const order = await this.getById(organizationId, orderId);

    if (order.state === "confirmed" || order.state === "cancelled") {
      throw new BadRequestException(
        "Confirmed or cancelled quotations cannot be cancelled again",
      );
    }

    const [updated] = await this.db
      .update(salesOrders)
      .set({
        state: "cancelled",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(salesOrders.id, orderId),
          eq(salesOrders.organizationId, organizationId),
        ),
      )
      .returning();

    await this.logActivity(
      organizationId,
      orderId,
      userId,
      "cancelled",
      `Quotation ${updated.number} cancelled`,
    );

    return this.getById(organizationId, orderId);
  }

  async getSigningUrl(organizationId: string, orderId: string) {
    const order = await this.getById(organizationId, orderId);

    if (order.state === "cancelled") {
      throw new BadRequestException(
        "Cancelled quotations cannot be shared for signing",
      );
    }

    if (order.state === "confirmed") {
      throw new BadRequestException(
        "Confirmed sales orders are no longer available for customer signing",
      );
    }

    let token = order.accessToken;
    if (!token) {
      token = randomUUID();
      await this.db
        .update(salesOrders)
        .set({ accessToken: token, updatedAt: new Date() })
        .where(
          and(
            eq(salesOrders.id, orderId),
            eq(salesOrders.organizationId, organizationId),
          ),
        );
    }

    return {
      url: publicQuotationSigningUrl(token),
    };
  }

  async sendEmail(
    organizationId: string,
    orderId: string,
    userId: string | undefined,
    input: { recipientEmail: string; subject: string; body: string },
  ) {
    const order = await this.getById(organizationId, orderId);

    if (order.state === "confirmed" || order.state === "cancelled") {
      throw new BadRequestException(
        "Cannot email a confirmed or cancelled quotation",
      );
    }

    const recipientEmail = input.recipientEmail?.trim();
    if (!recipientEmail) {
      throw new BadRequestException("Recipient email is required");
    }

    const lines = await this.db
      .select()
      .from(salesOrderLines)
      .where(eq(salesOrderLines.salesOrderId, orderId));

    if (lines.length === 0) {
      throw new BadRequestException(
        "Add at least one line before sending the quotation",
      );
    }

    const company = await this.settingsService.getCompany(organizationId);
    const templates = await this.settingsService.getDocumentTemplates(
      organizationId,
    );
    const placeholders = {
      number: order.number,
      customerName: order.customerName ?? "Customer",
      companyName: company.name,
      total: order.amountTotal,
    };

    let token = order.accessToken;
    if (!token) {
      token = randomUUID();
      await this.db
        .update(salesOrders)
        .set({ accessToken: token, updatedAt: new Date() })
        .where(eq(salesOrders.id, orderId));
    }

    const publicSignUrl = publicQuotationSigningUrl(token);

    const subject =
      input.subject?.trim() ||
      applyTemplatePlaceholders(templates.emailSubject, placeholders);
    let text =
      input.body?.trim() ||
      applyTemplatePlaceholders(templates.emailBodyIntro, placeholders);

    if (order.customerReference) {
      text += `\n\nPO Reference: ${order.customerReference} (Purchase Order Authorized)`;
    } else {
      text += `\n\nPlease review and digitally sign your quotation online:\n${publicSignUrl}`;
    }

    const pdfBuffer = await this.documentRenderer.renderQuotationPdf(
      organizationId,
      orderId,
    );

    const delivery = await this.mail.sendBrandedMail({
      to: recipientEmail,
      subject,
      title: `Quotation ${order.number}`,
      bodyText: text,
      attachments: [
        {
          filename: `quotation-${order.number}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });

    if (order.state === "draft") {
      await this.db
        .update(salesOrders)
        .set({
          state: "sent",
          updatedAt: new Date(),
        })
        .where(eq(salesOrders.id, orderId));

      await this.logActivity(
        organizationId,
        orderId,
        userId,
        "sent",
        `Quotation ${order.number} sent to ${recipientEmail}`,
      );
    } else {
      await this.logActivity(
        organizationId,
        orderId,
        userId,
        "sent",
        `Quotation ${order.number} resent to ${recipientEmail}`,
      );
    }

    return {
      success: true,
      sentAt: new Date().toISOString(),
      delivery,
    };
  }

  async delete(organizationId: string, orderId: string) {
    const order = await this.getById(organizationId, orderId);

    if (order.state !== "cancelled") {
      throw new BadRequestException(
        "Only cancelled quotations can be deleted. Cancel the quotation first.",
      );
    }

    if (order.invoiceStatus === "invoiced") {
      throw new BadRequestException(
        "Cannot delete a sales order that has been invoiced",
      );
    }

    const [linkedInvoice] = await this.db
      .select({ id: invoices.id })
      .from(invoices)
      .where(
        and(
          eq(invoices.salesOrderId, orderId),
          eq(invoices.organizationId, organizationId),
          isNull(invoices.deletedAt),
        ),
      )
      .limit(1);

    if (linkedInvoice) {
      throw new BadRequestException(
        "Cannot delete a sales order with linked invoices",
      );
    }

    await this.db
      .update(salesOrders)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(salesOrders.id, orderId),
          eq(salesOrders.organizationId, organizationId),
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

    if (!message.trim()) {
      throw new BadRequestException("Note message is required");
    }

    await this.logActivity(
      organizationId,
      orderId,
      userId,
      "note",
      message.trim(),
    );

    return this.getById(organizationId, orderId);
  }

  private async getEditableOrder(organizationId: string, orderId: string) {
    const order = await this.getById(organizationId, orderId);

    if (order.state === "confirmed" || order.state === "cancelled") {
      throw new BadRequestException("This quotation can no longer be edited");
    }

    return order;
  }

  private async getCustomer(organizationId: string, customerId: string) {
    const [customer] = await this.db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.id, customerId),
          eq(customers.organizationId, organizationId),
          isNull(customers.deletedAt),
        ),
      )
      .limit(1);

    if (!customer) {
      throw new NotFoundException("Customer not found");
    }

    return customer;
  }

  private async getProduct(organizationId: string, productId: string) {
    const [product] = await this.db
      .select()
      .from(products)
      .where(
        and(
          eq(products.id, productId),
          eq(products.organizationId, organizationId),
          isNull(products.deletedAt),
        ),
      )
      .limit(1);

    if (!product) {
      throw new NotFoundException("Product not found");
    }

    return product;
  }

  private async validateBulkStockAvailability(
    organizationId: string,
    productId: string,
    requestedQty: number,
    orderId: string,
    warehouseId?: string | null,
    excludeLineId?: string,
  ) {
    const stockFilters: SQL[] = [
      eq(stockLevels.organizationId, organizationId),
      eq(stockLevels.productId, productId),
    ];

    if (warehouseId) {
      stockFilters.push(eq(stockLevels.warehouseId, warehouseId));
    }

    const [stockRow] = await this.db
      .select({ total: sum(stockLevels.quantity) })
      .from(stockLevels)
      .where(and(...stockFilters));

    const available = Number(stockRow?.total ?? 0);

    const reservedLines = await this.db
      .select({
        id: salesOrderLines.id,
        quantity: salesOrderLines.quantity,
      })
      .from(salesOrderLines)
      .where(
        and(
          eq(salesOrderLines.salesOrderId, orderId),
          eq(salesOrderLines.productId, productId),
          isNull(salesOrderLines.productUnitId),
        ),
      );

    const reserved = reservedLines
      .filter((row) => row.id !== excludeLineId)
      .reduce((total, row) => total + Number(row.quantity), 0);

    const remaining = available - reserved;

    if (requestedQty > remaining) {
      throw new BadRequestException(
        `Only ${Math.max(remaining, 0)} units available in stock`,
      );
    }
  }

  private async validateSerialUnit(
    organizationId: string,
    productId: string,
    productUnitId: string,
  ) {
    const [unit] = await this.db
      .select()
      .from(productUnits)
      .where(
        and(
          eq(productUnits.id, productUnitId),
          eq(productUnits.organizationId, organizationId),
          eq(productUnits.productId, productId),
        ),
      )
      .limit(1);

    if (!unit) {
      throw new NotFoundException("Serial unit not found");
    }

    if (unit.status !== "in_stock" && unit.status !== "assigned") {
      throw new BadRequestException("Serial unit is not available");
    }
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

  private resolveDeliveryFeeFields(input: {
    deliveryFeeAmount?: number | null;
    deliveryFeePercent?: number | null;
  }) {
    const amount =
      input.deliveryFeeAmount != null ? Number(input.deliveryFeeAmount) : 0;
    const percent =
      input.deliveryFeePercent != null ? Number(input.deliveryFeePercent) : 0;
    const hasAmount = Number.isFinite(amount) && amount > 0;
    const hasPercent = Number.isFinite(percent) && percent > 0;

    if (hasAmount && hasPercent) {
      throw new BadRequestException(
        "Set either a delivery fee amount or percent, not both",
      );
    }

    return {
      deliveryFeeAmount: hasAmount ? String(roundMoney(amount)) : null,
      deliveryFeePercent: hasPercent ? String(percent) : null,
    };
  }

  private applyDeliveryFeeUpdates(
    input: {
      deliveryFeeAmount?: number | null;
      deliveryFeePercent?: number | null;
    },
    updates: Record<string, unknown>,
  ) {
    if (
      input.deliveryFeeAmount === undefined &&
      input.deliveryFeePercent === undefined
    ) {
      return;
    }

    const { deliveryFeeAmount, deliveryFeePercent } =
      this.resolveDeliveryFeeFields({
        deliveryFeeAmount: input.deliveryFeeAmount ?? null,
        deliveryFeePercent: input.deliveryFeePercent ?? null,
      });

    updates.deliveryFeeAmount = deliveryFeeAmount;
    updates.deliveryFeePercent = deliveryFeePercent;
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
      .from(salesOrderLines)
      .where(eq(salesOrderLines.salesOrderId, orderId));

    const [feeRow] = await this.db
      .select({
        deliveryFeeAmount: salesOrders.deliveryFeeAmount,
        deliveryFeePercent: salesOrders.deliveryFeePercent,
      })
      .from(salesOrders)
      .where(eq(salesOrders.id, orderId))
      .limit(1);

    const totals = sumDocumentAmounts(
      lines.map((line) => ({
        priceSubtotal: Number(line.priceSubtotal),
        priceTax: Number(line.priceTax),
        priceTotal: Number(line.priceTotal),
      })),
      exchangeRate,
      feeRow?.deliveryFeeAmount,
      feeRow?.deliveryFeePercent,
    );

    await this.db
      .update(salesOrders)
      .set({
        amountUntaxed: String(totals.amountUntaxed),
        amountTax: String(totals.amountTax),
        amountTotal: String(totals.amountTotal),
        amountUntaxedBase: String(totals.amountUntaxedBase),
        amountTaxBase: String(totals.amountTaxBase),
        amountTotalBase: String(totals.amountTotalBase),
        updatedAt: new Date(),
      })
      .where(eq(salesOrders.id, orderId));
  }

  private async convertQuotationCurrency(
    organizationId: string,
    orderId: string,
    fromCurrencyId: string,
    toCurrencyId: string,
  ) {
    if (fromCurrencyId === toCurrencyId) {
      return;
    }

    const rate = await this.exchangeRatesService.getRequiredRate(
      organizationId,
      fromCurrencyId,
      toCurrencyId,
    );

    const lines = await this.db
      .select()
      .from(salesOrderLines)
      .where(eq(salesOrderLines.salesOrderId, orderId));

    for (const line of lines) {
      const unitPrice = roundMoney(Number(line.unitPrice) * rate);
      const discountAmount = roundMoney(Number(line.discountAmount ?? 0) * rate);
      const amounts = calculateLineAmounts({
        quantity: Number(line.quantity),
        unitPrice,
        discountPercent: Number(line.discountPercent),
        discountAmount,
        taxRatePercent: Number(line.taxRatePercent),
      });

      await this.db
        .update(salesOrderLines)
        .set({
          unitPrice: String(unitPrice),
          discountAmount: String(discountAmount),
          priceSubtotal: String(amounts.priceSubtotal),
          priceTax: String(amounts.priceTax),
          priceTotal: String(amounts.priceTotal),
        })
        .where(eq(salesOrderLines.id, line.id));
    }

    const [updatedOrder] = await this.db
      .select({
        exchangeRateLockedAt: salesOrders.exchangeRateLockedAt,
      })
      .from(salesOrders)
      .where(eq(salesOrders.id, orderId))
      .limit(1);

    if (!updatedOrder) {
      throw new NotFoundException("Quotation not found");
    }

    const exchangeRate = await this.resolveExchangeRate(
      organizationId,
      toCurrencyId,
    );

    await this.recomputeOrderTotals(organizationId, orderId, {
      currencyId: toCurrencyId,
      exchangeRate: String(exchangeRate),
      exchangeRateLockedAt: updatedOrder.exchangeRateLockedAt,
    });
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

  async getCurrencyDiagnostics(organizationId: string) {
    const [org] = await this.db
      .select({ baseCurrencyId: organizations.baseCurrencyId })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    const orders = await this.db
      .select({
        id: salesOrders.id,
        number: salesOrders.number,
        state: salesOrders.state,
        currencyId: salesOrders.currencyId,
        currencyCode: currencies.code,
        amountTotal: salesOrders.amountTotal,
        amountTotalBase: salesOrders.amountTotalBase,
        exchangeRate: salesOrders.exchangeRate,
      })
      .from(salesOrders)
      .innerJoin(currencies, eq(currencies.id, salesOrders.currencyId))
      .where(
        and(
          eq(salesOrders.organizationId, organizationId),
          isNull(salesOrders.deletedAt),
          inArray(salesOrders.state, ["draft", "sent"]),
        ),
      );

    return orders
      .filter((order) => {
        if (!org?.baseCurrencyId || order.currencyId === org.baseCurrencyId) {
          return false;
        }

        const rate = Number(order.exchangeRate ?? 1);
        const total = Number(order.amountTotal);
        const totalBase = Number(order.amountTotalBase);

        return (
          rate === 1 ||
          (Math.abs(total - totalBase) < 0.01 && total > 0)
        );
      })
      .map((order) => ({
        id: order.id,
        number: order.number,
        state: order.state,
        currencyCode: order.currencyCode?.trim() ?? null,
        amountTotal: String(order.amountTotal),
        issue:
          "Document currency differs from base but amounts look unconverted. Use Reconvert to fix.",
      }));
  }

  async reconvertQuotation(
    organizationId: string,
    orderId: string,
    fromCurrencyId: string,
    userId: string | undefined,
  ) {
    const order = await this.getEditableOrder(organizationId, orderId);

    if (fromCurrencyId === order.currencyId) {
      throw new BadRequestException(
        "Source currency must differ from the quotation currency",
      );
    }

    await this.convertQuotationCurrency(
      organizationId,
      orderId,
      fromCurrencyId,
      order.currencyId,
    );

    await this.db
      .update(salesOrders)
      .set({
        exchangeRate: String(
          await this.resolveExchangeRate(organizationId, order.currencyId),
        ),
        updatedAt: new Date(),
      })
      .where(eq(salesOrders.id, orderId));

    await this.logActivity(
      organizationId,
      orderId,
      userId,
      "updated",
      "Quotation amounts reconverted using exchange rate",
    );

    return this.getById(organizationId, orderId);
  }

  // ── Deal methods ──────────────────────────────────────────────────────────

  /** Revise: cancel the current quote (if not already cancelled) and create a
   *  new draft linked to the same deal. If no deal exists one is created. */
  async revise(
    organizationId: string,
    orderId: string,
    userId: string | undefined,
  ) {
    const original = await this.getById(organizationId, orderId);

    if (original.state === "confirmed") {
      throw new BadRequestException(
        "Confirmed sales orders cannot be revised. Cancel it first.",
      );
    }

    // Ensure deal exists
    let dealId = original.dealId ?? null;
    if (!dealId) {
      const [deal] = await this.db
        .insert(deals)
        .values({
          organizationId,
          customerId: original.customerId,
          title: `Deal for ${original.customerName ?? original.number}`,
        })
        .returning();
      dealId = deal.id;

      // Link original to the deal
      await this.db
        .update(salesOrders)
        .set({ dealId, updatedAt: new Date() })
        .where(eq(salesOrders.id, orderId));
    }

    // Cancel original if not already cancelled
    if (original.state !== "cancelled") {
      await this.db
        .update(salesOrders)
        .set({ state: "cancelled", updatedAt: new Date() })
        .where(
          and(
            eq(salesOrders.id, orderId),
            eq(salesOrders.organizationId, organizationId),
          ),
        );
      await this.logActivity(
        organizationId,
        orderId,
        userId,
        "cancelled",
        `Quotation ${original.number} cancelled — revised`,
      );
    }

    // Create new draft with same header
    const number = await nextDocumentNumber(
      this.db,
      organizationId,
      "quotation",
      "Q-",
    );
    const exchangeRate = await this.resolveExchangeRate(
      organizationId,
      original.currencyId,
    );

    const [newOrder] = await this.db
      .insert(salesOrders)
      .values({
        organizationId,
        number,
        customerId: original.customerId,
        currencyId: original.currencyId,
        exchangeRate: String(exchangeRate),
        paymentTermId: original.paymentTermId ?? null,
        quoteDate: new Date().toISOString().split("T")[0],
        validityDate: original.validityDate ?? null,
        customerReference: original.customerReference ?? null,
        internalReference: original.internalReference ?? null,
        paymentReference: original.paymentReference ?? null,
        notes: original.notes ?? null,
        internalNotes: original.internalNotes ?? null,
        dealId,
        createdByUserId: userId ?? null,
      })
      .returning();

    // Copy lines
    if (original.lines && original.lines.length > 0) {
      await this.db.insert(salesOrderLines).values(
        original.lines.map((l) => ({
          salesOrderId: newOrder.id,
          lineNumber: l.lineNumber,
          productId: l.productId ?? null,
          productUnitId: l.productUnitId ?? null,
          warehouseId: l.warehouseId ?? null,
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discountPercent: l.discountPercent,
          discountAmount: l.discountAmount ?? "0",
          taxRatePercent: l.taxRatePercent,
          priceSubtotal: l.priceSubtotal,
          priceTax: l.priceTax,
          priceTotal: l.priceTotal,
        })),
      );
      // Recompute new order totals
      await this.recomputeOrderTotals(organizationId, newOrder.id, {
        currencyId: newOrder.currencyId,
        exchangeRate: String(exchangeRate),
        exchangeRateLockedAt: null,
      });
    }

    await this.logActivity(
      organizationId,
      newOrder.id,
      userId,
      "created",
      `Quotation ${number} created as revision of ${original.number}`,
    );

    return this.getById(organizationId, newOrder.id);
  }

  /** Link an existing quotation to a deal. Creates a deal if dealId = 'new'. */
  async linkToDeal(
    organizationId: string,
    orderId: string,
    dealId: string,
    userId: string | undefined,
  ) {
    const order = await this.getById(organizationId, orderId);

    let resolvedDealId = dealId;

    if (dealId === "new") {
      // Create a new deal for this quotation's customer
      const [deal] = await this.db
        .insert(deals)
        .values({
          organizationId,
          customerId: order.customerId,
          title: `Deal for ${order.customerName ?? order.number}`,
        })
        .returning();
      resolvedDealId = deal.id;
    } else {
      // Verify deal belongs to org
      const [deal] = await this.db
        .select()
        .from(deals)
        .where(
          and(
            eq(deals.id, dealId),
            eq(deals.organizationId, organizationId),
          ),
        )
        .limit(1);
      if (!deal) throw new NotFoundException("Deal not found");
    }

    await this.db
      .update(salesOrders)
      .set({ dealId: resolvedDealId, updatedAt: new Date() })
      .where(
        and(
          eq(salesOrders.id, orderId),
          eq(salesOrders.organizationId, organizationId),
        ),
      );

    await this.logActivity(
      organizationId,
      orderId,
      userId,
      "updated",
      `Quotation linked to deal`,
    );

    return this.getById(organizationId, orderId);
  }

  /** Remove a quotation from its deal. */
  async unlinkFromDeal(
    organizationId: string,
    orderId: string,
    userId: string | undefined,
  ) {
    await this.getById(organizationId, orderId);

    await this.db
      .update(salesOrders)
      .set({ dealId: null, updatedAt: new Date() })
      .where(
        and(
          eq(salesOrders.id, orderId),
          eq(salesOrders.organizationId, organizationId),
        ),
      );

    await this.logActivity(
      organizationId,
      orderId,
      userId,
      "updated",
      `Quotation removed from deal`,
    );

    return this.getById(organizationId, orderId);
  }

  /** List deals for an org (optionally filtered by customer). */
  async listDeals(
    organizationId: string,
    customerId?: string,
  ) {
    const filters = [eq(deals.organizationId, organizationId)];
    if (customerId) filters.push(eq(deals.customerId, customerId));

    const dealRows = await this.db
      .select({
        deal: deals,
        customerName: customers.name,
      })
      .from(deals)
      .innerJoin(customers, eq(customers.id, deals.customerId))
      .where(and(...filters))
      .orderBy(desc(deals.createdAt));

    // For each deal, fetch quotation summaries
    const result = await Promise.all(
      dealRows.map(async (row) => {
        const quotationRows = await this.db
          .select({
            id: salesOrders.id,
            number: salesOrders.number,
            state: salesOrders.state,
            amountTotal: salesOrders.amountTotal,
            quoteDate: salesOrders.quoteDate,
            currencyCode: currencies.code,
          })
          .from(salesOrders)
          .innerJoin(currencies, eq(currencies.id, salesOrders.currencyId))
          .where(
            and(
              eq(salesOrders.dealId, row.deal.id),
              isNull(salesOrders.deletedAt),
            ),
          )
          .orderBy(asc(salesOrders.createdAt));

        return {
          ...row.deal,
          customerName: row.customerName,
          quotations: quotationRows.map((q) => ({
            id: q.id,
            number: q.number,
            state: q.state,
            amountTotal: String(q.amountTotal),
            currencyCode: q.currencyCode?.trim() ?? null,
            quoteDate: q.quoteDate,
          })),
        };
      }),
    );

    return result;
  }

  async getPublicByToken(token: string) {
    const [order] = await this.rawDb
      .select({
        id: salesOrders.id,
        organizationId: salesOrders.organizationId,
        branchId: salesOrders.branchId,
        number: salesOrders.number,
        state: salesOrders.state,
        quoteDate: salesOrders.quoteDate,
        validityDate: salesOrders.validityDate,
        customerReference: salesOrders.customerReference,
        notes: salesOrders.notes,
        amountUntaxed: salesOrders.amountUntaxed,
        amountTax: salesOrders.amountTax,
        amountTotal: salesOrders.amountTotal,
        deliveryFeeAmount: salesOrders.deliveryFeeAmount,
        deliveryFeePercent: salesOrders.deliveryFeePercent,
        accessToken: salesOrders.accessToken,
        signedBy: salesOrders.signedBy,
        signedOn: salesOrders.signedOn,
        signatureImage: salesOrders.signatureImage,
        signedIp: salesOrders.signedIp,
        signedEmail: salesOrders.signedEmail,
        customerName: customers.name,
        customerEmail: customers.email,
        customerTaxId: customers.taxId,
        customerStreet1: customers.street1,
        customerStreet2: customers.street2,
        customerCity: customers.city,
        customerState: customers.stateCode,
        customerZip: customers.zip,
        customerCountry: customers.countryCode,
        currencyCode: currencies.code,
        currencySymbol: currencies.symbol,
      })
      .from(salesOrders)
      .innerJoin(customers, eq(customers.id, salesOrders.customerId))
      .innerJoin(currencies, eq(currencies.id, salesOrders.currencyId))
      .where(and(eq(salesOrders.accessToken, token), isNull(salesOrders.deletedAt)))
      .limit(1);

    if (!order) {
      throw new NotFoundException("Quotation not found or link has expired");
    }

    const lines = await this.rawDb
      .select({
        id: salesOrderLines.id,
        description: salesOrderLines.description,
        productDescription: products.description,
        serialNumber: productUnits.serialNumber,
        quantity: salesOrderLines.quantity,
        unitPrice: salesOrderLines.unitPrice,
        priceSubtotal: salesOrderLines.priceSubtotal,
        discountPercent: salesOrderLines.discountPercent,
        discountAmount: salesOrderLines.discountAmount,
        taxRatePercent: salesOrderLines.taxRatePercent,
      })
      .from(salesOrderLines)
      .leftJoin(products, eq(products.id, salesOrderLines.productId))
      .leftJoin(productUnits, eq(productUnits.id, salesOrderLines.productUnitId))
      .where(eq(salesOrderLines.salesOrderId, order.id));

    const [org] = await this.rawDb
      .select({
        name: organizations.name,
        logo: organizations.logo,
        metadata: organizations.metadata,
      })
      .from(organizations)
      .where(eq(organizations.id, order.organizationId))
      .limit(1);

    const companyProfile = org
      ? parseOrgCompanyProfile(org.metadata ?? null)
      : null;
    const documentTemplates = resolveDocumentTemplates(
      org ? parseOrgDocumentTemplates(org.metadata ?? null) : {},
    );
    const logoDataUri = org?.logo
      ? await this.uploadsService.readStoredFileAsDataUri(org.logo)
      : null;

    return {
      ...order,
      lines,
      branding: {
        companyName: org?.name ?? "Company",
        logoUrl: logoDataUri,
        phone: companyProfile?.phone,
        email: companyProfile?.email,
        website: companyProfile?.website,
        address: companyProfile?.address,
        city: companyProfile?.city,
        country: companyProfile?.country,
        taxId: companyProfile?.taxId,
        lineItemDetailsLayout: documentTemplates.lineItemDetailsLayout,
      },
    };
  }

  async signPublicQuotation(
    token: string,
    input: { signedBy: string; signatureImage: string; signedEmail?: string },
    clientIp: string,
  ) {
    const publicData = await this.getPublicByToken(token);

    if (publicData.state === "confirmed" || publicData.state === "cancelled") {
      throw new BadRequestException("This quotation cannot be signed");
    }

    if (!input.signatureImage?.trim()) {
      throw new BadRequestException("Signature is required");
    }

    if (input.signatureImage.length > 2_800_000) {
      throw new BadRequestException("Signature image is too large");
    }

    const signer = input.signedBy.trim();
    const alreadySigned = publicData.state === "signed" && Boolean(publicData.signedOn);

    if (alreadySigned) {
      const [existingActivity] = await this.rawDb
        .select({ id: salesActivities.id })
        .from(salesActivities)
        .where(
          and(
            eq(salesActivities.organizationId, publicData.organizationId),
            eq(salesActivities.entityType, "sales_order"),
            eq(salesActivities.entityId, publicData.id),
            eq(salesActivities.activityType, "signed"),
          ),
        )
        .limit(1);

      if (existingActivity) {
        return publicData;
      }

      await this.rawDb.insert(salesActivities).values({
        organizationId: publicData.organizationId,
        branchId: publicData.branchId,
        entityType: "sales_order",
        entityId: publicData.id,
        userId: null,
        activityType: "signed",
        message: `Quotation ${publicData.number} digitally signed by ${publicData.signedBy ?? signer}`,
      });
    } else {
      const signedOn = new Date();
      await this.rawDb.transaction(async (transaction) => {
        await transaction
          .update(salesOrders)
          .set({
            state: "signed",
            signedBy: signer,
            signedOn,
            signatureImage: input.signatureImage,
            signedIp: clientIp,
            signedEmail: input.signedEmail?.trim() ?? publicData.customerEmail,
            updatedAt: signedOn,
          })
          .where(eq(salesOrders.id, publicData.id));

        await transaction.insert(salesActivities).values({
          organizationId: publicData.organizationId,
          branchId: publicData.branchId,
          entityType: "sales_order",
          entityId: publicData.id,
          userId: null,
          activityType: "signed",
          message: `Quotation ${publicData.number} digitally signed by ${signer}`,
        });
      });
    }

    const [organizationSettings] = await this.rawDb
      .select({
        name: organizations.name,
        logo: organizations.logo,
        metadata: organizations.metadata,
      })
      .from(organizations)
      .where(eq(organizations.id, publicData.organizationId))
      .limit(1);
    const notificationProfile = parseOrgCompanyProfile(
      organizationSettings?.metadata,
    );
    const notificationLogo = organizationSettings?.logo
      ? await this.uploadsService.readStoredFileAsDataUri(organizationSettings.logo)
      : null;
    const alertEmails = [
      ...new Set(
        notificationProfile.alertEmails ?? [],
      ),
    ];
    if (alertEmails.length > 0) {
      const quotationUrl = `${resolvePublicAppUrl()}/dashboard/sales/quotations/${publicData.id}`;
      const signer = input.signedBy.trim();
      const notificationResults = await Promise.allSettled(
        alertEmails.map((recipient) =>
          this.mail.sendBrandedMail({
            to: recipient,
            replyTo:
              notificationProfile.replyToEmail || notificationProfile.email || undefined,
            brandName: organizationSettings?.name,
            logoUrl: notificationLogo,
            subject: `Quotation ${publicData.number} signed by ${signer}`,
            title: "Customer approval received",
            bodyText: `${signer} digitally signed quotation ${publicData.number}. The quotation is ready to be confirmed as a sales order.`,
            ctaLabel: "Review quotation",
            ctaUrl: quotationUrl,
          }),
        ),
      );

      notificationResults.forEach((result, index) => {
        const recipient = alertEmails[index];
        if (result.status === "rejected") {
          const message =
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason);
          this.logger.error(
            `Could not send quotation ${publicData.number} signature alert to ${recipient}: ${message}`,
          );
          return;
        }

        if (!result.value.delivered) {
          this.logger.warn(
            `Quotation ${publicData.number} signature alert to ${recipient} was not delivered (mail mode: ${result.value.mode}). Configure RESEND_API_KEY and MAIL_FROM_ADDRESS, or SMTP settings.`,
          );
        }
      });
    }

    return this.getPublicByToken(token);
  }

  private async logActivity(
    organizationId: string,
    entityId: string,
    userId: string | undefined,
    activityType:
      | "created"
      | "updated"
      | "note"
      | "sent"
      | "signed"
      | "confirmed"
      | "cancelled"
      | "invoiced"
      | "paid",
    message: string,
  ) {
    await this.db.insert(salesActivities).values({
      organizationId,
      entityType: "sales_order",
      entityId,
      userId: userId ?? null,
      activityType,
      message,
    });
  }
}
