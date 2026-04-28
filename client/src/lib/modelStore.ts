const KEY = "glasshive_selected_model";

export const DEFAULT_MODEL_ID = "google/gemini-3.1-flash-lite-preview";

export function getStoredModel(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setStoredModel(id: string | null): void {
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    // ignore — private mode / quota etc.
  }
}
