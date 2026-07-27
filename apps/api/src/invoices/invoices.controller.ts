import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import {
  RequireActiveOrg,
  Session,
  type UserSession,
} from "@thallesp/nestjs-better-auth";
import { convertAmount } from "@frog1/shared";
import {
  InvoicesService,
  type CreateInvoiceInput,
  type ListInvoicesQuery,
  type RegisterPaymentInput,
} from "./invoices.service";
import { AccountingService } from "../accounting/accounting.service";
import type { Response } from "express";
import { DocumentRendererService } from "../documents/document-renderer.service";

@Controller("v1/invoices")
@RequireActiveOrg()
export class InvoicesController {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly accountingService: AccountingService,
    private readonly documentRenderer: DocumentRendererService,
  ) {}

  private orgId(session: UserSession) {
    const organizationId = session.session.activeOrganizationId;

    if (!organizationId) {
      throw new Error("Active organization is required");
    }

    return organizationId;
  }

  @Get()
  async list(
    @Session() session: UserSession,
    @Query() query: ListInvoicesQuery,
  ) {
    const result = await this.invoicesService.list(this.orgId(session), {
      ...query,
      page: query.page ? Number(query.page) : undefined,
      perPage: query.perPage ? Number(query.perPage) : undefined,
    });

    return result.data;
  }

  @Get(":id/document.html")
  @Header("Content-Type", "text/html; charset=utf-8")
  async getDocumentHtml(@Session() session: UserSession, @Param("id") id: string, @Res() res: Response) {
    res.send(await this.documentRenderer.renderInvoiceHtml(this.orgId(session), id));
  }

  @Get(":id/document.pdf")
  async getDocumentPdf(@Session() session: UserSession, @Param("id") id: string, @Res() res: Response) {
    const pdf = await this.documentRenderer.renderInvoicePdf(this.orgId(session), id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="invoice-${id}.pdf"`);
    res.send(pdf);
  }

  @Get(":id")
  get(@Session() session: UserSession, @Param("id") id: string) {
    return this.invoicesService.getById(this.orgId(session), id);
  }

  @Post()
  create(
    @Session() session: UserSession,
    @Body() body: CreateInvoiceInput,
  ) {
    return this.invoicesService.create(
      this.orgId(session),
      session.user.id,
      body,
    );
  }

  @Get(":id/journal")
  getJournal(@Session() session: UserSession, @Param("id") id: string) {
    return this.accountingService.getInvoiceJournal(this.orgId(session), id);
  }

  @Post(":id/confirm")
  confirm(@Session() session: UserSession, @Param("id") id: string) {
    return this.invoicesService.confirm(
      this.orgId(session),
      id,
      session.user.id,
    );
  }

  @Post(":id/reset")
  resetToDraft(@Session() session: UserSession, @Param("id") id: string) {
    return this.invoicesService.resetToDraft(
      this.orgId(session),
      id,
      session.user.id,
    );
  }

  @Post(":id/cancel")
  cancel(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Body() body: { reason: string; returnToStock?: boolean },
  ) {
    return this.invoicesService.cancelInvoice(this.orgId(session), id, session.user.id, body);
  }

  @Delete(":id")
  archive(@Session() session: UserSession, @Param("id") id: string) {
    return this.invoicesService.archiveCancelledInvoice(this.orgId(session), id);
  }

  @Post(":id/cancellation-email")
  sendCancellationEmail(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Body() body: { recipientEmail: string; subject: string; body: string },
  ) {
    return this.invoicesService.sendCancellationEmail(this.orgId(session), id, body);
  }

  @Post(":id/pay")
  registerPayment(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Body()
    body: RegisterPaymentInput & { journal?: string },
  ) {
    return this.invoicesService.registerPayment(
      this.orgId(session),
      id,
      session.user.id,
      {
        amount: body.amount,
        paymentDate: body.paymentDate,
        reference: body.journal ?? body.reference,
        method: body.method,
      },
    );
  }

  @Post(":id/credit-notes")
  createCreditNote(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Body() body: { reason: string; creditDate?: string },
  ) {
    return this.invoicesService.createCreditNote(
      this.orgId(session),
      id,
      session.user.id,
      body,
    );
  }
}

@Controller("v1/payments")
@RequireActiveOrg()
export class PaymentsController {
  constructor(private readonly invoicesService: InvoicesService) {}

  private orgId(session: UserSession) {
    const organizationId = session.session.activeOrganizationId;

    if (!organizationId) {
      throw new Error("Active organization is required");
    }

    return organizationId;
  }

  @Get()
  async list(@Session() session: UserSession) {
    const rows = await this.invoicesService.listPayments(this.orgId(session));

    return rows.map((row) => {
      const paymentAmount = Number(row.payment.amount);
      const exchangeRate = row.payment.exchangeRate
        ? Number(row.payment.exchangeRate)
        : 1;

      return {
        id: row.payment.id,
        date: row.payment.paymentDate,
        name: row.payment.reference ?? row.invoiceNumber,
        journal: row.payment.reference ?? "Customer Payments",
        paymentMethod: row.payment.method ?? "Manual",
        partner: row.customerName,
        amountCurrency: paymentAmount,
        amount: convertAmount(paymentAmount, exchangeRate),
        currencyId: row.payment.currencyId,
        currencyCode: row.currencyCode?.trim() ?? null,
        state: "paid" as const,
      };
    });
  }
}

@Controller("v1/credit-notes")
@RequireActiveOrg()
export class CreditNotesController {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly documentRenderer: DocumentRendererService,
  ) {}

  private orgId(session: UserSession) {
    const organizationId = session.session.activeOrganizationId;

    if (!organizationId) {
      throw new Error("Active organization is required");
    }

    return organizationId;
  }

  @Get()
  list(@Session() session: UserSession) {
    return this.invoicesService.listCreditNotes(this.orgId(session));
  }

  @Post(":id/refunds")
  refund(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Body() body: { amount: number; currencyId: string; refundDate: string; method: string; reference?: string },
  ) {
    return this.invoicesService.recordCreditNoteRefund(this.orgId(session), id, body);
  }

  @Get(":id/document.html")
  @Header("Content-Type", "text/html; charset=utf-8")
  async documentHtml(@Session() session: UserSession, @Param("id") id: string, @Res() res: Response) {
    const note = await this.invoicesService.getCreditNote(this.orgId(session), id);
    res.send(await this.documentRenderer.renderCreditNoteHtml(this.orgId(session), note));
  }

  @Get(":id/document.pdf")
  async documentPdf(@Session() session: UserSession, @Param("id") id: string, @Res() res: Response) {
    const note = await this.invoicesService.getCreditNote(this.orgId(session), id);
    const pdf = await this.documentRenderer.renderCreditNotePdf(this.orgId(session), note);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${note.number}.pdf"`);
    res.send(pdf);
  }
}
