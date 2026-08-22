import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, isNull } from "drizzle-orm";
import {
  currencies,
  customers,
  deliveryNoteLines,
  deliveryNotes,
  invoiceLines,
  invoices,
  products,
  productUnits,
  purchaseOrderLines,
  purchaseOrders,
  vendors,
  salesOrderLines,
  salesOrders,
  type Database,
} from "@frog1/db";
import {
  formatPostalAddressLines,
  renderQuotationDocumentHtml,
  renderDeliveryNoteDocumentHtml,
  resolveDeliveryFee,
  roundMoney,
  type DeliveryNoteDocumentData,
  type QuotationDocumentData,
} from "@frog1/shared";
import { DATABASE } from "../database/database.constants";
import { SettingsService } from "../settings/settings.service";
import { DocumentBankAccountsService } from "./document-bank-accounts.service";
import { PdfService } from "./pdf.service";
import {
  resolveDeliveryNoteSerialEntries,
} from "../delivery-notes/delivery-note-serials";

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
      .select({
        line: salesOrderLines,
        productDescription: products.description,
        serialNumber: productUnits.serialNumber,
      })
      .from(salesOrderLines)
      .leftJoin(products, eq(products.id, salesOrderLines.productId))
      .leftJoin(productUnits, eq(productUnits.id, salesOrderLines.productUnitId))
      .where(eq(salesOrderLines.salesOrderId, quotationId));

    const lineNetSubtotal = lines.reduce(
      (sum, row) => sum + Number(row.line.priceSubtotal),
      0,
    );
    const deliveryFee = resolveDeliveryFee(
      lineNetSubtotal,
      header.order.deliveryFeeAmount,
      header.order.deliveryFeePercent,
    );

    return {
      number: header.order.number,
      quoteDate: header.order.quoteDate,
      validityDate: header.order.validityDate,
      paymentReference: header.order.paymentReference,
      customerReference: header.order.customerReference,
      customerName: header.customerName,
      customerEmail: header.customerEmail,
      customerTaxId: header.customerTaxId,
      customerAddress: formatPostalAddressLines({
        street1: header.customerStreet1,
        street2: header.customerStreet2,
        city: header.customerCity,
        stateCode: header.customerState,
        zip: header.customerZip,
        countryCode: header.customerCountry,
      }),
      notes: header.order.notes,
      lineNetSubtotal: String(lineNetSubtotal),
      deliveryFee: deliveryFee > 0 ? String(deliveryFee) : null,
      deliveryFeePercent: header.order.deliveryFeePercent,
      amountUntaxed: header.order.amountUntaxed,
      amountTax: header.order.amountTax,
      amountTotal: header.order.amountTotal,
      currencyCode: header.currencyCode,
      currencySymbol: header.currencySymbol,
      decimalPlaces: header.decimalPlaces,
      lines: lines.map((row) => ({
        description: row.line.description,
        details: row.productDescription,
        serialNumber: row.serialNumber,
        quantity: row.line.quantity,
        unitPrice: row.line.unitPrice,
        discountPercent: row.line.discountPercent,
        taxRatePercent: row.line.taxRatePercent,
        priceSubtotal: row.line.priceSubtotal,
      })),
      accessToken: header.order.accessToken,
      signedBy: header.order.signedBy,
      signedOn: header.order.signedOn ? header.order.signedOn.toISOString() : null,
      signatureImage: header.order.signatureImage,
      signedIp: header.order.signedIp,
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
    const lines = await this.db
      .select({
        line: invoiceLines,
        productDescription: products.description,
        serialNumber: productUnits.serialNumber,
      })
      .from(invoiceLines)
      .leftJoin(products, eq(products.id, invoiceLines.productId))
      .leftJoin(productUnits, eq(productUnits.id, invoiceLines.productUnitId))
      .where(eq(invoiceLines.invoiceId, invoiceId));

    const lineNetSubtotal = lines.reduce(
      (sum, row) => sum + Number(row.line.priceSubtotal),
      0,
    );
    const deliveryFee = resolveDeliveryFee(
      lineNetSubtotal,
      header.invoice.deliveryFeeAmount,
      header.invoice.deliveryFeePercent,
    );

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
      customerAddress: formatPostalAddressLines({
        street1: header.customerStreet1,
        street2: header.customerStreet2,
        city: header.customerCity,
        stateCode: header.customerState,
        zip: header.customerZip,
        countryCode: header.customerCountry,
      }),
      notes: header.invoice.notes,
      lineNetSubtotal: String(lineNetSubtotal),
      deliveryFee: deliveryFee > 0 ? String(deliveryFee) : null,
      deliveryFeePercent: header.invoice.deliveryFeePercent,
      amountUntaxed: header.invoice.amountUntaxed,
      amountTax: header.invoice.amountTax,
      amountTotal: header.invoice.amountTotal,
      currencyCode: header.currencyCode,
      currencySymbol: header.currencySymbol,
      decimalPlaces: header.decimalPlaces,
      lines: lines.map((row) => ({
        description: row.line.description,
        details: row.productDescription,
        serialNumber: row.serialNumber,
        quantity: row.line.quantity,
        unitPrice: row.line.unitPrice,
        discountPercent: row.line.discountPercent,
        taxRatePercent: row.line.taxRatePercent,
        priceSubtotal: row.line.priceSubtotal,
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
    const lines = await this.db
      .select({
        line: purchaseOrderLines,
        productDescription: products.description,
      })
      .from(purchaseOrderLines)
      .leftJoin(products, eq(products.id, purchaseOrderLines.productId))
      .where(eq(purchaseOrderLines.purchaseOrderId, orderId));
    const lineNetSubtotal = lines.reduce(
      (sum, row) => sum + Number(row.line.priceSubtotal),
      0,
    );
    const freight = resolveDeliveryFee(
      lineNetSubtotal,
      header.order.freightAmount,
      header.order.freightPercent,
    );
    const amountTax = Number(header.order.amountTax);
    // Vendor-facing PO total: product lines + freight only. Named charges are
    // internal landed-cost inputs and are not shown on the PDF to the vendor.
    const vendorAmountUntaxed = roundMoney(lineNetSubtotal + freight);
    const vendorAmountTotal = roundMoney(vendorAmountUntaxed + amountTax);
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
      customerAddress: formatPostalAddressLines({
        street1: header.street1,
        street2: header.street2,
        city: header.city,
        stateCode: header.state,
        zip: header.zip,
        countryCode: header.country,
      }),
      notes: header.order.notes,
      lineNetSubtotal: String(lineNetSubtotal),
      deliveryFee: freight > 0 ? String(freight) : null,
      deliveryFeePercent: header.order.freightPercent,
      otherCharges: null,
      additionalChargeLines: undefined,
      amountUntaxed: String(vendorAmountUntaxed),
      amountTax: header.order.amountTax,
      amountTotal: String(vendorAmountTotal),
      currencyCode: header.currencyCode,
      currencySymbol: header.currencySymbol,
      decimalPlaces: header.decimalPlaces,
      lines: lines.map((row) => ({
        description: row.line.description,
        details: row.productDescription,
        quantity: row.line.quantity,
        unitPrice: row.line.unitPrice,
        discountPercent: row.line.discountPercent,
        taxRatePercent: row.line.taxRatePercent,
        priceSubtotal: row.line.priceSubtotal,
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

  async buildDeliveryNoteDocumentData(
    organizationId: string,
    deliveryNoteId: string,
  ): Promise<DeliveryNoteDocumentData> {
    const [header] = await this.db
      .select({
        note: deliveryNotes,
        customerName: customers.name,
        customerEmail: customers.email,
        invoiceNumber: invoices.number,
      })
      .from(deliveryNotes)
      .innerJoin(customers, eq(customers.id, deliveryNotes.customerId))
      .innerJoin(invoices, eq(invoices.id, deliveryNotes.invoiceId))
      .where(
        and(
          eq(deliveryNotes.id, deliveryNoteId),
          eq(deliveryNotes.organizationId, organizationId),
          isNull(deliveryNotes.deletedAt),
        ),
      )
      .limit(1);

    if (!header) {
      throw new NotFoundException("Delivery note not found");
    }

    const lines = await this.db
      .select({
        line: deliveryNoteLines,
        productDescription: products.description,
      })
      .from(deliveryNoteLines)
      .leftJoin(products, eq(products.id, deliveryNoteLines.productId))
      .where(eq(deliveryNoteLines.deliveryNoteId, deliveryNoteId))
      .orderBy(asc(deliveryNoteLines.lineNumber));

    const mappedLines = await Promise.all(
      lines.map(async (row) => {
        const serialEntries = row.line.productUnitId
          ? await resolveDeliveryNoteSerialEntries(this.db, organizationId, {
              productUnitId: row.line.productUnitId,
              productName: row.line.description,
              serialNumber: row.line.serialNumber,
            })
          : [];

        return {
          description: row.line.description,
          details: row.productDescription,
          serialNumber: row.line.serialNumber,
          serialEntries,
          quantity: row.line.quantity,
        };
      }),
    );

    return {
      number: header.note.number,
      deliveryDate: header.note.deliveryDate,
      invoiceNumber: header.invoiceNumber,
      customerName: header.customerName,
      customerEmail: header.customerEmail,
      deliveryAddress: formatPostalAddressLines({
        street1: header.note.deliveryStreet1,
        street2: header.note.deliveryStreet2,
        city: header.note.deliveryCity,
        stateCode: header.note.deliveryStateCode,
        zip: header.note.deliveryZip,
        countryCode: header.note.deliveryCountryCode,
      }),
      receivedBy: header.note.receivedBy,
      signedOn: header.note.signedOn?.toISOString() ?? null,
      signatureImage: header.note.signatureImage,
      lines: mappedLines,
    };
  }

  async buildDeliveryNotePreviewDocumentData(
    organizationId: string,
    invoiceId: string,
  ): Promise<DeliveryNoteDocumentData> {
    const [header] = await this.db
      .select({
        invoice: invoices,
        customerName: customers.name,
        customerEmail: customers.email,
        customerStreet1: customers.street1,
        customerStreet2: customers.street2,
        customerCity: customers.city,
        customerState: customers.stateCode,
        customerZip: customers.zip,
        customerCountry: customers.countryCode,
      })
      .from(invoices)
      .innerJoin(customers, eq(customers.id, invoices.customerId))
      .where(
        and(
          eq(invoices.id, invoiceId),
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
        productDescription: products.description,
      })
      .from(invoiceLines)
      .leftJoin(productUnits, eq(productUnits.id, invoiceLines.productUnitId))
      .leftJoin(products, eq(products.id, invoiceLines.productId))
      .where(eq(invoiceLines.invoiceId, invoiceId))
      .orderBy(asc(invoiceLines.lineNumber));

    const mappedLines = await Promise.all(
      lines.map(async (row) => {
        const serialEntries = await resolveDeliveryNoteSerialEntries(
          this.db,
          organizationId,
          {
            productUnitId: row.line.productUnitId,
            productName: row.line.description,
            serialNumber: row.serialNumber ?? null,
          },
        );

        return {
          description: row.line.description,
          details: row.productDescription,
          serialNumber: row.serialNumber,
          serialEntries,
          quantity: row.line.quantity,
        };
      }),
    );

    return {
      number: "DRAFT",
      deliveryDate: new Date().toISOString().slice(0, 10),
      invoiceNumber: header.invoice.number,
      customerName: header.customerName,
      customerEmail: header.customerEmail,
      deliveryAddress: formatPostalAddressLines({
        street1: header.customerStreet1,
        street2: header.customerStreet2,
        city: header.customerCity,
        stateCode: header.customerState,
        zip: header.customerZip,
        countryCode: header.customerCountry,
      }),
      receivedBy: null,
      signedOn: null,
      signatureImage: null,
      lines: mappedLines,
    };
  }

  async renderDeliveryNotePreviewHtml(organizationId: string, invoiceId: string) {
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
    const note = await this.buildDeliveryNotePreviewDocumentData(
      organizationId,
      invoiceId,
    );
    return renderDeliveryNoteDocumentHtml(branding, note);
  }

  async renderDeliveryNotePreviewPdf(organizationId: string, invoiceId: string) {
    return this.pdfService.renderHtmlToPdf(
      await this.renderDeliveryNotePreviewHtml(organizationId, invoiceId),
    );
  }

  async renderDeliveryNoteHtml(organizationId: string, deliveryNoteId: string) {
    const [header] = await this.db
      .select({ branchId: deliveryNotes.branchId })
      .from(deliveryNotes)
      .where(
        and(
          eq(deliveryNotes.id, deliveryNoteId),
          eq(deliveryNotes.organizationId, organizationId),
          isNull(deliveryNotes.deletedAt),
        ),
      )
      .limit(1);

    const branding = await this.buildBranding(organizationId, header?.branchId);
    const note = await this.buildDeliveryNoteDocumentData(
      organizationId,
      deliveryNoteId,
    );
    return renderDeliveryNoteDocumentHtml(branding, note);
  }

  async renderDeliveryNotePdf(organizationId: string, deliveryNoteId: string) {
    return this.pdfService.renderHtmlToPdf(
      await this.renderDeliveryNoteHtml(organizationId, deliveryNoteId),
    );
  }
}
