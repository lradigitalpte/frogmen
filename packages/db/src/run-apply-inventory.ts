import { config } from "dotenv";
import { resolve } from "node:path";
import { applyInventoryIfNeeded } from "./apply-inventory";

config({ path: resolve(__dirname, "../../../.env") });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not configured");
}

applyInventoryIfNeeded(connectionString).catch((error) => {
  console.error(error);
  process.exit(1);
});
