import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

function parseEnv(contents) {
  return Object.fromEntries(
    contents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        const key = line.slice(0, separator).trim();
        let value = line.slice(separator + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        return [key, value];
      }),
  );
}

function required(values, key) {
  const value = values[key];
  if (!value) throw new Error(`Missing protected Railway variable: ${key}`);
  return value;
}

const railwayArguments = [
  "variables",
  "--json",
  "--project",
  "4ac62acd-8385-4642-9751-b4d2d94dd474",
  "--service",
  "frogmendash",
  "--environment",
  "production",
];
const railwayExecutable =
  process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : "railway";
const railwayOutput = execFileSync(
  railwayExecutable,
  process.platform === "win32"
    ? ["/d", "/s", "/c", "railway.cmd", ...railwayArguments]
    : railwayArguments,
  { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
);
const protectedValues = JSON.parse(railwayOutput);

let localValues = {};
try {
  localValues = parseEnv(readFileSync(resolve(root, ".env"), "utf8"));
} catch {
  // Railway's protected deployment bundle is the primary source.
}

const get = (protectedName, localName = protectedName) =>
  protectedValues[protectedName] || localValues[localName] || "";

const output = {
  NODE_ENV: "production",
  AUTO_MIGRATE: "false",
  DATABASE_URL: required(protectedValues, "FROG1_DATABASE_URL"),
  MIGRATION_DATABASE_URL: "${{Postgres.DATABASE_URL}}",
  MIGRATION_DATABASE_NAME: "frogmendash_db",
  BETTER_AUTH_SECRET: required(
    protectedValues,
    "FROG1_BETTER_AUTH_SECRET",
  ),
  WEB_URL: "https://REPLACE-WITH-YOUR-VERCEL-DOMAIN",
  BETTER_AUTH_URL: "https://REPLACE-WITH-YOUR-VERCEL-DOMAIN",
  API_URL: "https://${{RAILWAY_PUBLIC_DOMAIN}}",
  RESEND_API_KEY: "REPLACE-WITH-NEW-ROTATED-RESEND-KEY",
  MAIL_FROM_ADDRESS:
    get("FROG1_MAIL_FROM_ADDRESS", "MAIL_FROM_ADDRESS") ||
    "frogmen@polygraph.ae",
  MAIL_FROM_NAME: "Frogmen",
  AWS_ACCESS_KEY_ID: required(
    {
      AWS_ACCESS_KEY_ID: get(
        "FROG1_AWS_ACCESS_KEY_ID",
        "AWS_ACCESS_KEY_ID",
      ),
    },
    "AWS_ACCESS_KEY_ID",
  ),
  AWS_SECRET_ACCESS_KEY: required(
    {
      AWS_SECRET_ACCESS_KEY: get(
        "FROG1_AWS_SECRET_ACCESS_KEY",
        "AWS_SECRET_ACCESS_KEY",
      ),
    },
    "AWS_SECRET_ACCESS_KEY",
  ),
  AWS_DEFAULT_REGION:
    get("FROG1_AWS_DEFAULT_REGION", "AWS_DEFAULT_REGION") || "us-east-1",
  AWS_BUCKET: required(
    { AWS_BUCKET: get("FROG1_AWS_BUCKET", "AWS_BUCKET") },
    "AWS_BUCKET",
  ),
  AWS_USE_PATH_STYLE_ENDPOINT:
    get(
      "FROG1_AWS_USE_PATH_STYLE_ENDPOINT",
      "AWS_USE_PATH_STYLE_ENDPOINT",
    ) || "false",
  DEFAULT_CURRENCY: "AED",
};

const endpoint = get("FROG1_AWS_ENDPOINT", "AWS_ENDPOINT");
if (endpoint) output.AWS_ENDPOINT = endpoint;

const target = resolve(root, "railway.production.variables.json");
writeFileSync(target, `${JSON.stringify(output, null, 2)}\n`, {
  mode: 0o600,
});
console.log(
  "Created railway.production.variables.json. Replace the two Vercel URLs and the rotated Resend key before importing it.",
);
