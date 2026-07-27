import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

const envCandidates = [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../../.env"),
  resolve(__dirname, "../../../.env"),
  resolve(__dirname, "../../../../.env"),
];

for (const file of envCandidates) {
  if (existsSync(file)) {
    config({ path: file });
    break;
  }
}
