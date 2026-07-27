import "./load-env";
import { config } from "dotenv";
import { resolve } from "node:path";
import { NestFactory } from "@nestjs/core";
import { runMigrations, ensureCurrencies, applyCustomersIfNeeded, applyCustomerCreditIfNeeded, applyCustomerIsLocalIfNeeded, applyInventoryIfNeeded, applyPaymentRemindersIfNeeded, applyAccountingIfNeeded, applyPurchasingIfNeeded, applyRovInspectionIfNeeded, applyCreditNotesIfNeeded } from "@frog1/db";
import { AppModule } from "./app.module";

async function bootstrap() {
  config({ path: resolve(__dirname, "../../../.env") });

  const databaseUrl = process.env.DATABASE_URL;
  const autoMigrate = process.env.AUTO_MIGRATE !== "false";

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (autoMigrate) {
    await runMigrations(databaseUrl);
    await applyCustomersIfNeeded(databaseUrl);
    await applyCustomerCreditIfNeeded(databaseUrl);
    await applyCustomerIsLocalIfNeeded(databaseUrl);
    await applyInventoryIfNeeded(databaseUrl);
    await applyPaymentRemindersIfNeeded(databaseUrl);
    await applyAccountingIfNeeded(databaseUrl);
    await applyPurchasingIfNeeded(databaseUrl);
    await applyCreditNotesIfNeeded(databaseUrl);
    await applyRovInspectionIfNeeded(databaseUrl);
  }

  await ensureCurrencies(databaseUrl);

  const app = await NestFactory.create(AppModule, { bodyParser: false });

  app.use((_request: unknown, response: { setHeader: (name: string, value: string) => void }, next: () => void) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    next();
  });

  app.setGlobalPrefix("api");

  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3001);
  await app.listen(port, "0.0.0.0");

  console.log(`API running at http://localhost:${port}/api`);
}

bootstrap();
