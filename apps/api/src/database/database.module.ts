import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createDb } from "@frog1/db";
import { DATABASE, RAW_DATABASE } from "./database.constants";
import { createContextualDatabase } from "./database-context";

@Global()
@Module({
  providers: [
    {
      provide: RAW_DATABASE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>("DATABASE_URL");

        if (!url) {
          throw new Error("DATABASE_URL is not configured");
        }

        return createDb(url);
      },
    },
    {
      provide: DATABASE,
      inject: [RAW_DATABASE],
      useFactory: createContextualDatabase,
    },
  ],
  exports: [DATABASE, RAW_DATABASE],
})
export class DatabaseModule {}
