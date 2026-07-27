import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import {
  RequireActiveOrg,
  Session,
  type UserSession,
} from "@thallesp/nestjs-better-auth";
import { DocumentRendererService } from "../documents/document-renderer.service";
import {
  QuotationsService,
  type AddQuotationLineInput,
  type CreateQuotationInput,
  type CurrencyRow,
  type ListQuotationsQuery,
  type UpdateQuotationInput,
  type UpdateQuotationLineInput,
} from "./quotations.service";

@Controller("v1/quotations")
@RequireActiveOrg()
export class QuotationsController {
  constructor(
    private readonly quotationsService: QuotationsService,
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
  list(@Session() session: UserSession, @Query() query: ListQuotationsQuery) {
    return this.quotationsService.list(this.orgId(session), {
      ...query,
      page: query.page ? Number(query.page) : undefined,
      perPage: query.perPage ? Number(query.perPage) : undefined,
    });
  }

  @Get("options/currencies")
  listCurrencies(): Promise<CurrencyRow[]> {
    return this.quotationsService.listCurrencies();
  }

  @Get("currency-diagnostics")
  getCurrencyDiagnostics(@Session() session: UserSession) {
    return this.quotationsService.getCurrencyDiagnostics(this.orgId(session));
  }

  @Get(":id/document.html")
  @Header("Content-Type", "text/html; charset=utf-8")
  async getDocumentHtml(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    const html = await this.documentRenderer.renderQuotationHtml(
      this.orgId(session),
      id,
    );
    res.send(html);
  }

  @Get(":id/document.pdf")
  async getDocumentPdf(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    const pdf = await this.documentRenderer.renderQuotationPdf(
      this.orgId(session),
      id,
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="quotation-${id}.pdf"`,
    );
    res.send(pdf);
  }

  @Get(":id")
  get(@Session() session: UserSession, @Param("id") id: string) {
    return this.quotationsService.getById(this.orgId(session), id);
  }

  @Post()
  create(@Session() session: UserSession, @Body() body: CreateQuotationInput) {
    return this.quotationsService.create(
      this.orgId(session),
      session.user.id,
      body,
    );
  }

  @Patch(":id")
  update(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Body() body: UpdateQuotationInput,
  ) {
    return this.quotationsService.update(
      this.orgId(session),
      id,
      session.user.id,
      body,
    );
  }

  @Post(":id/lines")
  addLine(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Body() body: AddQuotationLineInput,
  ) {
    return this.quotationsService.addLine(this.orgId(session), id, body);
  }

  @Patch(":id/lines/:lineId")
  updateLine(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Param("lineId") lineId: string,
    @Body() body: UpdateQuotationLineInput,
  ) {
    return this.quotationsService.updateLine(
      this.orgId(session),
      id,
      lineId,
      body,
    );
  }

  @Delete(":id")
  delete(@Session() session: UserSession, @Param("id") id: string) {
    return this.quotationsService.delete(this.orgId(session), id);
  }

  @Delete(":id/lines/:lineId")
  deleteLine(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Param("lineId") lineId: string,
  ) {
    return this.quotationsService.deleteLine(
      this.orgId(session),
      id,
      lineId,
    );
  }

  @Post(":id/confirm")
  confirm(@Session() session: UserSession, @Param("id") id: string) {
    return this.quotationsService.confirm(
      this.orgId(session),
      id,
      session.user.id,
    );
  }

  @Post(":id/mark-sent")
  markSent(@Session() session: UserSession, @Param("id") id: string) {
    return this.quotationsService.markSent(
      this.orgId(session),
      id,
      session.user.id,
    );
  }

  @Post(":id/reconvert")
  reconvert(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Body() body: { fromCurrencyId: string },
  ) {
    return this.quotationsService.reconvertQuotation(
      this.orgId(session),
      id,
      body.fromCurrencyId,
      session.user.id,
    );
  }

  @Post(":id/cancel")
  cancel(@Session() session: UserSession, @Param("id") id: string) {
    return this.quotationsService.cancel(
      this.orgId(session),
      id,
      session.user.id,
    );
  }

  @Post(":id/send-email")
  sendEmail(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Body()
    body: { recipientEmail: string; subject: string; body: string },
  ) {
    return this.quotationsService.sendEmail(
      this.orgId(session),
      id,
      session.user.id,
      body,
    );
  }

  @Post(":id/notes")
  addNote(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Body() body: { message: string },
  ) {
    return this.quotationsService.addNote(
      this.orgId(session),
      id,
      session.user.id,
      body.message,
    );
  }
}
