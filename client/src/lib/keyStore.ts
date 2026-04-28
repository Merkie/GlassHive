const KEY_STORAGE = "glasshive_encrypted_openrouter_key";
const MODE_STORAGE = "glasshive_key_mode";

export type KeyMode = "user" | "admin";

export interface StoredKey {
  encryptedKey: string;
  mode: KeyMode;
}

export function getStoredKey(): StoredKey | null {
  try {
    const encryptedKey = localStorage.getItem(KEY_STORAGE);
    if (!encryptedKey) return null;
    const mode = localStorage.getItem(MODE_STORAGE);
    return {
      encryptedKey,
      mode: mode === "admin" ? "admin" : "user",
    };
  } catch {
    return null;
  }
}

export function setStoredKey(blob: StoredKey): void {
  localStorage.setItem(KEY_STORAGE, blob.encryptedKey);
  localStorage.setItem(MODE_STORAGE, blob.mode);
}

export function clearStoredKey(): void {
  localStorage.removeItem(KEY_STORAGE);
  localStorage.removeItem(MODE_STORAGE);
}
