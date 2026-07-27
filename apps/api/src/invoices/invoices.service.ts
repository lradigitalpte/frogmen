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
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import {
  currencies,
  creditNotes,
  customerRefunds,
  customers,
  invoiceLines,
  invoicePayments,
  invoiceNotifications,
  invoices,
  organizations,
  paymentTerms,
  productUnits,
  products,
  salesActivities,
  salesOrderLines,
  salesOrders,
  stockLevels,
  warrantyRegistrations,
  type Database,
} from "@frog1/db";
import { convertPaymentToInvoiceAmount } from "@frog1/shared";
import { DATABASE } from "../database/database.constants";
import { AccountingService } from "../accounting/accounting.service";
import { ExchangeRatesService } from "../currencies/exchange-rates.service";
import { SettingsService } from "../settings/settings.service";
import { StockService } from "../stock/stock.service";
import { WarrantiesService } from "../warranty/warranties.service";
import { MailService } from "../mail/mail.service";
import { DocumentRendererService } from "../documents/document-renderer.service";
import { nextDocumentNumber } from "../sales/document-sequences";
import {
  calculateLineAmounts,
  sumDocumentAmounts,
} from "../sales/sales-calculations";

export interface ListInvoicesQuery {
  state?: "draft" | "posted" | "cancelled";
  paymentState?: "unpaid" | "partial" | "paid";
  customerId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  perPage?: number;
  sortBy?: "number" | "invoiceDate" | "amountTotal" | "createdAt";
  sortDir?: "asc" | "desc";
}

export interface AddInvoiceLineInput {
  productId?: string;
  productUnitId?: string;
  salesOrderLineId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  taxRatePercent?: number;
}

export interface CreateInvoiceInput {
  salesOrderId?: string;
  customerId?: string;
  currencyId?: string;
  paymentTermId?: string;
  invoiceDate: string;
  dueDate?: string;
  customerReference?: string;
  internalReference?: string;
  notes?: string;
  lines?: AddInvoiceLineInput[];
}

export interface RegisterPaymentInput {
  amount: number;
  paymentDate: string;
  currencyId?: string;
  reference?: string;
  method?: string;
}

@Injectable()
export class InvoicesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly exchangeRatesService: ExchangeRatesService,
    private readonly stockService: StockService,
    private readonly settingsService: SettingsService,
    private readonly accountingService: AccountingService,
    private readonly warrantiesService: WarrantiesService,
    private readonly mailService: MailService,
    private readonly documentRenderer: DocumentRendererService,
  ) {}

  async list(organizationId: string, query: ListInvoicesQuery = {}) {
    const page = Math.max(query.page ?? 1, 1);
    const perPage = Math.min(Math.max(query.perPage ?? 100, 1), 100);
    const offset = (page - 1) * perPage;

    const filters: SQL[] = [
      eq(invoices.organizationId, organizationId),
      isNull(invoices.deletedAt),
    ];

    if (query.state) {
      filters.push(eq(invoices.state, query.state));
    }

    if (query.paymentState) {
      filters.push(eq(invoices.paymentState, query.paymentState));
    }

    if (query.customerId) {
      filters.push(eq(invoices.customerId, query.customerId));
    }

    if (query.dateFrom) {
      filters.push(gte(invoices.invoiceDate, query.dateFrom));
    }

    if (query.dateTo) {
      filters.push(lte(invoices.invoiceDate, query.dateTo));
    }

    if (query.search?.trim()) {
      const term = `%${query.search.trim()}%`;
      filters.push(
        or(
          ilike(invoices.number, term),
          ilike(invoices.customerReference, term),
          ilike(invoices.internalReference, term),
        )!,
      );
    }

    const whereClause = and(...filters);
    const sortColumn =
      query.sortBy === "invoiceDate"
        ? invoices.invoiceDate
        : query.sortBy === "amountTotal"
          ? invoices.amountTotal
          : query.sortBy === "createdAt"
            ? invoices.createdAt
            : invoices.number;

    const orderBy =
      query.sortDir === "desc" ? desc(sortColumn) : asc(sortColumn);

    const [rows, totalResult] = await Promise.all([
      this.db
        .select({
          invoice: invoices,
          customerName: customers.name,
          customerEmail: customers.email,
          currencyCode: currencies.code,
          paymentTermName: paymentTerms.name,
        })
        .from(invoices)
        .innerJoin(customers, eq(customers.id, invoices.customerId))
        .innerJoin(currencies, eq(currencies.id, invoices.currencyId))
        .leftJoin(paymentTerms, eq(paymentTerms.id, invoices.paymentTermId))
        .where(whereClause)
        .orderBy(orderBy)
        .limit(perPage)
        .offset(offset),
      this.db.select({ total: count() }).from(invoices).where(whereClause),
    ]);

    return {
      data: rows.map((row) =>
        this.mapInvoiceSummary({
          ...row.invoice,
          customerName: row.customerName,
          customerEmail: row.customerEmail,
          currencyCode: row.currencyCode?.trim() ?? null,
          paymentTermName: row.paymentTermName,
        }),
      ),
      meta: {
        page,
        perPage,
        total: Number(totalResult[0]?.total ?? 0),
        totalPages:
          Math.ceil(Number(totalResult[0]?.total ?? 0) / perPage) || 1,
      },
    };
  }

  async getById(organizationId: string, id: string) {
    const [header] = await this.db
      .select({
        invoice: invoices,
        customerName: customers.name,
        customerEmail: customers.email,
        currencyCode: currencies.code,
        paymentTermName: paymentTerms.name,
      })
      .from(invoices)
      .innerJoin(customers, eq(customers.id, invoices.customerId))
      .innerJoin(currencies, eq(currencies.id, invoices.currencyId))
      .leftJoin(paymentTerms, eq(paymentTerms.id, invoices.paymentTermId))
      .where(
        and(
          eq(invoices.id, id),
          eq(invoices.organizationId, organizationId),
          isNull(invoices.deletedAt),
        ),
      )
      .limit(1);

    if (!header) {
      throw new NotFoundException("Invoice not found");
    }

    const lines = await this.db
      .select({
        line: invoiceLines,
        serialNumber: productUnits.serialNumber,
      })
      .from(invoiceLines)
      .leftJoin(productUnits, eq(productUnits.id, invoiceLines.productUnitId))
      .where(eq(invoiceLines.invoiceId, id))
      .orderBy(asc(invoiceLines.lineNumber));

    const [creditNote] = await this.db.select().from(creditNotes)
      .where(and(eq(creditNotes.organizationId, organizationId), eq(creditNotes.invoiceId, id)))
      .orderBy(desc(creditNotes.createdAt)).limit(1);
    const detail = this.mapInvoiceDetail({
      ...header.invoice,
      customerName: header.customerName,
      customerEmail: header.customerEmail,
      currencyCode: header.currencyCode?.trim() ?? null,
      paymentTermName: header.paymentTermName,
      lines: lines.map((row) => ({
        ...row.line,
        serialNumber: row.serialNumber,
      })),
    });
    return {
      ...detail,
      creditNote: creditNote
        ? {
            id: creditNote.id, number: creditNote.number, reason: creditNote.reason,
            refundDue: Number(creditNote.refundDue), refundPaid: Number(creditNote.refundPaid),
            returnToStock: creditNote.returnToStock,
          }
        : null,
    };
  }

  async create(
    organizationId: string,
    userId: string | undefined,
    input: CreateInvoiceInput,
  ) {
    if (input.salesOrderId) {
      return this.createFromSalesOrder(
        organizationId,
        userId,
        input.salesOrderId,
        input,
      );
    }

    if (!input.customerId) {
      throw new BadRequestException("customerId is required");
    }

    if (!input.currencyId) {
      throw new BadRequestException("currencyId is required");
    }

    if (!input.lines?.length) {
      throw new BadRequestException("Add at least one line before creating an invoice");
    }

    await this.getCustomer(organizationId, input.customerId);

    const exchangeRate = await this.resolveExchangeRate(
      organizationId,
      input.currencyId,
      input.invoiceDate,
    );

    const number = await nextDocumentNumber(
      this.db,
      organizationId,
      "invoice",
      "INV-",
    );

    const [invoice] = await this.db
      .insert(invoices)
      .values({
        organizationId,
        number,
        customerId: input.customerId,
        currencyId: input.currencyId,
        exchangeRate: String(exchangeRate),
        paymentTermId: input.paymentTermId ?? null,
        invoiceDate: input.invoiceDate,
        dueDate: input.dueDate ?? null,
        customerReference: input.customerReference ?? null,
        internalReference: input.internalReference ?? null,
        notes: input.notes ?? null,
        state: "draft",
        paymentState: "unpaid",
      })
      .returning();

    await this.insertLines(invoice.id, input.lines);
    await this.recomputeInvoiceTotals(invoice.id, exchangeRate);

    await this.logActivity(
      organizationId,
      invoice.id,
      userId,
      "created",
      `Invoice ${number} created`,
    );

    return this.getById(organizationId, invoice.id);
  }

  async confirm(
    organizationId: string,
    invoiceId: string,
    userId: string | undefined,
  ) {
    const invoice = await this.getEditableInvoice(organizationId, invoiceId);

    const lines = await this.db
      .select({ id: invoiceLines.id })
      .from(invoiceLines)
      .where(eq(invoiceLines.invoiceId, invoiceId));

    if (lines.length === 0) {
      throw new BadRequestException("Add at least one line before posting");
    }

    const exchangeRate = await this.resolveExchangeRate(
      organizationId,
      invoice.currencyId,
      invoice.invoiceDate,
    );

    await this.recomputeInvoiceTotals(invoiceId, exchangeRate);

    await this.validateInventoryBeforePost(organizationId, invoiceId);

    const [updated] = await this.db
      .update(invoices)
      .set({
        state: "posted",
        exchangeRate: String(exchangeRate),
        exchangeRateLockedAt: new Date(),
        postedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId))
      .returning();

    if (updated.salesOrderId) {
      await this.syncSalesOrderInvoiceStatus(organizationId, updated.salesOrderId);

      await this.logSalesOrderActivity(
        organizationId,
        updated.salesOrderId,
        userId,
        "invoiced",
        `Sales order invoiced as ${updated.number}`,
      );
    }

    await this.logActivity(
      organizationId,
      invoiceId,
      userId,
      "updated",
      `Invoice ${updated.number} posted`,
    );

    await this.fulfillSerialUnitsOnPost(organizationId, invoiceId);
    await this.fulfillBulkStockOnPost(organizationId, invoiceId);
    await this.warrantiesService.registerFromInvoicePost(
      organizationId,
      invoiceId,
    );
    await this.accountingService.postCustomerInvoice(
      organizationId,
      invoiceId,
      userId,
    );

    return this.getById(organizationId, invoiceId);
  }

  async resetToDraft(
    organizationId: string,
    invoiceId: string,
    userId: string | undefined,
  ) {
    void organizationId;
    void invoiceId;
    void userId;
    throw new BadRequestException(
      "Posted invoices cannot be reset to draft. Cancel the invoice to preserve its accounting history.",
    );
    /*
    const invoice = await this.getById(organizationId, invoiceId);

    if (invoice.paymentState === "paid" || invoice.paymentState === "partial") {
      throw new BadRequestException(
        "Paid or partially paid invoices cannot be reset to draft",
      );
    }

    if (invoice.state !== "posted") {
      throw new BadRequestException("Only posted invoices can be reset to draft");
    }

    const exchangeRate = await this.resolveExchangeRate(
      organizationId,
      invoice.currencyId,
    );

    await this.recomputeInvoiceTotals(invoiceId, exchangeRate);

    const [updated] = await this.db
      .update(invoices)
      .set({
        state: "draft",
        exchangeRateLockedAt: null,
        postedAt: null,
        exchangeRate: String(exchangeRate),
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId))
      .returning();

    if (updated.salesOrderId) {
      await this.db
        .update(salesOrders)
        .set({
          invoiceStatus: "to_invoice",
          updatedAt: new Date(),
        })
        .where(eq(salesOrders.id, updated.salesOrderId));
    }

    await this.logActivity(
      organizationId,
      invoiceId,
      userId,
      "updated",
      `Invoice ${updated.number} reset to draft`,
    );

    return this.getById(organizationId, invoiceId);
    */
  }

  async cancelInvoice(
    organizationId: string,
    invoiceId: string,
    userId: string | undefined,
    input: { reason: string; returnToStock?: boolean },
  ) {
    if (!input.reason?.trim()) throw new BadRequestException("Cancellation reason is required");
    const invoice = await this.getById(organizationId, invoiceId);
    if (invoice.state === "cancelled") return this.getById(organizationId, invoiceId);

    let creditNote: Awaited<ReturnType<InvoicesService["createCreditNote"]>> | null = null;
    if (invoice.state === "posted") {
      creditNote = await this.createCreditNote(organizationId, invoiceId, userId, {
        reason: input.reason,
        returnToStock: Boolean(input.returnToStock),
      });
      if (input.returnToStock) await this.restoreInvoiceStock(organizationId, invoiceId);
    }

    await this.db.update(invoices).set({
      state: "cancelled",
      cancelledAt: new Date(),
      cancelledByUserId: userId ?? null,
      cancellationReason: input.reason.trim(),
      cancellationReturnToStock: Boolean(input.returnToStock),
      updatedAt: new Date(),
    }).where(and(eq(invoices.id, invoiceId), eq(invoices.organizationId, organizationId)));

    if (invoice.salesOrderId) {
      await this.db.update(salesOrders).set({ invoiceStatus: "to_invoice", updatedAt: new Date() })
        .where(eq(salesOrders.id, invoice.salesOrderId));
    }
    await this.logActivity(organizationId, invoiceId, userId, "updated", `Invoice ${invoice.number} cancelled: ${input.reason.trim()}`);
    const updated = await this.getById(organizationId, invoiceId);
    return { ...updated, creditNote };
  }

  async archiveCancelledInvoice(organizationId: string, invoiceId: string) {
    const invoice = await this.getById(organizationId, invoiceId);
    if (invoice.state !== "cancelled") throw new BadRequestException("Only cancelled invoices can be deleted");
    await this.db.update(invoices).set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(invoices.id, invoiceId), eq(invoices.organizationId, organizationId)));
    return { archived: true };
  }

  private async restoreInvoiceStock(organizationId: string, invoiceId: string) {
    const defaultWarehouseId = await this.settingsService.getDefaultWarehouseId(organizationId);
    const rows = await this.db.select({ line: invoiceLines, product: products, salesLine: salesOrderLines })
      .from(invoiceLines).leftJoin(products, eq(products.id, invoiceLines.productId))
      .leftJoin(salesOrderLines, eq(salesOrderLines.id, invoiceLines.salesOrderLineId))
      .where(eq(invoiceLines.invoiceId, invoiceId));
    for (const row of rows) {
      if (!row.product?.isStorable || row.product.type === "service") continue;
      if (row.line.productUnitId) {
        await this.db.update(productUnits).set({ status: "in_stock", updatedAt: new Date() })
          .where(and(eq(productUnits.id, row.line.productUnitId), eq(productUnits.organizationId, organizationId)));
      } else {
        const warehouseId = row.salesLine?.warehouseId ?? defaultWarehouseId;
        if (warehouseId) await this.stockService.adjust(organizationId, {
          productId: row.product.id, warehouseId, adjustment: String(Number(row.line.quantity)),
        });
      }
    }
    await this.db.update(warrantyRegistrations).set({
      status: "voided", notes: sql`coalesce(${warrantyRegistrations.notes}, '') || ' Voided after invoice cancellation and stock return.'`, updatedAt: new Date(),
    }).where(and(eq(warrantyRegistrations.organizationId, organizationId), eq(warrantyRegistrations.invoiceId, invoiceId)));
  }

  async registerPayment(
    organizationId: string,
    invoiceId: string,
    userId: string | undefined,
    input: RegisterPaymentInput,
  ) {
    const invoice = await this.getById(organizationId, invoiceId);

    if (invoice.state !== "posted") {
      throw new BadRequestException("Only posted invoices can receive payments");
    }

    if (invoice.paymentState === "paid") {
      throw new BadRequestException("Invoice is already fully paid");
    }

    const paymentAmount = input.amount;
    if (!paymentAmount || paymentAmount <= 0) {
      throw new BadRequestException("Payment amount must be greater than zero");
    }

    const paymentCurrencyId = input.currencyId ?? invoice.currencyId;
    let invoiceCreditAmount = paymentAmount;

    if (paymentCurrencyId !== invoice.currencyId) {
      const paymentToInvoiceRate =
        await this.exchangeRatesService.getRequiredRate(
          organizationId,
          paymentCurrencyId,
          invoice.currencyId,
          input.paymentDate,
        );
      invoiceCreditAmount = convertPaymentToInvoiceAmount(
        paymentAmount,
        paymentToInvoiceRate,
      );
    }

    const outstanding = Math.max(
      Number(invoice.amountTotal) - Number(invoice.amountPaid),
      0,
    );
    const roundingDifference = invoiceCreditAmount - outstanding;
    if (roundingDifference > 0 && roundingDifference <= 0.01) {
      invoiceCreditAmount = outstanding;
    }

    if (invoiceCreditAmount > outstanding) {
      throw new BadRequestException(
        `Payment exceeds outstanding balance (${outstanding} in invoice currency)`,
      );
    }

    const paymentToBaseRate = await this.resolveExchangeRate(
      organizationId,
      paymentCurrencyId,
      input.paymentDate,
    );

    const [payment] = await this.db
      .insert(invoicePayments)
      .values({
        organizationId,
        invoiceId,
        amount: String(paymentAmount),
        currencyId: paymentCurrencyId,
        exchangeRate: String(paymentToBaseRate),
        paymentDate: input.paymentDate,
        reference: input.reference ?? null,
        method: input.method ?? null,
      })
      .returning();

    const newAmountPaid = Number(invoice.amountPaid) + invoiceCreditAmount;
    const amountTotal = Number(invoice.amountTotal);
    const paymentState =
      newAmountPaid >= amountTotal
        ? "paid"
        : newAmountPaid > 0
          ? "partial"
          : "unpaid";

    await this.db
      .update(invoices)
      .set({
        amountPaid: String(Math.min(newAmountPaid, amountTotal)),
        paymentState,
        paidAt: paymentState === "paid" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId));

    await this.logActivity(
      organizationId,
      invoiceId,
      userId,
      "paid",
      paymentCurrencyId === invoice.currencyId
        ? `Payment of ${paymentAmount} registered on invoice ${invoice.number}`
        : `Payment of ${paymentAmount} (${invoiceCreditAmount} on invoice) registered on invoice ${invoice.number}`,
    );

    await this.accountingService.postCustomerPayment(
      organizationId,
      payment.id,
      userId,
    );

    return this.getById(organizationId, invoiceId);
  }

  listPayments(organizationId: string) {
    return this.db
      .select({
        payment: invoicePayments,
        invoiceNumber: invoices.number,
        customerName: customers.name,
        currencyCode: currencies.code,
      })
      .from(invoicePayments)
      .innerJoin(invoices, eq(invoices.id, invoicePayments.invoiceId))
      .innerJoin(customers, eq(customers.id, invoices.customerId))
      .innerJoin(currencies, eq(currencies.id, invoicePayments.currencyId))
      .where(eq(invoicePayments.organizationId, organizationId))
      .orderBy(desc(invoicePayments.paymentDate));
  }

  async createCreditNote(
    organizationId: string,
    invoiceId: string,
    userId: string | undefined,
    input: { reason: string; creditDate?: string; returnToStock?: boolean },
  ) {
    const invoice = await this.getById(organizationId, invoiceId);
    if (invoice.state !== "posted") {
      throw new BadRequestException("Only posted invoices can be credited");
    }
    if (!input.reason?.trim()) {
      throw new BadRequestException("A credit note reason is required");
    }

    const [existing] = await this.db
      .select({ id: creditNotes.id })
      .from(creditNotes)
      .where(
        and(
          eq(creditNotes.organizationId, organizationId),
          eq(creditNotes.invoiceId, invoiceId),
          eq(creditNotes.state, "posted"),
        ),
      )
      .limit(1);
    if (existing) {
      throw new BadRequestException("This invoice already has a posted full credit note");
    }

    const number = await nextDocumentNumber(
      this.db,
      organizationId,
      "credit_note",
      "CN-",
    );
    const creditDate = input.creditDate ?? new Date().toISOString().slice(0, 10);
    const [creditNote] = await this.db
      .insert(creditNotes)
      .values({
        organizationId,
        invoiceId,
        customerId: invoice.customerId,
        currencyId: invoice.currencyId,
        number,
        creditDate,
        reason: input.reason.trim(),
        amountUntaxed: String(invoice.amountUntaxed),
        amountTax: String(invoice.amountTax),
        amountTotal: String(invoice.amountTotal),
        amountTotalBase: String(invoice.amountTotalBase),
        state: "posted",
        returnToStock: Boolean(input.returnToStock),
        refundDue: String(invoice.amountPaid ?? 0),
      })
      .returning();

    await this.accountingService.postCustomerCreditNote(organizationId, {
      invoiceId,
      number,
      creditDate,
      untaxedBase: Number(invoice.amountUntaxed) * Number(invoice.exchangeRate ?? 1),
      taxBase: Number(invoice.amountTax) * Number(invoice.exchangeRate ?? 1),
      returnToStock: Boolean(input.returnToStock),
    });
    await this.logActivity(
      organizationId,
      invoiceId,
      userId,
      "updated",
      `Credit note ${number} posted for invoice ${invoice.number}`,
    );

    return {
      id: creditNote.id,
      number,
      invoiceNumber: invoice.number,
      customerName: invoice.customerName,
      date: creditDate,
      reason: creditNote.reason,
      amount: Number(creditNote.amountTotal),
      currencyId: creditNote.currencyId,
      currencyCode: invoice.currencyCode,
      status: "posted" as const,
      refundDue: Number(invoice.amountPaid ?? 0),
      refundPaid: 0,
    };
  }

  async recordCreditNoteRefund(
    organizationId: string,
    creditNoteId: string,
    input: { amount: number; currencyId: string; refundDate: string; method: string; reference?: string },
  ) {
    const [note] = await this.db.select().from(creditNotes)
      .where(and(eq(creditNotes.id, creditNoteId), eq(creditNotes.organizationId, organizationId))).limit(1);
    if (!note) throw new NotFoundException("Credit note not found");
    const paymentToInvoiceRate = await this.exchangeRatesService.getRequiredRate(
      organizationId, input.currencyId, note.currencyId, input.refundDate,
    );
    const invoiceAmount = Math.round(input.amount * paymentToInvoiceRate * 100) / 100;
    const remaining = Number(note.refundDue) - Number(note.refundPaid);
    if (input.amount <= 0 || invoiceAmount > remaining + 0.01) throw new BadRequestException("Refund exceeds amount due");
    const baseRate = await this.resolveExchangeRate(organizationId, input.currencyId, input.refundDate);
    const [refund] = await this.db.insert(customerRefunds).values({
      organizationId, creditNoteId, invoiceId: note.invoiceId, currencyId: input.currencyId,
      amount: String(input.amount), exchangeRate: String(baseRate), refundDate: input.refundDate,
      method: input.method, reference: input.reference ?? null,
    }).returning();
    await this.accountingService.postCustomerRefund(organizationId, {
      refundId: refund.id, invoiceId: note.invoiceId, amountBase: Math.round(input.amount * baseRate * 100) / 100,
      refundDate: input.refundDate, method: input.method, reference: input.reference,
    });
    await this.db.update(creditNotes).set({ refundPaid: String(Math.min(Number(note.refundPaid) + invoiceAmount, Number(note.refundDue))) })
      .where(eq(creditNotes.id, creditNoteId));
    return refund;
  }

  async sendCancellationEmail(
    organizationId: string,
    invoiceId: string,
    input: { recipientEmail: string; subject: string; body: string },
  ) {
    const invoice = await this.getById(organizationId, invoiceId);
    if (invoice.state !== "cancelled") throw new BadRequestException("Invoice is not cancelled");
    const [note] = await this.db.select().from(creditNotes).where(eq(creditNotes.invoiceId, invoiceId)).limit(1);
    try {
      const attachment = note
        ? await this.documentRenderer.renderCreditNotePdf(organizationId, note)
        : null;
      const delivery = await this.mailService.sendMail({
        to: input.recipientEmail,
        subject: input.subject,
        text: input.body,
        attachments: attachment
          ? [{ filename: `${note!.number}.pdf`, content: attachment }]
          : undefined,
      });
      await this.db.insert(invoiceNotifications).values({
        organizationId, invoiceId, creditNoteId: note?.id ?? null, recipientEmail: input.recipientEmail,
        subject: input.subject, body: input.body, deliveryStatus: delivery.delivered ? "sent" : "logged", sentAt: new Date(),
      });
      return delivery;
    } catch (error) {
      await this.db.insert(invoiceNotifications).values({
        organizationId, invoiceId, creditNoteId: note?.id ?? null, recipientEmail: input.recipientEmail,
        subject: input.subject, body: input.body, deliveryStatus: "failed",
      });
      throw error;
    }
  }

  listCreditNotes(organizationId: string) {
    return this.db
      .select({
        id: creditNotes.id,
        number: creditNotes.number,
        invoiceNumber: invoices.number,
        customerName: customers.name,
        date: creditNotes.creditDate,
        reason: creditNotes.reason,
        amount: creditNotes.amountTotal,
        currencyId: creditNotes.currencyId,
        currencyCode: currencies.code,
        status: creditNotes.state,
        refundDue: creditNotes.refundDue,
        refundPaid: creditNotes.refundPaid,
      })
      .from(creditNotes)
      .innerJoin(invoices, eq(invoices.id, creditNotes.invoiceId))
      .innerJoin(customers, eq(customers.id, creditNotes.customerId))
      .innerJoin(currencies, eq(currencies.id, creditNotes.currencyId))
      .where(eq(creditNotes.organizationId, organizationId))
      .orderBy(desc(creditNotes.createdAt))
      .then((rows) =>
        rows.map((row) => ({
          ...row,
          amount: Number(row.amount),
          refundDue: Number(row.refundDue),
          refundPaid: Number(row.refundPaid),
        })),
      );
  }

  async getCreditNote(organizationId: string, id: string) {
    const [note] = await this.db.select().from(creditNotes)
      .where(and(eq(creditNotes.id, id), eq(creditNotes.organizationId, organizationId))).limit(1);
    if (!note) throw new NotFoundException("Credit note not found");
    return note;
  }

  private async createFromSalesOrder(
    organizationId: string,
    userId: string | undefined,
    salesOrderId: string,
    input: CreateInvoiceInput,
  ) {
    const [order] = await this.db
      .select()
      .from(salesOrders)
      .where(
        and(
          eq(salesOrders.id, salesOrderId),
          eq(salesOrders.organizationId, organizationId),
          isNull(salesOrders.deletedAt),
        ),
      )
      .limit(1);

    if (!order) {
      throw new NotFoundException("Sales order not found");
    }

    if (order.state !== "confirmed") {
      throw new BadRequestException(
        "Only confirmed sales orders can be invoiced",
      );
    }

    if (order.invoiceStatus === "invoiced") {
      throw new BadRequestException(
        "This sales order has already been fully invoiced",
      );
    }

    const orderLines = await this.db
      .select()
      .from(salesOrderLines)
      .where(eq(salesOrderLines.salesOrderId, salesOrderId))
      .orderBy(asc(salesOrderLines.lineNumber));

    if (orderLines.length === 0) {
      throw new BadRequestException(
        "Sales order has no lines to invoice",
      );
    }

    const invoicedQtyByLine = await this.getInvoicedQtyBySalesOrderLine(
      organizationId,
      salesOrderId,
    );

    const lineInputs: AddInvoiceLineInput[] = input.lines?.length
      ? input.lines
      : orderLines.map((line) => {
          const orderedQty = Number(line.quantity);
          const alreadyInvoiced = invoicedQtyByLine.get(line.id) ?? 0;
          const remainingQty = orderedQty - alreadyInvoiced;

          return {
            salesOrderLineId: line.id,
            productId: line.productId ?? undefined,
            productUnitId: line.productUnitId ?? undefined,
            description: line.description,
            quantity: remainingQty,
            unitPrice: Number(line.unitPrice),
            discountPercent: Number(line.discountPercent),
            taxRatePercent: Number(line.taxRatePercent),
          };
        });

    const validLines = lineInputs.filter((line) => line.quantity > 0);

    if (validLines.length === 0) {
      throw new BadRequestException(
        "All sales order lines are already fully invoiced",
      );
    }

    for (const line of validLines) {
      if (!line.salesOrderLineId) {
        continue;
      }

      const orderLine = orderLines.find((row) => row.id === line.salesOrderLineId);
      if (!orderLine) {
        throw new BadRequestException("Invalid sales order line on invoice");
      }

      const orderedQty = Number(orderLine.quantity);
      const alreadyInvoiced = invoicedQtyByLine.get(orderLine.id) ?? 0;
      const remainingQty = orderedQty - alreadyInvoiced;

      if (line.quantity > remainingQty) {
        throw new BadRequestException(
          `Cannot invoice ${line.quantity} for ${orderLine.description}; only ${remainingQty} remaining`,
        );
      }
    }

    const exchangeRate =
      order.exchangeRateLockedAt && order.exchangeRate
        ? Number(order.exchangeRate)
        : await this.resolveExchangeRate(organizationId, order.currencyId);

    const number = await nextDocumentNumber(
      this.db,
      organizationId,
      "invoice",
      "INV-",
    );

    const [invoice] = await this.db
      .insert(invoices)
      .values({
        organizationId,
        salesOrderId,
        number,
        customerId: order.customerId,
        currencyId: order.currencyId,
        exchangeRate: String(exchangeRate),
        paymentTermId: order.paymentTermId,
        invoiceDate: input.invoiceDate,
        dueDate: input.dueDate ?? null,
        customerReference:
          input.customerReference ?? order.customerReference ?? null,
        internalReference:
          input.internalReference ?? order.internalReference ?? null,
        notes: input.notes ?? order.notes ?? null,
        state: "draft",
        paymentState: "unpaid",
      })
      .returning();

    const lineInputsToInsert = validLines;

    await this.insertLines(invoice.id, lineInputsToInsert);
    await this.recomputeInvoiceTotals(invoice.id, exchangeRate);

    await this.logActivity(
      organizationId,
      invoice.id,
      userId,
      "created",
      `Invoice ${number} created from sales order ${order.number}`,
    );

    return this.getById(organizationId, invoice.id);
  }

  private async insertLines(invoiceId: string, lines: AddInvoiceLineInput[]) {
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      const amounts = calculateLineAmounts({
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountPercent: line.discountPercent ?? 0,
        taxRatePercent: line.taxRatePercent ?? 0,
      });

      await this.db.insert(invoiceLines).values({
        invoiceId,
        lineNumber: index + 1,
        salesOrderLineId: line.salesOrderLineId ?? null,
        productId: line.productId ?? null,
        productUnitId: line.productUnitId ?? null,
        description: line.description.trim(),
        quantity: String(line.quantity),
        unitPrice: String(line.unitPrice),
        discountPercent: String(line.discountPercent ?? 0),
        taxRatePercent: String(line.taxRatePercent ?? 0),
        priceSubtotal: String(amounts.priceSubtotal),
        priceTax: String(amounts.priceTax),
        priceTotal: String(amounts.priceTotal),
      });
    }
  }

  private async recomputeInvoiceTotals(
    invoiceId: string,
    exchangeRate: number,
  ) {
    const lines = await this.db
      .select()
      .from(invoiceLines)
      .where(eq(invoiceLines.invoiceId, invoiceId));

    const totals = sumDocumentAmounts(
      lines.map((line) => ({
        priceSubtotal: Number(line.priceSubtotal),
        priceTax: Number(line.priceTax),
        priceTotal: Number(line.priceTotal),
      })),
      exchangeRate,
    );

    await this.db
      .update(invoices)
      .set({
        amountUntaxed: String(totals.amountUntaxed),
        amountTax: String(totals.amountTax),
        amountTotal: String(totals.amountTotal),
        amountUntaxedBase: String(totals.amountUntaxedBase),
        amountTaxBase: String(totals.amountTaxBase),
        amountTotalBase: String(totals.amountTotalBase),
        exchangeRate: String(exchangeRate),
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId));
  }

  private async fulfillSerialUnitsOnPost(
    organizationId: string,
    invoiceId: string,
  ) {
    const lines = await this.db
      .select({ productUnitId: invoiceLines.productUnitId })
      .from(invoiceLines)
      .where(eq(invoiceLines.invoiceId, invoiceId));

    const unitIds = lines
      .map((line) => line.productUnitId)
      .filter((id): id is string => Boolean(id));

    if (unitIds.length === 0) {
      return;
    }

    await this.db
      .update(productUnits)
      .set({
        status: "sold",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(productUnits.organizationId, organizationId),
          inArray(productUnits.id, unitIds),
        ),
      );
  }

  private async validateInventoryBeforePost(
    organizationId: string,
    invoiceId: string,
  ) {
    const defaultWarehouseId =
      await this.settingsService.getDefaultWarehouseId(organizationId);

    const lines = await this.db
      .select({
        line: invoiceLines,
        product: products,
        salesOrderLine: salesOrderLines,
        serialNumber: productUnits.serialNumber,
        unitStatus: productUnits.status,
      })
      .from(invoiceLines)
      .leftJoin(products, eq(products.id, invoiceLines.productId))
      .leftJoin(
        salesOrderLines,
        eq(salesOrderLines.id, invoiceLines.salesOrderLineId),
      )
      .leftJoin(productUnits, eq(productUnits.id, invoiceLines.productUnitId))
      .where(eq(invoiceLines.invoiceId, invoiceId));

    for (const row of lines) {
      const product = row.product;
      if (!product || product.type === "service" || !product.isStorable) {
        continue;
      }

      if (product.trackSerial) {
        if (!row.line.productUnitId) {
          throw new BadRequestException(
            `Serial number is required for ${row.line.description}`,
          );
        }

        if (row.unitStatus !== "in_stock" && row.unitStatus !== "assigned") {
          const serialLabel = row.serialNumber
            ? `Serial ${row.serialNumber}`
            : "This serial unit";
          throw new BadRequestException(
            `${serialLabel} is no longer available for invoicing`,
          );
        }

        continue;
      }

      const warehouseId =
        row.salesOrderLine?.warehouseId ?? defaultWarehouseId;
      if (!warehouseId) {
        throw new BadRequestException(
          `Set a default fulfillment warehouse in Settings before invoicing ${row.line.description}`,
        );
      }

      const available = await this.stockService.getAvailableQuantity(
        organizationId,
        product.id,
        warehouseId,
      );
      const requiredQty = Number(row.line.quantity);

      if (available < requiredQty) {
        throw new BadRequestException(
          `Only ${available} unit(s) available for ${row.line.description} in the selected warehouse`,
        );
      }
    }
  }

  private async fulfillBulkStockOnPost(
    organizationId: string,
    invoiceId: string,
  ) {
    const defaultWarehouseId =
      await this.settingsService.getDefaultWarehouseId(organizationId);

    const lines = await this.db
      .select({
        line: invoiceLines,
        product: products,
        salesOrderLine: salesOrderLines,
      })
      .from(invoiceLines)
      .leftJoin(products, eq(products.id, invoiceLines.productId))
      .leftJoin(
        salesOrderLines,
        eq(salesOrderLines.id, invoiceLines.salesOrderLineId),
      )
      .where(eq(invoiceLines.invoiceId, invoiceId));

    for (const row of lines) {
      const product = row.product;
      if (
        !product ||
        product.type === "service" ||
        !product.isStorable ||
        product.trackSerial
      ) {
        continue;
      }

      const warehouseId =
        row.salesOrderLine?.warehouseId ?? defaultWarehouseId;
      if (!warehouseId) {
        continue;
      }

      await this.stockService.adjust(organizationId, {
        productId: product.id,
        warehouseId,
        adjustment: String(-Number(row.line.quantity)),
      });
    }
  }

  private async getInvoicedQtyBySalesOrderLine(
    organizationId: string,
    salesOrderId: string,
  ) {
    const rows = await this.db
      .select({
        salesOrderLineId: invoiceLines.salesOrderLineId,
        quantity: invoiceLines.quantity,
      })
      .from(invoiceLines)
      .innerJoin(invoices, eq(invoices.id, invoiceLines.invoiceId))
      .where(
        and(
          eq(invoices.organizationId, organizationId),
          eq(invoices.salesOrderId, salesOrderId),
          eq(invoices.state, "posted"),
          isNull(invoices.deletedAt),
        ),
      );

    const map = new Map<string, number>();
    for (const row of rows) {
      if (!row.salesOrderLineId) {
        continue;
      }
      map.set(
        row.salesOrderLineId,
        (map.get(row.salesOrderLineId) ?? 0) + Number(row.quantity),
      );
    }

    return map;
  }

  private async syncSalesOrderInvoiceStatus(
    organizationId: string,
    salesOrderId: string,
  ) {
    const orderLines = await this.db
      .select({ id: salesOrderLines.id, quantity: salesOrderLines.quantity })
      .from(salesOrderLines)
      .where(eq(salesOrderLines.salesOrderId, salesOrderId));

    const invoicedQtyByLine = await this.getInvoicedQtyBySalesOrderLine(
      organizationId,
      salesOrderId,
    );

    let fullyInvoiced = orderLines.length > 0;
    let anyInvoiced = false;

    for (const line of orderLines) {
      const orderedQty = Number(line.quantity);
      const invoicedQty = invoicedQtyByLine.get(line.id) ?? 0;
      if (invoicedQty > 0) {
        anyInvoiced = true;
      }
      if (invoicedQty < orderedQty) {
        fullyInvoiced = false;
      }
    }

    const invoiceStatus = fullyInvoiced
      ? "invoiced"
      : anyInvoiced
        ? "partial"
        : "to_invoice";

    await this.db
      .update(salesOrders)
      .set({
        invoiceStatus,
        updatedAt: new Date(),
      })
      .where(eq(salesOrders.id, salesOrderId));
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

  private async getEditableInvoice(organizationId: string, invoiceId: string) {
    const invoice = await this.getById(organizationId, invoiceId);

    if (invoice.state === "posted" || invoice.state === "cancelled") {
      throw new BadRequestException("This invoice can no longer be edited");
    }

    return invoice;
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

  private mapInvoiceStatus(
    state: string,
    paymentState: string,
  ): "draft" | "posted" | "paid" | "cancelled" {
    if (state === "cancelled") {
      return "cancelled";
    }

    if (paymentState === "paid") {
      return "paid";
    }

    if (state === "posted") {
      return "posted";
    }

    return "draft";
  }

  private mapInvoiceSummary(
    row: typeof invoices.$inferSelect & {
      customerName: string;
      customerEmail: string | null;
      currencyCode: string | null;
      paymentTermName?: string | null;
    },
  ) {
    return {
      id: row.id,
      branchId: row.branchId,
      number: row.number,
      salesOrderId: row.salesOrderId ?? undefined,
      customerId: row.customerId,
      customerName: row.customerName,
      customerEmail: row.customerEmail ?? "",
      customerReference: row.customerReference ?? undefined,
      invoiceDate: row.invoiceDate,
      dueDate: row.dueDate ?? "",
      paymentTerm: row.paymentTermName ?? "—",
      status: this.mapInvoiceStatus(row.state, row.paymentState),
      currencyId: row.currencyId,
      currencyCode: row.currencyCode,
      exchangeRate: row.exchangeRate ? Number(row.exchangeRate) : null,
      exchangeRateLockedAt: row.exchangeRateLockedAt?.toISOString() ?? null,
      amountUntaxed: Number(row.amountUntaxed),
      amountTax: Number(row.amountTax),
      amountTotal: Number(row.amountTotal),
      amountTotalBase: Number(row.amountTotalBase),
      amountPaid: Number(row.amountPaid),
      cancellationReason: row.cancellationReason ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      cancellationReturnToStock: row.cancellationReturnToStock,
      notes: row.notes ?? "",
      createdAt: row.createdAt.toISOString(),
      lines: [],
    };
  }

  private mapInvoiceDetail(
    row: typeof invoices.$inferSelect & {
      customerName: string;
      customerEmail: string | null;
      currencyCode: string | null;
      paymentTermName?: string | null;
      lines: Array<
        typeof invoiceLines.$inferSelect & { serialNumber?: string | null }
      >;
    },
  ) {
    return {
      ...this.mapInvoiceSummary(row),
      state: row.state,
      paymentState: row.paymentState,
      lines: row.lines.map((line) => ({
        id: line.id,
        description: line.description,
        serialNumber: line.serialNumber ?? undefined,
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice),
        discountPercent: Number(line.discountPercent),
        taxRatePercent: Number(line.taxRatePercent),
        lineTotal: Number(line.priceTotal),
        costAmountBase: Number(line.costAmountBase ?? 0),
      })),
    };
  }

  private async logActivity(
    organizationId: string,
    entityId: string,
    userId: string | undefined,
    activityType: "created" | "updated" | "paid",
    message: string,
  ) {
    await this.db.insert(salesActivities).values({
      organizationId,
      entityType: "invoice",
      entityId,
      userId: userId ?? null,
      activityType,
      message,
    });
  }

  private async logSalesOrderActivity(
    organizationId: string,
    entityId: string,
    userId: string | undefined,
    activityType: "invoiced",
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
