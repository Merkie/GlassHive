import { z } from "zod";

// cryptr v6 emits hex(salt[64] + iv[16] + tag[16] + ciphertext[N]) — 96 prefix
// bytes (192 hex chars) before any payload. Encrypt-key plaintext is capped at
// 256 chars, so the longest legitimate blob is (96 + 256) * 2 = 704 hex chars.
// 1024 leaves headroom without inviting oversized payloads into decryption.
export const ENCRYPTED_KEY_MIN = 192;
export const ENCRYPTED_KEY_MAX = 1024;

export const encryptedKeySchema = z
  .string()
  .min(ENCRYPTED_KEY_MIN)
  .max(ENCRYPTED_KEY_MAX)
  .regex(/^[0-9a-f]+$/, "must be lowercase hex")
  .refine((s) => s.length % 2 === 0, "must be even-length hex");

export const runRequestSchema = z.object({
  source: z.string().min(1).max(20000),
  encryptedKey: encryptedKeySchema,
  // CDN-hosted URLs returned by /api/upload-image. The server already
  // downscaled and re-encoded these to webp; agents receive them by URL.
  imageUrls: z.array(z.url().max(500)).max(8).default([]),
  agentCount: z.number().int().min(1).max(50).default(10),
  maxStepsPerAgent: z.number().int().min(1).max(40).default(12),
  durationSec: z.number().int().min(10).max(300).default(30),
  mode: z.enum(["requeue", "random"]).default("requeue"),
  persistentMemory: z.boolean().default(true),
  tailoredAgents: z.boolean().default(false),
  modelId: z.string().min(1).max(200).optional(),
  reportModelId: z.string().min(1).max(200).optional(),
});

export type RunRequest = z.infer<typeof runRequestSchema>;
