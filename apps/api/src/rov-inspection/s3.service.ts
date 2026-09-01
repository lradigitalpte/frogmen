import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { Readable } from "node:stream";

const KEY_PREFIX = "rov-inspection/media/";

const ALLOWED_MIME = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/jfif",
]);

@Injectable()
export class S3Service {
  private client: S3Client | null = null;
  private bucket: string | null = null;

  constructor(private readonly config: ConfigService) {}

  private ensureClient(): { client: S3Client; bucket: string } {
    if (this.client && this.bucket) {
      return { client: this.client, bucket: this.bucket };
    }

    const region = this.config.get<string>("AWS_DEFAULT_REGION") ?? "us-east-1";
    const accessKeyId = this.config.get<string>("AWS_ACCESS_KEY_ID");
    const secretAccessKey = this.config.get<string>("AWS_SECRET_ACCESS_KEY");
    const endpoint = this.config.get<string>("AWS_ENDPOINT");
    const bucket = this.config.get<string>("AWS_BUCKET") ?? "";

    if (!bucket) {
      throw new InternalServerErrorException("AWS_BUCKET is not configured");
    }

    this.bucket = bucket;
    this.client = new S3Client({
      region,
      credentials:
        accessKeyId && secretAccessKey
          ? { accessKeyId, secretAccessKey }
          : undefined,
      ...(endpoint
        ? {
            endpoint,
            forcePathStyle:
              this.config.get<string>("AWS_USE_PATH_STYLE_ENDPOINT") === "true",
          }
        : {}),
    });

    return { client: this.client, bucket: this.bucket };
  }

  assertValidKey(key: string, organizationId: string) {
    const organizationPrefix = `${KEY_PREFIX}${organizationId}/`;
    if (
      !key ||
      !key.startsWith(organizationPrefix) ||
      key.includes("..") ||
      key.includes("\\")
    ) {
      throw new BadRequestException("Invalid object key.");
    }
  }

  assertAllowedMime(contentType: string) {
    if (!ALLOWED_MIME.has(contentType)) {
      throw new BadRequestException("Content type is not allowed.");
    }
  }

  async createMultipartUpload(organizationId: string, filename: string, contentType: string) {
    this.assertAllowedMime(contentType);
    const { client, bucket } = this.ensureClient();

    const rawExt = extname(filename).replace(/[^A-Za-z0-9.]/g, "");
    const extension = rawExt ? rawExt.toLowerCase() : "";
    const now = new Date();
    const key = `${KEY_PREFIX}${organizationId}/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${randomUUID()}${extension}`;

    const result = await client.send(
      new CreateMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
      }),
    );

    return {
      key,
      uploadId: result.UploadId!,
    };
  }

  async signUploadPart(organizationId: string, key: string, uploadId: string, partNumber: number) {
    this.assertValidKey(key, organizationId);
    const { client, bucket } = this.ensureClient();

    const command = new UploadPartCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    });

    const url = await getSignedUrl(client, command, { expiresIn: 7200 });

    return { url };
  }

  async uploadPart(
    organizationId: string,
    key: string,
    uploadId: string,
    partNumber: number,
    body: Buffer,
  ) {
    this.assertValidKey(key, organizationId);
    const { client, bucket } = this.ensureClient();

    const result = await client.send(
      new UploadPartCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
        Body: body,
      }),
    );

    const etag = result.ETag?.replace(/"/g, "");
    if (!etag) {
      throw new InternalServerErrorException("S3 did not return an ETag for the uploaded part");
    }

    return { etag };
  }

  async completeMultipartUpload(
    organizationId: string,
    key: string,
    uploadId: string,
    parts: Array<{ PartNumber: number; ETag: string }>,
  ) {
    this.assertValidKey(key, organizationId);
    const { client, bucket } = this.ensureClient();

    const sortedParts = [...parts].sort((a, b) => a.PartNumber - b.PartNumber);

    const result = await client.send(
      new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: sortedParts },
      }),
    );

    return {
      key,
      location: result.Location ?? null,
    };
  }

  async abortMultipartUpload(organizationId: string, key: string, uploadId: string) {
    this.assertValidKey(key, organizationId);
    const { client, bucket } = this.ensureClient();

    await client.send(
      new AbortMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
      }),
    );

    return { ok: true };
  }

  async headObject(key: string) {
    const { client, bucket } = this.ensureClient();
    const result = await client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );

    return {
      contentType: result.ContentType ?? null,
      contentLength: result.ContentLength ?? null,
    };
  }

  async putObject(key: string, body: Buffer, contentType: string) {
    const { client, bucket } = this.ensureClient();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return { key };
  }

  async getObjectStream(key: string) {
    const { client, bucket } = this.ensureClient();
    const result = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    if (!result.Body) {
      throw new InternalServerErrorException("S3 returned an empty object");
    }
    const bytes = await result.Body.transformToByteArray();
    return {
      stream: Readable.from(Buffer.from(bytes)),
      buffer: Buffer.from(bytes),
      contentType: result.ContentType ?? "application/octet-stream",
    };
  }

  async deleteObject(key: string) {
    const { client, bucket } = this.ensureClient();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }

  async getPresignedUrl(key: string, expiresIn = 3600) {
    if (!key) return null;
    if (!key.startsWith("rov-inspection/") && !key.startsWith("company-vault/")) return null;

    const { client, bucket } = this.ensureClient();
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    return getSignedUrl(client, command, { expiresIn });
  }

  getPublicUrl(key: string) {
    if (!key) return null;

    const bucket = this.config.get<string>("AWS_BUCKET") ?? "";
    const endpoint = this.config.get<string>("AWS_ENDPOINT");
    const region = this.config.get<string>("AWS_DEFAULT_REGION") ?? "us-east-1";

    if (!bucket) return null;

    if (endpoint) {
      return `${endpoint.replace(/\/$/, "")}/${bucket}/${key}`;
    }

    return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  }
}
