import { Module } from "@nestjs/common";
import { FilesController } from "./files.controller";
import { UploadsService } from "./uploads.service";
import { S3Service } from "../rov-inspection/s3.service";

@Module({
  controllers: [FilesController],
  providers: [UploadsService, S3Service],
  exports: [UploadsService, S3Service],
})
export class UploadsModule {}
