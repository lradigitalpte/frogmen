import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Helper to manually parse .env if needed
function parseEnv(filePath) {
  if (!existsSync(filePath)) return {};
  const content = readFileSync(filePath, "utf-8");
  const env = {};
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

const rootEnvPath = resolve(__dirname, "../.env");
const parsed = parseEnv(rootEnvPath);

// Prioritize process.env, fallback to parsed root .env
const accessKeyId = (process.env.AWS_ACCESS_KEY_ID || parsed.AWS_ACCESS_KEY_ID || "").trim();
const secretAccessKey = (process.env.AWS_SECRET_ACCESS_KEY || parsed.AWS_SECRET_ACCESS_KEY || "").trim();
const region = (process.env.AWS_DEFAULT_REGION || parsed.AWS_DEFAULT_REGION || "eu-north-1").trim();
const bucket = (process.env.AWS_BUCKET || parsed.AWS_BUCKET || "frogmen").trim();
const endpoint = (process.env.AWS_ENDPOINT || parsed.AWS_ENDPOINT || "").trim();
const forcePathStyle = (process.env.AWS_USE_PATH_STYLE_ENDPOINT || parsed.AWS_USE_PATH_STYLE_ENDPOINT) === "true";

console.log("==========================================");
console.log("       AWS S3 CREDENTIALS TEST            ");
console.log("==========================================");
console.log(`Environment file: ${rootEnvPath}`);
console.log(`Region:           ${region}`);
console.log(`Bucket:           ${bucket}`);
console.log(`Endpoint:         ${endpoint || "(default AWS)"}`);
console.log(`Path style:       ${forcePathStyle}`);
console.log(`Access Key ID:    ${accessKeyId || "(not found)"}`);
console.log(`Secret Key:       ${secretAccessKey ? `${secretAccessKey.slice(0, 4)}...${secretAccessKey.slice(-4)}` : "(not found)"}`);
console.log("------------------------------------------\n");

if (!accessKeyId || !secretAccessKey) {
  console.error("ERROR: AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY is missing!");
  process.exit(1);
}

// Resolve AWS SDK from apps/api
const apiRequire = createRequire(resolve(__dirname, "../apps/api/package.json"));
const {
  S3Client,
  ListBucketsCommand,
  HeadBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = apiRequire("@aws-sdk/client-s3");

const client = new S3Client({
  region,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
  ...(endpoint ? { endpoint, forcePathStyle } : {}),
});

async function run() {
  let anyError = false;

  // 1. ListBuckets test
  console.log("1. Testing AWS Account Credentials (ListBuckets)...");
  try {
    const listRes = await client.send(new ListBucketsCommand({}));
    console.log("   [OK] Authentication SUCCEEDED!");
    const bucketNames = (listRes.Buckets || []).map((b) => b.Name);
    console.log(`   Found ${bucketNames.length} bucket(s) in account:`, bucketNames.join(", ") || "(none)");
  } catch (err) {
    anyError = true;
    console.error("   [FAIL] ListBuckets failed:");
    console.error(`   Error Code: ${err.Code || err.name || "Unknown"}`);
    console.error(`   Message:    ${err.message}`);
    if (err.name === "InvalidAccessKeyId" || err.Code === "InvalidAccessKeyId") {
      console.error("\n>>> CAUSE: AWS does not recognize this Access Key ID ('" + accessKeyId + "').");
      console.error("    The key was deleted/deactivated or belongs to another AWS account.");
    } else if (err.name === "SignatureDoesNotMatch") {
      console.error("\n>>> CAUSE: The Secret Access Key does not match the Access Key ID.");
    }
  }

  // 2. HeadBucket test
  console.log(`\n2. Testing Access to Bucket '${bucket}' (HeadBucket)...`);
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log(`   [OK] Bucket '${bucket}' exists and is accessible!`);
  } catch (err) {
    anyError = true;
    console.error(`   [FAIL] Cannot access bucket '${bucket}':`);
    console.error(`   Status:  ${err.$metadata?.httpStatusCode || "Unknown"}`);
    console.error(`   Code:    ${err.Code || err.name || "Unknown"}`);
    console.error(`   Message: ${err.message}`);
    if (err.$metadata?.httpStatusCode === 404) {
      console.error(`\n>>> CAUSE: Bucket '${bucket}' was not found in region '${region}'.`);
    } else if (err.$metadata?.httpStatusCode === 403) {
      console.error(`\n>>> CAUSE: 403 Forbidden. This IAM user lacks permission to access bucket '${bucket}'.`);
    } else if (err.$metadata?.httpStatusCode === 301) {
      console.error(`\n>>> CAUSE: Bucket '${bucket}' is in a different AWS region than '${region}'.`);
    }
  }

  // 3. PutObject test
  console.log("\n3. Testing File Upload (PutObject)...");
  const testKey = "app-uploads/connection-test.txt";
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: testKey,
        Body: Buffer.from("Frog1 connection test at " + new Date().toISOString()),
        ContentType: "text/plain",
      }),
    );
    console.log(`   [OK] Successfully uploaded test file to '${testKey}'`);

    // 4. GetObject test
    console.log("\n4. Testing File Download (GetObject)...");
    const getRes = await client.send(new GetObjectCommand({ Bucket: bucket, Key: testKey }));
    const text = await getRes.Body.transformToString();
    console.log(`   [OK] Successfully read test file: "${text}"`);

    // 5. DeleteObject test
    console.log("\n5. Testing File Deletion (DeleteObject)...");
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: testKey }));
    console.log("   [OK] Cleaned up test file.");
  } catch (err) {
    anyError = true;
    console.error("   [FAIL] File operation failed:");
    console.error(`   Code:    ${err.Code || err.name || "Unknown"}`);
    console.error(`   Message: ${err.message}`);
  }

  console.log("\n------------------------------------------");
  if (!anyError) {
    console.log("RESULT: ALL S3 CHECKS PASSED!");
  } else {
    console.log("RESULT: S3 CHECKS FAILED. See details above.");
  }
  console.log("------------------------------------------\n");
}

run();
