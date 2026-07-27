import { Module } from "@nestjs/common";
import { DocumentsModule } from "../documents/documents.module";
import { UploadsModule } from "../uploads/uploads.module";
import { PublicReportController } from "./public-report.controller";
import { RovInspectionController } from "./rov-inspection.controller";
import { RovInspectionService } from "./rov-inspection.service";
import { RovProjectsController } from "./rov-projects.controller";
import { RovProjectsService } from "./rov-projects.service";
import { RovUploadsService } from "./rov-uploads.service";
import { S3MultipartController } from "./s3-multipart.controller";
import { S3Service } from "./s3.service";

@Module({
  imports: [DocumentsModule, UploadsModule],
  controllers: [
    RovProjectsController,
    RovInspectionController,
    S3MultipartController,
    PublicReportController,
  ],
  providers: [
    RovProjectsService,
    RovInspectionService,
    RovUploadsService,
  ],
  exports: [RovProjectsService, RovInspectionService, S3Service],
})
export class RovInspectionModule {}
