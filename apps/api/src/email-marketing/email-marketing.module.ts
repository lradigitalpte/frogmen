import { Module } from "@nestjs/common";
import { MailModule } from "../mail/mail.module";
import { EmailMarketingController } from "./email-marketing.controller";
import { EmailMarketingService } from "./email-marketing.service";

@Module({
  imports: [MailModule],
  controllers: [EmailMarketingController],
  providers: [EmailMarketingService],
  exports: [EmailMarketingService],
})
export class EmailMarketingModule {}
