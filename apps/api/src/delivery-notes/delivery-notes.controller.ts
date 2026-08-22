import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Res,
} from "@nestjs/common";
import {
  RequireActiveOrg,
  Session,
  type UserSession,
} from "@thallesp/nestjs-better-auth";
import type { Response } from "express";
import { DocumentRendererService } from "../documents/document-renderer.service";
import {
  DeliveryNotesService,
  type ApproveDeliveryNoteInput,
} from "./delivery-notes.service";

@Controller("v1/delivery-notes")
@RequireActiveOrg()
export class DeliveryNotesController {
  constructor(
    private readonly deliveryNotesService: DeliveryNotesService,
    private readonly documentRenderer: DocumentRendererService,
  ) {}

  private orgId(session: UserSession) {
    const organizationId = session.session.activeOrganizationId;
    if (!organizationId) {
      throw new Error("Active organization is required");
    }
    return organizationId;
  }

  @Get(":id")
  get(@Session() session: UserSession, @Param("id") id: string) {
    return this.deliveryNotesService.getById(this.orgId(session), id);
  }

  @Get(":id/document.html")
  @Header("Content-Type", "text/html; charset=utf-8")
  async getDocumentHtml(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    res.send(
      await this.documentRenderer.renderDeliveryNoteHtml(this.orgId(session), id),
    );
  }

  @Get(":id/document.pdf")
  async getDocumentPdf(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    const pdf = await this.documentRenderer.renderDeliveryNotePdf(
      this.orgId(session),
      id,
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="delivery-note-${id}.pdf"`,
    );
    res.send(pdf);
  }
}

@Controller("v1/invoices/:invoiceId/delivery-notes")
@RequireActiveOrg()
export class InvoiceDeliveryNotesController {
  constructor(
    private readonly deliveryNotesService: DeliveryNotesService,
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
  list(@Session() session: UserSession, @Param("invoiceId") invoiceId: string) {
    return this.deliveryNotesService.listByInvoice(
      this.orgId(session),
      invoiceId,
    );
  }

  @Post("preview")
  preview(
    @Session() session: UserSession,
    @Param("invoiceId") invoiceId: string,
  ) {
    return this.deliveryNotesService.preview(this.orgId(session), invoiceId);
  }

  @Get("preview/document.html")
  @Header("Content-Type", "text/html; charset=utf-8")
  async previewDocumentHtml(
    @Session() session: UserSession,
    @Param("invoiceId") invoiceId: string,
    @Res() res: Response,
  ) {
    res.send(
      await this.documentRenderer.renderDeliveryNotePreviewHtml(
        this.orgId(session),
        invoiceId,
      ),
    );
  }

  @Get("preview/document.pdf")
  async previewDocumentPdf(
    @Session() session: UserSession,
    @Param("invoiceId") invoiceId: string,
    @Res() res: Response,
  ) {
    const pdf = await this.documentRenderer.renderDeliveryNotePreviewPdf(
      this.orgId(session),
      invoiceId,
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="delivery-note-preview-${invoiceId}.pdf"`,
    );
    res.send(pdf);
  }

  @Post()
  approve(
    @Session() session: UserSession,
    @Param("invoiceId") invoiceId: string,
    @Body() body: ApproveDeliveryNoteInput,
  ) {
    return this.deliveryNotesService.approve(
      this.orgId(session),
      invoiceId,
      body,
    );
  }
}
