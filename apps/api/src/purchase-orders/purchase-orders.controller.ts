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
import {
  RequireActiveOrg,
  Session,
  type UserSession,
} from "@thallesp/nestjs-better-auth";
import {
  PurchaseOrdersService,
  type AddPurchaseOrderLineInput,
  type CreatePurchaseOrderInput,
  type ListPurchaseOrdersQuery,
  type UpdateGoodsReceiptLineInput,
  type UpdatePurchaseOrderInput,
  type UpdatePurchaseOrderLineInput,
} from "./purchase-orders.service";
import type { Response } from "express";
import { DocumentRendererService } from "../documents/document-renderer.service";

@Controller()
@RequireActiveOrg()
export class PurchaseOrdersController {
  constructor(
    private readonly purchaseOrdersService: PurchaseOrdersService,
    private readonly documentRenderer: DocumentRendererService,
  ) {}

  private orgId(session: UserSession) {
    const organizationId = session.session.activeOrganizationId;

    if (!organizationId) {
      throw new Error("Active organization is required");
    }

    return organizationId;
  }

  private userId(session: UserSession) {
    return session.user.id;
  }

  @Get("v1/purchase-orders")
  list(
    @Session() session: UserSession,
    @Query() query: ListPurchaseOrdersQuery,
  ) {
    return this.purchaseOrdersService.list(this.orgId(session), {
      ...query,
      page: query.page ? Number(query.page) : undefined,
      perPage: query.perPage ? Number(query.perPage) : undefined,
    });
  }

  @Get("v1/purchase-orders/:id/document.html")
  @Header("Content-Type", "text/html; charset=utf-8")
  async getDocumentHtml(@Session() session: UserSession, @Param("id") id: string, @Res() res: Response) {
    res.send(await this.documentRenderer.renderPurchaseOrderHtml(this.orgId(session), id));
  }

  @Get("v1/purchase-orders/:id/document.pdf")
  async getDocumentPdf(@Session() session: UserSession, @Param("id") id: string, @Res() res: Response) {
    const pdf = await this.documentRenderer.renderPurchaseOrderPdf(this.orgId(session), id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="purchase-order-${id}.pdf"`);
    res.send(pdf);
  }

  @Get("v1/purchase-orders/:id")
  get(@Session() session: UserSession, @Param("id") id: string) {
    return this.purchaseOrdersService.getById(this.orgId(session), id);
  }

  @Post("v1/purchase-orders")
  create(
    @Session() session: UserSession,
    @Body() body: CreatePurchaseOrderInput,
  ) {
    return this.purchaseOrdersService.create(
      this.orgId(session),
      this.userId(session),
      body,
    );
  }

  @Patch("v1/purchase-orders/:id")
  update(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Body() body: UpdatePurchaseOrderInput,
  ) {
    return this.purchaseOrdersService.update(
      this.orgId(session),
      id,
      this.userId(session),
      body,
    );
  }

  @Post("v1/purchase-orders/:id/lines")
  addLine(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Body() body: AddPurchaseOrderLineInput,
  ) {
    return this.purchaseOrdersService.addLine(this.orgId(session), id, body);
  }

  @Patch("v1/purchase-orders/:id/lines/:lineId")
  updateLine(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Param("lineId") lineId: string,
    @Body() body: UpdatePurchaseOrderLineInput,
  ) {
    return this.purchaseOrdersService.updateLine(
      this.orgId(session),
      id,
      lineId,
      body,
    );
  }

  @Delete("v1/purchase-orders/:id/lines/:lineId")
  deleteLine(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Param("lineId") lineId: string,
  ) {
    return this.purchaseOrdersService.deleteLine(
      this.orgId(session),
      id,
      lineId,
    );
  }

  @Post("v1/purchase-orders/:id/confirm")
  confirm(@Session() session: UserSession, @Param("id") id: string) {
    return this.purchaseOrdersService.confirm(
      this.orgId(session),
      id,
      this.userId(session),
    );
  }

  @Post("v1/purchase-orders/:id/cancel")
  cancel(@Session() session: UserSession, @Param("id") id: string) {
    return this.purchaseOrdersService.cancel(
      this.orgId(session),
      id,
      this.userId(session),
    );
  }

  @Delete("v1/purchase-orders/:id")
  delete(@Session() session: UserSession, @Param("id") id: string) {
    return this.purchaseOrdersService.delete(this.orgId(session), id);
  }

  @Post("v1/purchase-orders/:id/notes")
  addNote(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Body() body: { message: string },
  ) {
    return this.purchaseOrdersService.addNote(
      this.orgId(session),
      id,
      this.userId(session),
      body.message,
    );
  }

  @Post("v1/purchase-orders/:id/receipts")
  createReceipt(@Session() session: UserSession, @Param("id") id: string) {
    return this.purchaseOrdersService.createReceipt(
      this.orgId(session),
      id,
      this.userId(session),
    );
  }

  @Get("v1/goods-receipts")
  listReceipts(
    @Session() session: UserSession,
    @Query() query: { page?: number; perPage?: number },
  ) {
    return this.purchaseOrdersService.listReceipts(this.orgId(session), {
      page: query.page ? Number(query.page) : undefined,
      perPage: query.perPage ? Number(query.perPage) : undefined,
    });
  }

  @Get("v1/goods-receipts/:id")
  getReceipt(@Session() session: UserSession, @Param("id") id: string) {
    return this.purchaseOrdersService.getReceiptById(this.orgId(session), id);
  }

  @Patch("v1/goods-receipts/:id")
  updateReceipt(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Body() body: { receiptDate?: string; notes?: string | null },
  ) {
    return this.purchaseOrdersService.updateReceipt(
      this.orgId(session),
      id,
      body,
    );
  }

  @Patch("v1/goods-receipts/:id/lines/:lineId")
  updateReceiptLine(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Param("lineId") lineId: string,
    @Body() body: UpdateGoodsReceiptLineInput,
  ) {
    return this.purchaseOrdersService.updateReceiptLine(
      this.orgId(session),
      id,
      lineId,
      body,
    );
  }

  @Post("v1/goods-receipts/:id/validate")
  validateReceipt(@Session() session: UserSession, @Param("id") id: string) {
    return this.purchaseOrdersService.validateReceipt(
      this.orgId(session),
      id,
      this.userId(session),
    );
  }
}
