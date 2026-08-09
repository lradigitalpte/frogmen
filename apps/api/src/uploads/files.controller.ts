import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Res,
} from "@nestjs/common";
import {
  RequireActiveOrg,
  Session,
  type UserSession,
} from "@thallesp/nestjs-better-auth";
import type { Response } from "express";
import type { Readable } from "node:stream";
import { UploadsService } from "./uploads.service";

@Controller("v1/files")
@RequireActiveOrg()
export class FilesController {
  constructor(private readonly uploadsService: UploadsService) {}

  private orgId(session: UserSession) {
    const organizationId = session.session.activeOrganizationId;

    if (!organizationId) {
      throw new NotFoundException("Active organization is required");
    }

    return organizationId;
  }

  private pipeFile(
    res: Response,
    stream: Readable,
    contentType: string,
  ) {
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("X-Content-Type-Options", "nosniff");

    stream.on("error", () => {
      if (!res.headersSent) {
        res.status(404).json({ message: "File not found" });
        return;
      }

      res.end();
    });

    stream.pipe(res);
  }

  @Get("avatars/:organizationId/:fileName")
  async serveAvatar(
    @Session() session: UserSession,
    @Param("organizationId") organizationId: string,
    @Param("fileName") fileName: string,
    @Res() res: Response,
  ) {
    if (organizationId !== this.orgId(session)) {
      throw new NotFoundException("File not found");
    }

    const relativePath = `avatars/${organizationId}/${fileName}`;
    const { stream, contentType } =
      await this.uploadsService.getCustomerAvatarStream(organizationId, relativePath);

    this.pipeFile(res, stream, contentType);
  }

  @Get("products/:organizationId/:productId/:fileName")
  async serveProductImage(
    @Session() session: UserSession,
    @Param("organizationId") organizationId: string,
    @Param("productId") productId: string,
    @Param("fileName") fileName: string,
    @Res() res: Response,
  ) {
    if (organizationId !== this.orgId(session)) {
      throw new NotFoundException("File not found");
    }

    const relativePath = `products/${organizationId}/${productId}/${fileName}`;
    const { stream, contentType } =
      await this.uploadsService.getProductImageStream(organizationId, relativePath);

    this.pipeFile(res, stream, contentType);
  }

  @Get("org-logos/:organizationId/:fileName")
  async serveOrganizationLogo(
    @Session() session: UserSession,
    @Param("organizationId") organizationId: string,
    @Param("fileName") fileName: string,
    @Res() res: Response,
  ) {
    if (organizationId !== this.orgId(session)) {
      throw new NotFoundException("File not found");
    }

    const relativePath = `org-logos/${organizationId}/${fileName}`;
    const { stream, contentType } =
      await this.uploadsService.getOrganizationLogoStream(organizationId, relativePath);

    this.pipeFile(res, stream, contentType);
  }

  @Get("quotations/:organizationId/:quotationId/:fileName")
  async serveCustomerPoDocument(
    @Session() session: UserSession,
    @Param("organizationId") organizationId: string,
    @Param("quotationId") quotationId: string,
    @Param("fileName") fileName: string,
    @Res() res: Response,
  ) {
    if (organizationId !== this.orgId(session)) {
      throw new NotFoundException("File not found");
    }

    const relativePath = `quotations/${organizationId}/${quotationId}/${fileName}`;
    const { stream, contentType } =
      await this.uploadsService.getCustomerPoDocumentStream(organizationId, relativePath);

    this.pipeFile(res, stream, contentType);
  }

  @Get("rov/*splat")
  async serveRovFile(
    @Session() session: UserSession,
    @Param("splat") splat: string | string[],
    @Res() res: Response,
  ) {
    const organizationId = this.orgId(session);
    const suffix = Array.isArray(splat) ? splat.join("/") : splat;
    const relativePath = `rov/${organizationId}/${suffix}`;
    const { stream, contentType } = await this.uploadsService.getRovFileStream(
      organizationId,
      relativePath,
    );

    this.pipeFile(res, stream, contentType);
  }
}
