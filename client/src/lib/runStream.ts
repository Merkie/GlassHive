import type { Activity, AgentResult, SimulationResult } from "../types";

export type RunStreamInput = {
  source: string;
  encryptedKey: string;
  agentCount: number;
  maxStepsPerAgent: number;
  durationSec: number;
  mode: "requeue" | "random";
  persistentMemory: boolean;
  modelId?: string | null;
};

export type RunStreamEvent =
  | { name: "start"; data: { agentCount: number } }
  | { name: "activity"; data: Activity }
  | { name: "agent-done"; data: AgentResult }
  | { name: "simulation-complete"; data: { posts: number; comments: number } }
  | { name: "report-start"; data: Record<string, unknown> }
  | { name: "report-done"; data: { markdown: string | null; error?: string } }
  | { name: "saved"; data: { id: string } }
  | { name: "done"; data: SimulationResult }
  | { name: "error"; data: { error: string } };

export class RunStreamUnauthorizedError extends Error {
  constructor() {
    super("Saved key was rejected — re-enter your OpenRouter key.");
    this.name = "RunStreamUnauthorizedError";
  }
}

export class RunStreamHttpError extends Error {
  status: number;
  constructor(status: number, body: string) {
    super(`${status}: ${body}`);
    this.name = "RunStreamHttpError";
    this.status = status;
  }
}

function parseChunk(chunk: string): RunStreamEvent | null {
  const eventLine = chunk.match(/^event:\s*(.*)$/m);
  const dataLine = chunk.match(/^data:\s*(.*)$/m);
  if (!eventLine || !dataLine) return null;
  const name = eventLine[1].trim();
  let data: unknown;
  try {
    data = JSON.parse(dataLine[1]);
  } catch {
    return null;
  }
  switch (name) {
    case "start":
    case "activity":
    case "agent-done":
    case "simulation-complete":
    case "report-start":
    case "report-done":
    case "saved":
    case "done":
    case "error":
      return { name, data } as RunStreamEvent;
    default:
      return null;
  }
}

export async function* openRunStream(
  input: RunStreamInput,
): AsyncGenerator<RunStreamEvent> {
  const res = await fetch("/api/run-stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: input.source,
      encryptedKey: input.encryptedKey,
      agentCount: input.agentCount,
      maxStepsPerAgent: input.maxStepsPerAgent,
      durationSec: input.durationSec,
      mode: input.mode,
      persistentMemory: input.persistentMemory,
      ...(input.modelId ? { modelId: input.modelId } : {}),
    }),
  });
  if (res.status === 401) throw new RunStreamUnauthorizedError();
  if (!res.ok || !res.body) {
    const body = await res.text();
    throw new RunStreamHttpError(res.status, body);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const event = parseChunk(chunk);
      if (event) yield event;
    }
  }
}
