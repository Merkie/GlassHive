import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { ModelMessage } from "ai";
import { Frontpage, type FrontpageSnapshot } from "./frontpage.js";
import { runAgent, type AgentRunResult } from "./agent.js";

export type PublicAgentResult = Omit<AgentRunResult, "messages">;
import type { ActivityEvent, SimulationMode } from "../../shared/contracts.js";
import { sampleProfiles, type Profile } from "./profiles.js";

export const DEFAULT_MODEL_ID = "google/gemini-3.1-flash-lite-preview";

// 'requeue' rotates through participants in order — each agent only
// reappears after the others have had a turn. Reads like real reddit:
// people drop in, post, come back later when something new is on top.
// 'random' picks a participant at random for every open slot — chaotic
// and uneven; loud users may post 5x while others post once.
export type { SimulationMode };

export interface SimulationOptions {
  source: string;
  pool: Profile[];
  apiKey: string;
  agentCount: number;
  // Hard cap on tool-using steps per agent SESSION. In requeue/random
  // modes each agent may be re-spawned many times; this caps each
  // visit, not their lifetime activity.
  maxStepsPerAgent?: number;
  // Wall-clock budget for the whole simulation, in seconds. The
  // simulation runs UNTIL this deadline — agents are re-spawned
  // (per `mode`) until time runs out.
  durationSec?: number;
  mode?: SimulationMode;
  // When true (default), every time an agent is re-spawned it picks
  // up its previous conversation history — including its own past
  // tool calls and replies — so it doesn't repeat itself and can
  // react to what's changed since it logged off. When false, every
  // spawn is a fresh boot from the system prompt: cheaper on input
  // tokens but the agent has no idea what it already said.
  persistentMemory?: boolean;
  modelId?: string;
  onActivity?: (event: ActivityEvent) => void;
  onAgentDone?: (result: PublicAgentResult) => void;
}

export interface SimulationResult {
  source: string;
  participants: Array<{
    username: string;
    name: string;
    occupation: string;
    location: string;
  }>;
  agentResults: PublicAgentResult[];
  snapshot: FrontpageSnapshot;
  // Markdown summary written by the LLM after the simulation finishes.
  // null when there's nothing to summarize (zero posts) or the report
  // call errored out. Set by the HTTP handler, not by runSimulation()
  // itself — this field is undefined on the value runSimulation returns.
  report?: string | null;
  totals: {
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
    posts: number;
    comments: number;
    elapsedMs: number;
  };
}

export async function runSimulation(
  opts: SimulationOptions
): Promise<SimulationResult> {
  const {
    source,
    pool,
    apiKey,
    agentCount,
    maxStepsPerAgent = 12,
    durationSec = 90,
    mode = "requeue",
    persistentMemory = true,
    modelId = DEFAULT_MODEL_ID,
    onActivity,
    onAgentDone,
  } = opts;

  if (!source.trim()) throw new Error("source must not be empty");
  if (!apiKey) throw new Error("apiKey is required");
  if (agentCount < 1) throw new Error("agentCount must be at least 1");
  if (pool.length < agentCount) {
    throw new Error(
      `pool has ${pool.length} profiles but ${agentCount} were requested`
    );
  }

  const openrouter = createOpenRouter({ apiKey });
  const model = openrouter.chat(modelId);

  const fp = new Frontpage();
  const participants = sampleProfiles(pool, agentCount);
  const startedAt = Date.now();
  const deadline = startedAt + durationSec * 1000;
  // 30% of the room is online at once, capped at 10 to keep us under
  // OpenRouter's per-key concurrency limit no matter how big the room is.
  const concurrency = Math.max(1, Math.min(Math.ceil(participants.length * 0.3), 10));

  console.log(
    `▶ simulation start: agents=${participants.length} concurrency=${concurrency} budgetSec=${durationSec} maxStepsPerAgent=${maxStepsPerAgent} mode=${mode} memory=${persistentMemory ? "persistent" : "fresh"}`
  );
  for (const p of participants) {
    console.log(`  · u/${p.username} (${p.name}, ${p.occupation})`);
  }

  const queue: Profile[] = [...participants];
  const results: PublicAgentResult[] = [];
  // Per-username conversation state. Persists across re-spawns when
  // `persistentMemory` is on; ignored when off.
  const memory = new Map<string, ModelMessage[]>();

  // Circuit breaker: if a model errors instantly on every call (e.g. the
  // user picks one that doesn't support tool calling), workers would spin
  // for the whole budget and rack up thousands of failed billed requests.
  // After this many consecutive errors across all workers we abort.
  const MAX_CONSECUTIVE_ERRORS = 5;
  const ERROR_BACKOFF_MS = 1000;
  let consecutiveErrors = 0;
  let aborted = false;
  let abortReason = "";

  // Round-robin queue for requeue mode. The loop never naturally ends —
  // it's the deadline that stops us. If a worker pops an empty queue
  // (transient: another worker is mid-flight and hasn't requeued yet)
  // it yields and retries.
  async function worker() {
    while (Date.now() < deadline && !aborted) {
      let profile: Profile | undefined;
      if (mode === "random") {
        profile = participants[Math.floor(Math.random() * participants.length)];
      } else {
        profile = queue.shift();
        if (!profile) {
          await new Promise((r) => setTimeout(r, 100));
          continue;
        }
      }
      const priorMessages = persistentMemory ? memory.get(profile.username) : undefined;
      const fullResult = await runAgent({
        profile,
        source,
        fp,
        model,
        maxSteps: maxStepsPerAgent,
        deadline,
        onActivity,
        priorMessages,
      });
      if (persistentMemory) memory.set(profile.username, fullResult.messages);
      // Strip the full message log from anything we expose externally —
      // it can be hundreds of KB per agent and clients never need it.
      const { messages: _omit, ...result } = fullResult;
      results.push(result);
      onAgentDone?.(result);
      const status = result.errored ? `ERR ${result.error}` : `${result.steps} steps`;
      console.log(
        `  ← u/${profile.username} done (${status}, $${result.costUsd.toFixed(6)})`
      );
      if (mode === "requeue") queue.push(profile);

      if (result.errored) {
        consecutiveErrors++;
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          aborted = true;
          abortReason = result.error ?? "model errored repeatedly";
          onActivity?.({
            kind: "phase",
            label: `Stopped: ${MAX_CONSECUTIVE_ERRORS} consecutive errors — ${abortReason}`,
            tone: "error",
          });
          break;
        }
        // Back off so a model that fails instantly can't burn the
        // entire budget at zero latency.
        const remainingMs = deadline - Date.now();
        if (remainingMs > 0) {
          await new Promise((r) =>
            setTimeout(r, Math.min(ERROR_BACKOFF_MS, remainingMs))
          );
        }
      } else {
        consecutiveErrors = 0;
      }
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, participants.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  const snapshot = fp.snapshot();
  const totals = {
    costUsd: results.reduce((s, r) => s + r.costUsd, 0),
    inputTokens: results.reduce((s, r) => s + r.tokens.input, 0),
    outputTokens: results.reduce((s, r) => s + r.tokens.output, 0),
    posts: snapshot.posts.length,
    comments: snapshot.posts.reduce((s, p) => s + countComments(p.comments), 0),
    elapsedMs: Date.now() - startedAt,
  };

  console.log(
    `→ simulation done: ${totals.posts} posts, ${totals.comments} comments, $${totals.costUsd.toFixed(4)}, ${totals.elapsedMs}ms`
  );

  return {
    source,
    participants: participants.map((p) => ({
      username: p.username,
      name: p.name,
      occupation: p.occupation,
      location: p.location,
    })),
    agentResults: results,
    snapshot,
    totals,
  };
}

function countComments(nodes: { replies: any[] }[]): number {
  let n = 0;
  for (const node of nodes) n += 1 + countComments(node.replies);
  return n;
}
