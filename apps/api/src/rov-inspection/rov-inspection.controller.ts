import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  RequireActiveOrg,
  Session,
  type UserSession,
} from "@thallesp/nestjs-better-auth";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  createMediaSchema,
  createPointSchema,
  createReportSchema,
  createViewSchema,
  updateMediaSchema,
  updatePointSchema,
  updateReportSchema,
  updateViewSchema,
  type CreateMediaInput,
  type CreatePointInput,
  type CreateReportInput,
  type CreateViewInput,
  type UpdateMediaInput,
  type UpdatePointInput,
  type UpdateReportInput,
  type UpdateViewInput,
} from "./dto/rov.dto";
import { RovInspectionService } from "./rov-inspection.service";

@Controller("v1/rov")
@RequireActiveOrg()
export class RovInspectionController {
  constructor(private readonly inspectionService: RovInspectionService) {}

  private orgId(session: UserSession) {
    const organizationId = session.session.activeOrganizationId;
    if (!organizationId) throw new Error("Active organization is required");
    return organizationId;
  }

  private userId(session: UserSession) {
    return session.user.id;
  }

  @Get("projects/:projectId/points")
  listAllPoints(
    @Session() session: UserSession,
    @Param("projectId") projectId: string,
  ) {
    return this.inspectionService.listAllProjectPoints(
      this.orgId(session),
      projectId,
    );
  }

  @Get("projects/:projectId/media")
  listMedia(
    @Session() session: UserSession,
    @Param("projectId") projectId: string,
    @Query("structureId") structureId?: string,
  ) {
    return this.inspectionService.listMedia(
      this.orgId(session),
      projectId,
      structureId,
    );
  }

  @Post("projects/:projectId/media")
  createMedia(
    @Session() session: UserSession,
    @Param("projectId") projectId: string,
    @Body(new ZodValidationPipe(createMediaSchema)) body: CreateMediaInput,
  ) {
    return this.inspectionService.createMedia(
      this.orgId(session),
      projectId,
      this.userId(session),
      body,
    );
  }

  @Patch("media/:mediaId")
  updateMedia(
    @Session() session: UserSession,
    @Param("mediaId") mediaId: string,
    @Query("projectId") projectId: string,
    @Body(new ZodValidationPipe(updateMediaSchema)) body: UpdateMediaInput,
  ) {
    return this.inspectionService.updateMedia(
      this.orgId(session),
      projectId,
      mediaId,
      body,
    );
  }

  @Delete("media/:mediaId")
  deleteMedia(
    @Session() session: UserSession,
    @Param("mediaId") mediaId: string,
    @Query("projectId") projectId: string,
  ) {
    return this.inspectionService.deleteMedia(
      this.orgId(session),
      projectId,
      mediaId,
    );
  }

  @Get("projects/:projectId/structures/:structureId/views")
  listViews(
    @Session() session: UserSession,
    @Param("projectId") projectId: string,
    @Param("structureId") structureId: string,
  ) {
    return this.inspectionService.listViews(
      this.orgId(session),
      projectId,
      structureId,
    );
  }

  @Post("projects/:projectId/structures/:structureId/views")
  createView(
    @Session() session: UserSession,
    @Param("projectId") projectId: string,
    @Param("structureId") structureId: string,
    @Body(new ZodValidationPipe(createViewSchema)) body: CreateViewInput,
  ) {
    return this.inspectionService.createView(
      this.orgId(session),
      projectId,
      structureId,
      body,
    );
  }

  @Patch("projects/:projectId/structures/:structureId/views/:viewId")
  updateView(
    @Session() session: UserSession,
    @Param("projectId") projectId: string,
    @Param("structureId") structureId: string,
    @Param("viewId") viewId: string,
    @Body(new ZodValidationPipe(updateViewSchema)) body: UpdateViewInput,
  ) {
    return this.inspectionService.updateView(
      this.orgId(session),
      projectId,
      structureId,
      viewId,
      body,
    );
  }

  @Delete("projects/:projectId/structures/:structureId/views/:viewId")
  deleteView(
    @Session() session: UserSession,
    @Param("projectId") projectId: string,
    @Param("structureId") structureId: string,
    @Param("viewId") viewId: string,
  ) {
    return this.inspectionService.deleteView(
      this.orgId(session),
      projectId,
      structureId,
      viewId,
    );
  }

  @Get("projects/:projectId/structures/:structureId/views/:viewId/points")
  listPoints(
    @Session() session: UserSession,
    @Param("projectId") projectId: string,
    @Param("structureId") structureId: string,
    @Param("viewId") viewId: string,
  ) {
    return this.inspectionService.listPoints(
      this.orgId(session),
      projectId,
      structureId,
      viewId,
    );
  }

  @Post("projects/:projectId/structures/:structureId/views/:viewId/points")
  createPoint(
    @Session() session: UserSession,
    @Param("projectId") projectId: string,
    @Param("structureId") structureId: string,
    @Param("viewId") viewId: string,
    @Body(new ZodValidationPipe(createPointSchema)) body: CreatePointInput,
  ) {
    return this.inspectionService.createPoint(
      this.orgId(session),
      projectId,
      structureId,
      viewId,
      body,
    );
  }

  @Patch("projects/:projectId/structures/:structureId/views/:viewId/points/:pointId")
  updatePoint(
    @Session() session: UserSession,
    @Param("projectId") projectId: string,
    @Param("structureId") structureId: string,
    @Param("viewId") viewId: string,
    @Param("pointId") pointId: string,
    @Body(new ZodValidationPipe(updatePointSchema)) body: UpdatePointInput,
  ) {
    return this.inspectionService.updatePoint(
      this.orgId(session),
      projectId,
      structureId,
      viewId,
      pointId,
      body,
    );
  }

  @Delete("projects/:projectId/structures/:structureId/views/:viewId/points/:pointId")
  deletePoint(
    @Session() session: UserSession,
    @Param("projectId") projectId: string,
    @Param("structureId") structureId: string,
    @Param("viewId") viewId: string,
    @Param("pointId") pointId: string,
  ) {
    return this.inspectionService.deletePoint(
      this.orgId(session),
      projectId,
      structureId,
      viewId,
      pointId,
    );
  }

  @Get("reports")
  listAllReports(
    @Session() session: UserSession,
    @Query("projectId") projectId?: string,
  ) {
    return this.inspectionService.listReports(this.orgId(session), projectId);
  }

  @Get("projects/:projectId/reports")
  listProjectReports(
    @Session() session: UserSession,
    @Param("projectId") projectId: string,
  ) {
    return this.inspectionService.listReports(this.orgId(session), projectId);
  }

  @Get("reports/:reportId")
  getReport(
    @Session() session: UserSession,
    @Param("reportId") reportId: string,
  ) {
    return this.inspectionService.getReport(this.orgId(session), reportId);
  }

  @Post("projects/:projectId/reports")
  createReport(
    @Session() session: UserSession,
    @Param("projectId") projectId: string,
    @Body(new ZodValidationPipe(createReportSchema)) body: CreateReportInput,
  ) {
    return this.inspectionService.createReport(
      this.orgId(session),
      projectId,
      this.userId(session),
      body,
    );
  }

  @Patch("reports/:reportId")
  updateReport(
    @Session() session: UserSession,
    @Param("reportId") reportId: string,
    @Body(new ZodValidationPipe(updateReportSchema)) body: UpdateReportInput,
  ) {
    return this.inspectionService.updateReport(
      this.orgId(session),
      reportId,
      body,
    );
  }

  @Post("reports/:reportId/share-link")
  generateShareLink(
    @Session() session: UserSession,
    @Param("reportId") reportId: string,
  ) {
    return this.inspectionService.generateShareLink(
      this.orgId(session),
      reportId,
      this.userId(session),
    );
  }
}
