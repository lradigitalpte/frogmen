import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import {
  currencies,
  customers,
  invoiceLines,
  invoices,
  purchaseOrderLines,
  purchaseOrders,
  vendors,
  salesOrderLines,
  salesOrders,
  type Database,
} from "@frog1/db";
import {
  renderQuotationDocumentHtml,
  type QuotationDocumentData,
} from "@frog1/shared";
import { DATABASE } from "../database/database.constants";
import { SettingsService } from "../settings/settings.service";
import { DocumentBankAccountsService } from "./document-bank-accounts.service";
import { PdfService } from "./pdf.service";

@Injectable()
export class DocumentRendererService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly settingsService: SettingsService,
    private readonly documentBankAccountsService: DocumentBankAccountsService,
    private readonly pdfService: PdfService,
  ) {}

  private async buildBranding(
    organizationId: string,
    branchId?: string | null,
  ) {
    const branding = await this.settingsService.getOrganizationBranding(
      organizationId,
    );
    const documentBankAccounts =
      await this.documentBankAccountsService.listForDocuments(organizationId, {
        branchId,
      });

    return {
      ...branding,
      documentBankAccounts,
    };
  }

  async buildQuotationDocumentData(
    organizationId: string,
    quotationId: string,
  ): Promise<QuotationDocumentData> {
    const [header] = await this.db
      .select({
        order: salesOrders,
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
        decimalPlaces: currencies.decimalPlaces,
      })
      .from(salesOrders)
      .innerJoin(customers, eq(customers.id, salesOrders.customerId))
      .innerJoin(currencies, eq(currencies.id, salesOrders.currencyId))
      .where(
        and(
          eq(salesOrders.id, quotationId),
          eq(salesOrders.organizationId, organizationId),
          isNull(salesOrders.deletedAt),
        ),
      )
      .limit(1);

    if (!header) {
      throw new NotFoundException("Quotation not found");
    }

    const lines = await this.db
      .select()
      .from(salesOrderLines)
      .where(eq(salesOrderLines.salesOrderId, quotationId));

    return {
      number: header.order.number,
      quoteDate: header.order.quoteDate,
      validityDate: header.order.validityDate,
      paymentReference: header.order.paymentReference,
      customerReference: header.order.customerReference,
      customerName: header.customerName,
      customerEmail: header.customerEmail,
      customerTaxId: header.customerTaxId,
      customerAddress: [
        header.customerStreet1,
        header.customerStreet2,
        [header.customerCity, header.customerState, header.customerZip].filter(Boolean).join(", "),
        header.customerCountry,
      ].filter((value): value is string => Boolean(value)),
      notes: header.order.notes,
      amountUntaxed: header.order.amountUntaxed,
      amountTax: header.order.amountTax,
      amountTotal: header.order.amountTotal,
      currencyCode: header.currencyCode,
      currencySymbol: header.currencySymbol,
      decimalPlaces: header.decimalPlaces,
      lines: lines.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountPercent: line.discountPercent,
        taxRatePercent: line.taxRatePercent,
        priceSubtotal: line.priceSubtotal,
      })),
    };
  }

  async renderQuotationHtml(organizationId: string, quotationId: string) {
    const [header] = await this.db
      .select({ branchId: salesOrders.branchId })
      .from(salesOrders)
      .where(
        and(
          eq(salesOrders.id, quotationId),
          eq(salesOrders.organizationId, organizationId),
          isNull(salesOrders.deletedAt),
        ),
      )
      .limit(1);

    const branding = await this.buildBranding(
      organizationId,
      header?.branchId,
    );
    const quotation = await this.buildQuotationDocumentData(
      organizationId,
      quotationId,
    );

    return renderQuotationDocumentHtml(
      {
        ...branding,
        documentTemplates: {
          ...branding.documentTemplates,
          documentStyle: "official_blue",
        },
      },
      quotation,
    );
  }

  async renderQuotationPdf(organizationId: string, quotationId: string) {
    const html = await this.renderQuotationHtml(organizationId, quotationId);
    return this.pdfService.renderHtmlToPdf(html);
  }

  async buildInvoiceDocumentData(
    organizationId: string,
    invoiceId: string,
  ): Promise<QuotationDocumentData> {
    const [header] = await this.db
      .select({
        invoice: invoices,
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
        decimalPlaces: currencies.decimalPlaces,
      })
      .from(invoices)
      .innerJoin(customers, eq(customers.id, invoices.customerId))
      .innerJoin(currencies, eq(currencies.id, invoices.currencyId))
      .where(and(eq(invoices.id, invoiceId), eq(invoices.organizationId, organizationId), isNull(invoices.deletedAt)))
      .limit(1);
    if (!header) throw new NotFoundException("Invoice not found");
    const lines = await this.db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId));
    return {
      documentType: "invoice",
      number: header.invoice.number,
      quoteDate: header.invoice.invoiceDate,
      validityDate: header.invoice.dueDate,
      paymentReference: header.invoice.internalReference,
      customerReference: header.invoice.customerReference,
      customerName: header.customerName,
      customerEmail: header.customerEmail,
      customerTaxId: header.customerTaxId,
      customerAddress: [
        header.customerStreet1,
        header.customerStreet2,
        [header.customerCity, header.customerState, header.customerZip].filter(Boolean).join(", "),
        header.customerCountry,
      ].filter((value): value is string => Boolean(value)),
      notes: header.invoice.notes,
      amountUntaxed: header.invoice.amountUntaxed,
      amountTax: header.invoice.amountTax,
      amountTotal: header.invoice.amountTotal,
      currencyCode: header.currencyCode,
      currencySymbol: header.currencySymbol,
      decimalPlaces: header.decimalPlaces,
      lines: lines.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountPercent: line.discountPercent,
        taxRatePercent: line.taxRatePercent,
        priceSubtotal: line.priceSubtotal,
      })),
    };
  }

  async renderInvoiceHtml(organizationId: string, invoiceId: string) {
    const [header] = await this.db
      .select({ branchId: invoices.branchId })
      .from(invoices)
      .where(
        and(
          eq(invoices.id, invoiceId),
          eq(invoices.organizationId, organizationId),
          isNull(invoices.deletedAt),
        ),
      )
      .limit(1);

    const branding = await this.buildBranding(organizationId, header?.branchId);
    const invoice = await this.buildInvoiceDocumentData(organizationId, invoiceId);
    return renderQuotationDocumentHtml(
      { ...branding, documentTemplates: { ...branding.documentTemplates, documentStyle: "official_blue" } },
      invoice,
    );
  }

  async renderInvoicePdf(organizationId: string, invoiceId: string) {
    return this.pdfService.renderHtmlToPdf(
      await this.renderInvoiceHtml(organizationId, invoiceId),
    );
  }

  async renderCreditNoteHtml(
    organizationId: string,
    creditNote: { invoiceId: string; number: string; reason: string },
  ) {
    const [header] = await this.db
      .select({ branchId: invoices.branchId })
      .from(invoices)
      .where(
        and(
          eq(invoices.id, creditNote.invoiceId),
          eq(invoices.organizationId, organizationId),
          isNull(invoices.deletedAt),
        ),
      )
      .limit(1);

    const branding = await this.buildBranding(organizationId, header?.branchId);
    const invoice = await this.buildInvoiceDocumentData(organizationId, creditNote.invoiceId);
    return renderQuotationDocumentHtml(
      { ...branding, documentTemplates: { ...branding.documentTemplates, documentStyle: "official_blue" } },
      { ...invoice, documentType: "credit_note", number: creditNote.number, notes: creditNote.reason },
    );
  }

  async renderCreditNotePdf(
    organizationId: string,
    creditNote: { invoiceId: string; number: string; reason: string },
  ) {
    return this.pdfService.renderHtmlToPdf(
      await this.renderCreditNoteHtml(organizationId, creditNote),
    );
  }

  async buildPurchaseOrderDocumentData(
    organizationId: string,
    orderId: string,
  ): Promise<QuotationDocumentData> {
    const [header] = await this.db
      .select({
        order: purchaseOrders,
        vendorName: vendors.name,
        vendorEmail: vendors.email,
        vendorTaxId: vendors.taxId,
        street1: vendors.street1,
        street2: vendors.street2,
        city: vendors.city,
        state: vendors.stateCode,
        zip: vendors.zip,
        country: vendors.countryCode,
        currencyCode: currencies.code,
        currencySymbol: currencies.symbol,
        decimalPlaces: currencies.decimalPlaces,
      })
      .from(purchaseOrders)
      .innerJoin(vendors, eq(vendors.id, purchaseOrders.vendorId))
      .innerJoin(currencies, eq(currencies.id, purchaseOrders.currencyId))
      .where(and(eq(purchaseOrders.id, orderId), eq(purchaseOrders.organizationId, organizationId), isNull(purchaseOrders.deletedAt)))
      .limit(1);
    if (!header) throw new NotFoundException("Purchase order not found");
    const lines = await this.db.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.purchaseOrderId, orderId));
    return {
      documentType: "purchase_order",
      number: header.order.number,
      quoteDate: header.order.orderDate,
      validityDate: header.order.expectedDate,
      paymentReference: header.order.internalReference,
      customerReference: header.order.vendorReference,
      customerName: header.vendorName,
      customerEmail: header.vendorEmail,
      customerTaxId: header.vendorTaxId,
      customerAddress: [
        header.street1,
        header.street2,
        [header.city, header.state, header.zip].filter(Boolean).join(", "),
        header.country,
      ].filter((value): value is string => Boolean(value)),
      notes: header.order.notes,
      amountUntaxed: header.order.amountUntaxed,
      amountTax: header.order.amountTax,
      amountTotal: header.order.amountTotal,
      currencyCode: header.currencyCode,
      currencySymbol: header.currencySymbol,
      decimalPlaces: header.decimalPlaces,
      lines: lines.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountPercent: line.discountPercent,
        taxRatePercent: line.taxRatePercent,
        priceSubtotal: line.priceSubtotal,
      })),
    };
  }

  async renderPurchaseOrderHtml(organizationId: string, orderId: string) {
    const branding = await this.buildBranding(organizationId);
    return renderQuotationDocumentHtml(
      { ...branding, documentTemplates: { ...branding.documentTemplates, documentStyle: "official_blue" } },
      await this.buildPurchaseOrderDocumentData(organizationId, orderId),
    );
  }

  async renderPurchaseOrderPdf(organizationId: string, orderId: string) {
    return this.pdfService.renderHtmlToPdf(
      await this.renderPurchaseOrderHtml(organizationId, orderId),
    );
  }
}
