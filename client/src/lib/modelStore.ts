const AGENT_KEY = "glasshive_selected_model";
const REPORT_KEY = "glasshive_report_model";

export const DEFAULT_MODEL_ID = "google/gemini-3.1-flash-lite-preview";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, id: string | null): void {
  try {
    if (id) localStorage.setItem(key, id);
    else localStorage.removeItem(key);
  } catch {
    // ignore — private mode / quota etc.
  }
}

export function getStoredAgentModel(): string | null {
  return read(AGENT_KEY);
}

export function setStoredAgentModel(id: string | null): void {
  write(AGENT_KEY, id);
}

export function getStoredReportModel(): string | null {
  return read(REPORT_KEY);
}

export function setStoredReportModel(id: string | null): void {
  write(REPORT_KEY, id);
}
