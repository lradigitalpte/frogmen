import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { config as loadEnv } from "dotenv";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";

loadEnv();

const apply = process.argv.includes("--apply");
const uploadRoot = resolve(process.cwd(), process.env.UPLOAD_DIR || "uploads");
const bucket = process.env.AWS_BUCKET;

if (!bucket) {
  throw new Error("AWS_BUCKET is required");
}

const contentTypes = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const client = new S3Client({
  region: process.env.AWS_DEFAULT_REGION || "us-east-1",
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
  ...(process.env.AWS_ENDPOINT
    ? {
        endpoint: process.env.AWS_ENDPOINT,
        forcePathStyle: process.env.AWS_USE_PATH_STYLE_ENDPOINT === "true",
      }
    : {}),
});

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? filesIn(path) : [path];
    }),
  );
  return nested.flat();
}

const files = await filesIn(uploadRoot).catch((error) => {
  if (error?.code === "ENOENT") return [];
  throw error;
});

let uploaded = 0;
for (const path of files) {
  const relativePath = relative(uploadRoot, path).split(sep).join("/");
  const key = `app-uploads/${relativePath}`;

  if (!apply) {
    console.log(`[dry-run] ${relativePath}`);
    continue;
  }

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: await readFile(path),
      ContentType:
        contentTypes[extname(path).toLowerCase()] || "application/octet-stream",
    }),
  );
  await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  uploaded += 1;
  console.log(`[uploaded] ${relativePath}`);
}

console.log(
  apply
    ? `Verified ${uploaded} object(s) in S3. Local source files were retained.`
    : `Found ${files.length} local file(s). Run with --apply to upload them.`,
);
