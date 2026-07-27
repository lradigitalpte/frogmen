import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  RequireActiveOrg,
  Session,
  type UserSession,
} from "@thallesp/nestjs-better-auth";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  createRovProjectSchema,
  createStructureSchema,
  listRovProjectsQuerySchema,
  updateRovProjectSchema,
  updateStructureSchema,
  type CreateRovProjectInput,
  type CreateStructureInput,
  type ListRovProjectsQuery,
  type UpdateRovProjectInput,
  type UpdateStructureInput,
} from "./dto/rov.dto";
import { RovProjectsService } from "./rov-projects.service";
import { RovUploadsService } from "./rov-uploads.service";

@Controller("v1/rov/projects")
@RequireActiveOrg()
export class RovProjectsController {
  constructor(
    private readonly projectsService: RovProjectsService,
    private readonly uploadsService: RovUploadsService,
  ) {}

  private orgId(session: UserSession) {
    const organizationId = session.session.activeOrganizationId;
    if (!organizationId) throw new Error("Active organization is required");
    return organizationId;
  }

  private userId(session: UserSession) {
    return session.user.id;
  }

  @Get()
  list(
    @Session() session: UserSession,
    @Query(new ZodValidationPipe(listRovProjectsQuerySchema))
    query: ListRovProjectsQuery,
  ) {
    return this.projectsService.list(this.orgId(session), query);
  }

  @Get(":projectId")
  getById(@Session() session: UserSession, @Param("projectId") projectId: string) {
    return this.projectsService.getById(this.orgId(session), projectId);
  }

  @Post()
  create(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(createRovProjectSchema)) body: CreateRovProjectInput,
  ) {
    return this.projectsService.create(
      this.orgId(session),
      this.userId(session),
      body,
    );
  }

  @Patch(":projectId")
  update(
    @Session() session: UserSession,
    @Param("projectId") projectId: string,
    @Body(new ZodValidationPipe(updateRovProjectSchema)) body: UpdateRovProjectInput,
  ) {
    return this.projectsService.update(this.orgId(session), projectId, body);
  }

  @Delete(":projectId")
  delete(@Session() session: UserSession, @Param("projectId") projectId: string) {
    return this.projectsService.delete(this.orgId(session), projectId);
  }

  @Post(":projectId/plan-view")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 20 * 1024 * 1024 } }))
  async uploadPlanView(
    @Session() session: UserSession,
    @Param("projectId") projectId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const path = await this.uploadsService.saveProjectImage(
      this.orgId(session),
      projectId,
      "plan-view",
      file,
    );
    return this.projectsService.updatePlanViewPath(
      this.orgId(session),
      projectId,
      path,
    );
  }

  @Delete(":projectId/plan-view")
  async removePlanView(
    @Session() session: UserSession,
    @Param("projectId") projectId: string,
  ) {
    return this.projectsService.updatePlanViewPath(
      this.orgId(session),
      projectId,
      null,
    );
  }

  @Post(":projectId/site-map")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 20 * 1024 * 1024 } }))
  async uploadSiteMap(
    @Session() session: UserSession,
    @Param("projectId") projectId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const path = await this.uploadsService.saveProjectImage(
      this.orgId(session),
      projectId,
      "site-map",
      file,
    );
    return this.projectsService.updateSiteMapPath(
      this.orgId(session),
      projectId,
      path,
    );
  }

  @Delete(":projectId/site-map")
  async removeSiteMap(
    @Session() session: UserSession,
    @Param("projectId") projectId: string,
  ) {
    return this.projectsService.updateSiteMapPath(
      this.orgId(session),
      projectId,
      null,
    );
  }

  @Get(":projectId/structures")
  listStructures(
    @Session() session: UserSession,
    @Param("projectId") projectId: string,
  ) {
    return this.projectsService.listStructures(this.orgId(session), projectId);
  }

  @Post(":projectId/structures")
  createStructure(
    @Session() session: UserSession,
    @Param("projectId") projectId: string,
    @Body(new ZodValidationPipe(createStructureSchema)) body: CreateStructureInput,
  ) {
    return this.projectsService.createStructure(
      this.orgId(session),
      projectId,
      body,
    );
  }

  @Patch(":projectId/structures/:structureId")
  updateStructure(
    @Session() session: UserSession,
    @Param("projectId") projectId: string,
    @Param("structureId") structureId: string,
    @Body(new ZodValidationPipe(updateStructureSchema)) body: UpdateStructureInput,
  ) {
    return this.projectsService.updateStructure(
      this.orgId(session),
      projectId,
      structureId,
      body,
    );
  }

  @Delete(":projectId/structures/:structureId")
  deleteStructure(
    @Session() session: UserSession,
    @Param("projectId") projectId: string,
    @Param("structureId") structureId: string,
  ) {
    return this.projectsService.deleteStructure(
      this.orgId(session),
      projectId,
      structureId,
    );
  }

  @Post(":projectId/structures/:structureId/diagram")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 20 * 1024 * 1024 } }))
  async uploadDiagram(
    @Session() session: UserSession,
    @Param("projectId") projectId: string,
    @Param("structureId") structureId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const path = await this.uploadsService.saveStructureImage(
      this.orgId(session),
      projectId,
      structureId,
      "diagram",
      file,
    );
    return this.projectsService.updateStructure(
      this.orgId(session),
      projectId,
      structureId,
      { diagramPath: path },
    );
  }

  @Post(":projectId/structures/:structureId/photo")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 20 * 1024 * 1024 } }))
  async uploadPhoto(
    @Session() session: UserSession,
    @Param("projectId") projectId: string,
    @Param("structureId") structureId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const path = await this.uploadsService.saveStructureImage(
      this.orgId(session),
      projectId,
      structureId,
      "photo",
      file,
    );
    return this.projectsService.updateStructure(
      this.orgId(session),
      projectId,
      structureId,
      { photoPath: path },
    );
  }
}
