import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import type { Response } from "express";
import { PlatformAdminGuard } from "./platform-admin.guard";
import { PlatformBackupsService } from "./platform-backups.service";

@Controller("v1/platform")
@UseGuards(PlatformAdminGuard)
export class PlatformBackupsController {
  constructor(private readonly backups: PlatformBackupsService) {}

  @Get("backups")
  list() {
    return this.backups.list();
  }

  @Post("organizations/:id/backups")
  start(@Session() session: UserSession, @Param("id") id: string) {
    return this.backups.start(id, session.user.email);
  }

  @Get("backups/:id/download")
  async download(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.backups.download(id, session.user.email);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(buffer);
  }

  @Delete("backups/:id")
  remove(@Param("id") id: string) {
    return this.backups.remove(id);
  }
}
