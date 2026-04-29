import sharp from "sharp";

export const VLM_MAX_SIDE = 500;

export interface VlmImage {
  buffer: Buffer;
  mimeType: "image/webp";
}

// Shrink an image to the canonical size every VLM call expects: contained to a
// 500×500 box, aspect preserved, never upscaled, EXIF orientation baked into
// pixels, re-encoded as WebP. WebP keeps photographic content compact and
// preserves alpha (so transparent PNGs don't get flattened against black).
export async function downscaleForVlm(input: Buffer): Promise<VlmImage> {
  const buffer = await sharp(input)
    .rotate()
    .resize({
      width: VLM_MAX_SIDE,
      height: VLM_MAX_SIDE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 85 })
    .toBuffer();
  return { buffer, mimeType: "image/webp" };
}
