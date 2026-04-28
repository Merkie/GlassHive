import { describe, it, expect } from "vitest";
import {
  encryptedKeySchema,
  ENCRYPTED_KEY_MIN,
  ENCRYPTED_KEY_MAX,
} from "../src/runRequestSchema.js";

const hex = (n: number) => "a".repeat(n);

describe("encryptedKeySchema", () => {
  it("accepts a well-formed hex blob at the minimum length", () => {
    expect(encryptedKeySchema.safeParse(hex(ENCRYPTED_KEY_MIN)).success).toBe(true);
  });

  it("accepts a typical-length blob (admin password sized plaintext)", () => {
    // (96 prefix + ~16 plaintext) * 2 = 224 hex chars
    expect(encryptedKeySchema.safeParse(hex(224)).success).toBe(true);
  });

  it("accepts a blob at the maximum length", () => {
    expect(encryptedKeySchema.safeParse(hex(ENCRYPTED_KEY_MAX)).success).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(encryptedKeySchema.safeParse("").success).toBe(false);
  });

  it("rejects a blob shorter than the cryptr prefix", () => {
    expect(encryptedKeySchema.safeParse(hex(ENCRYPTED_KEY_MIN - 2)).success).toBe(false);
  });

  it("rejects an oversized blob", () => {
    expect(encryptedKeySchema.safeParse(hex(ENCRYPTED_KEY_MAX + 2)).success).toBe(false);
  });

  it("rejects non-hex characters", () => {
    const bad = "z".repeat(ENCRYPTED_KEY_MIN);
    expect(encryptedKeySchema.safeParse(bad).success).toBe(false);
  });

  it("rejects uppercase hex (cryptr emits lowercase)", () => {
    const bad = "A".repeat(ENCRYPTED_KEY_MIN);
    expect(encryptedKeySchema.safeParse(bad).success).toBe(false);
  });

  it("rejects mixed-content payloads with non-hex injected", () => {
    const bad = hex(ENCRYPTED_KEY_MIN - 4) + "<xss>";
    expect(encryptedKeySchema.safeParse(bad).success).toBe(false);
  });

  it("rejects odd-length hex", () => {
    expect(encryptedKeySchema.safeParse(hex(ENCRYPTED_KEY_MIN + 1)).success).toBe(false);
  });

  it("accepts a real cryptr-shaped blob", async () => {
    process.env.MASTER_ENCRYPTION_KEY ??= "x".repeat(32);
    const { default: cryptr } = await import("../src/resources/cryptr.js");
    const blob = cryptr.encrypt("sk-or-v1-test-key");
    expect(encryptedKeySchema.safeParse(blob).success).toBe(true);
  });

  it("rejects a tampered blob with non-hex content", async () => {
    process.env.MASTER_ENCRYPTION_KEY ??= "x".repeat(32);
    const { default: cryptr } = await import("../src/resources/cryptr.js");
    const blob = cryptr.encrypt("sk-or-v1-test-key");
    const tampered = blob.slice(0, -2) + "ZZ";
    expect(encryptedKeySchema.safeParse(tampered).success).toBe(false);
  });
});
