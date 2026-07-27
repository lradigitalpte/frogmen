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
import { DATABASE } from "../database/database.constants";
import { DocumentRendererService } from "../documents/document-renderer.service";
import { ExchangeRatesService } from "../currencies/exchange-rates.service";
import { MailService } from "../mail/mail.service";
import { SettingsService } from "../settings/settings.service";
import { applyTemplatePlaceholders } from "@frog1/shared";
import { nextDocumentNumber } from "./document-sequences";
import {
  calculateLineAmounts,
  roundMoney,
  sumDocumentAmounts,
} from "./sales-calculations";

export interface ListQuotationsQuery {
  state?: "draft" | "sent" | "confirmed" | "cancelled";
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
}

export interface UpdateQuotationLineInput {
  description?: string;
  quantity?: number;
  unitPrice?: number;
  discountPercent?: number;
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
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly mail: MailService,
    private readonly documentRenderer: DocumentRendererService,
    private readonly settingsService: SettingsService,
    private readonly exchangeRatesService: ExchangeRatesService,
  ) {}

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
            inArray(salesOrders.state, ["draft", "sent"]),
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
      })
      .from(salesOrderLines)
      .leftJoin(productUnits, eq(productUnits.id, salesOrderLines.productUnitId))
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

    return {
      ...header.order,
      amountTotalBase: String(header.order.amountTotalBase ?? "0"),
      customerName: header.customerName,
      currencyCode: header.currencyCode?.trim() ?? null,
      lines: lines.map((row) => ({
        ...row.line,
        serialNumber: row.serialNumber,
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

    await this.db
      .update(salesOrders)
      .set(updates)
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
      "Quotation details updated",
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

    if (order.state !== "sent") {
      throw new BadRequestException(
        "Send the quotation to the customer before confirming it as a sales order",
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

    const subject =
      input.subject?.trim() ||
      applyTemplatePlaceholders(templates.emailSubject, placeholders);
    const text =
      input.body?.trim() ||
      applyTemplatePlaceholders(templates.emailBodyIntro, placeholders);

    const pdfBuffer = await this.documentRenderer.renderQuotationPdf(
      organizationId,
      orderId,
    );

    await this.mail.sendMail({
      to: recipientEmail,
      subject,
      text,
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

    const totals = sumDocumentAmounts(
      lines.map((line) => ({
        priceSubtotal: Number(line.priceSubtotal),
        priceTax: Number(line.priceTax),
        priceTotal: Number(line.priceTotal),
      })),
      exchangeRate,
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
      const amounts = calculateLineAmounts({
        quantity: Number(line.quantity),
        unitPrice,
        discountPercent: Number(line.discountPercent),
        taxRatePercent: Number(line.taxRatePercent),
      });

      await this.db
        .update(salesOrderLines)
        .set({
          unitPrice: String(unitPrice),
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

  private async logActivity(
    organizationId: string,
    entityId: string,
    userId: string | undefined,
    activityType:
      | "created"
      | "updated"
      | "note"
      | "sent"
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
