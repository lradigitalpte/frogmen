import "../load-env";
import { Module } from "@nestjs/common";
import { AuthModule as BetterAuthModule } from "@thallesp/nestjs-better-auth";
import { getAuth } from "./auth";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for AuthModule");
}

@Module({
  imports: [
    BetterAuthModule.forRoot({
      auth: getAuth(databaseUrl),
      bodyParser: {
        json: { limit: "2mb" },
        urlencoded: { limit: "2mb", extended: true },
      },
    }),
  ],
})
export class AuthModule {}
