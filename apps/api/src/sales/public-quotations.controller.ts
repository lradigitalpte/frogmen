import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { DocumentRendererService } from "../documents/document-renderer.service";
import { QuotationsService } from "./quotations.service";

@Controller("v1/public/quotations")
@AllowAnonymous()
export class PublicQuotationsController {
  constructor(
    private readonly quotationsService: QuotationsService,
    private readonly documentRenderer: DocumentRendererService,
  ) {}

  @Get(":token")
  getPublicQuotation(@Param("token") token: string) {
    return this.quotationsService.getPublicByToken(token);
  }

  @Get(":token/pdf")
  async getPublicQuotationPdf(
    @Param("token") token: string,
    @Res() res: Response,
  ) {
    const quotation = await this.quotationsService.getPublicByToken(token);
    const pdf = await this.documentRenderer.renderQuotationPdf(
      quotation.organizationId,
      quotation.id,
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="quotation-${quotation.number}.pdf"`,
    );
    res.send(pdf);
  }

  @Post(":token/sign")
  async signPublicQuotation(
    @Param("token") token: string,
    @Body()
    body: {
      signedBy: string;
      signatureImage: string;
      signedEmail?: string;
    },
    @Req() req: Request,
  ) {
    const rawIp =
      (req.headers["x-forwarded-for"] as string) ||
      req.socket.remoteAddress ||
      "127.0.0.1";
    const clientIp = rawIp.split(",")[0].trim();

    return this.quotationsService.signPublicQuotation(token, body, clientIp);
  }
}
