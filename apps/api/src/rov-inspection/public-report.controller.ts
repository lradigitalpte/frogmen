import {
  Controller,
  Get,
  GoneException,
  Headers,
  Ip,
  NotFoundException,
  Param,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import type { Readable } from "node:stream";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { renderInspectionReportDocumentHtml } from "@frog1/shared";
import { PdfService } from "../documents/pdf.service";
import { RovInspectionService } from "./rov-inspection.service";

@Controller("v1/public/report")
@AllowAnonymous()
export class PublicReportController {
  constructor(
    private readonly inspectionService: RovInspectionService,
    private readonly pdfService: PdfService,
  ) {}

  private pipeFile(
    res: Response,
    stream: Readable,
    contentType: string,
  ) {
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "private, max-age=3600");

    stream.on("error", () => {
      if (!res.headersSent) {
        res.status(404).json({ message: "File not found" });
        return;
      }

      res.end();
    });

    stream.pipe(res);
  }

  @Get(":hash/assets/*splat")
  async serveAsset(
    @Param("hash") hash: string,
    @Param("splat") splat: string | string[],
    @Res() res: Response,
  ) {
    try {
      const suffix = Array.isArray(splat) ? splat.join("/") : splat;
      const { stream, contentType } =
        await this.inspectionService.getPublicReportAsset(hash, suffix);
      this.pipeFile(res, stream, contentType);
    } catch {
      throw new NotFoundException("File not found");
    }
  }

  @Get(":hash")
  async getReport(
    @Param("hash") hash: string,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string,
  ) {
    try {
      return await this.inspectionService.getPublicReport(
        hash,
        ip,
        userAgent,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "This report link has expired."
      ) {
        throw new GoneException(error.message);
      }
      throw error;
    }
  }

  @Get(":hash/pdf")
  async downloadPdf(
    @Param("hash") hash: string,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string,
    @Res() res: Response,
  ) {
    const payload = await this.inspectionService.getPublicReport(
      hash,
      ip,
      userAgent,
    );

    if (!payload.report.clientCanDownload) {
      res.status(403).json({ message: "PDF download is not enabled for this report." });
      return;
    }

    const html = renderInspectionReportDocumentHtml(payload);
    const pdf = await this.pdfService.renderHtmlToPdf(html);
    const fileName = `${(payload.report.title ?? "inspection-report")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(pdf);
  }
}
