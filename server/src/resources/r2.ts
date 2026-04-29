import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    const endpoint = process.env.R2_ENDPOINT;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    if (!endpoint || !accessKeyId || !secretAccessKey) {
      throw new Error(
        "R2 env vars required: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY"
      );
    }
    s3Client = new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return s3Client;
}

export function r2Configured(): boolean {
  return Boolean(
    process.env.R2_ENDPOINT &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET &&
      process.env.R2_CDN_URL
  );
}

export async function uploadToR2(args: {
  body: Buffer;
  contentType: string;
  ext: string;
}): Promise<string> {
  const bucket = process.env.R2_BUCKET;
  const cdnBase = (process.env.R2_CDN_URL ?? "").replace(/\/$/, "");
  if (!bucket || !cdnBase) {
    throw new Error("R2 env vars required: R2_BUCKET, R2_CDN_URL");
  }
  const key = `glasshive/${randomUUID()}/image${args.ext}`;
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: args.body,
      ContentType: args.contentType,
    })
  );
  return `${cdnBase}/${key}`;
}
