// Uploads a single image to /api/upload-image. The server downscales to a
// 500px webp and parks it on R2; what comes back is a public CDN URL we hand
// to the run pipeline. Auth is the same encrypted-key blob the run endpoints
// use, passed in a header so the request body stays raw image bytes.

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];
const MAX_BYTES = 25 * 1024 * 1024;

export class UploadError extends Error {}

export async function uploadImage(file: File, encryptedKey: string): Promise<string> {
  if (file.size === 0) throw new UploadError("File is empty");
  if (file.size > MAX_BYTES) throw new UploadError("File is larger than 25 MB");
  if (!file.type.startsWith("image/")) throw new UploadError("Not an image");
  if (!ACCEPTED.includes(file.type)) {
    throw new UploadError(`Unsupported image type: ${file.type}`);
  }

  const res = await fetch("/api/upload-image", {
    method: "POST",
    headers: {
      "Content-Type": file.type,
      "X-Encrypted-Key": encryptedKey,
    },
    body: file,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let msg = body;
    try {
      msg = JSON.parse(body).error ?? body;
    } catch {
      // body is not JSON; use raw text
    }
    throw new UploadError(msg || `Upload failed (${res.status})`);
  }

  const { url } = (await res.json()) as { url: string };
  return url;
}
