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
