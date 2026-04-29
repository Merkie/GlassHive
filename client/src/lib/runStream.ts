import {
  isRunStreamEventName,
  type RunStreamEvent,
  type RunStreamEventMap,
} from "../../../shared/contracts";

export type RunStreamInput = {
  source: string;
  encryptedKey: string;
  imageUrls: string[];
  agentCount: number;
  maxStepsPerAgent: number;
  durationSec: number;
  mode: "requeue" | "random";
  persistentMemory: boolean;
  tailoredAgents: boolean;
  modelId?: string | null;
  reportModelId?: string | null;
};

export type { RunStreamEvent, RunStreamEventMap };

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
  if (!isRunStreamEventName(name)) return null;
  let data: unknown;
  try {
    data = JSON.parse(dataLine[1]);
  } catch {
    return null;
  }
  // The server emits payloads matching RunStreamEventMap[name]; we trust the
  // contract here rather than re-validating each shape on the client.
  return { name, data } as RunStreamEvent;
}

export async function* openRunStream(input: RunStreamInput): AsyncGenerator<RunStreamEvent> {
  const res = await fetch("/api/run-stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: input.source,
      encryptedKey: input.encryptedKey,
      imageUrls: input.imageUrls,
      agentCount: input.agentCount,
      maxStepsPerAgent: input.maxStepsPerAgent,
      durationSec: input.durationSec,
      mode: input.mode,
      persistentMemory: input.persistentMemory,
      tailoredAgents: input.tailoredAgents,
      ...(input.modelId ? { modelId: input.modelId } : {}),
      ...(input.reportModelId ? { reportModelId: input.reportModelId } : {}),
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
