// Single source of truth for everything that crosses the wire between the
// GlassHive server and client: response shapes, the activity event union,
// and the run-stream event map. No runtime deps so importing this module
// from the client doesn't pull zod or anything else into the browser bundle.

// ====== Frontpage primitives ======

export type Post = {
  id: string;
  authorUsername: string;
  title: string;
  body: string;
  createdAt: number;
};

export type CommentNode = {
  id: string;
  authorUsername: string;
  body: string;
  createdAt: number;
  parentId: string;
  karma: number;
  upvotes: number;
  downvotes: number;
  replies: CommentNode[];
};

export type Snapshot = {
  posts: Array<{
    post: Post;
    karma: number;
    upvotes: number;
    downvotes: number;
    comments: CommentNode[];
  }>;
  exportedAt: number;
};

// ====== Activity events ======

export type VoteResult = "set" | "cleared" | "switched";

export type ActivityEvent =
  | { kind: "post-created"; postId: string; username: string; title: string }
  | {
      kind: "comment-created";
      commentId: string;
      postId: string;
      parentId: string;
      username: string;
      body: string;
    }
  | {
      kind: "vote";
      entityId: string;
      username: string;
      type: "up" | "down";
      result: VoteResult;
    }
  | { kind: "tool-error"; tool: string; username: string; error: string }
  | { kind: "phase"; label: string; tone: "info" | "success" | "start" | "error" };

// ====== Simulation result shapes ======

export type Participant = {
  username: string;
  name: string;
  occupation: string;
  location: string;
};

export type AgentResult = {
  username: string;
  steps: number;
  finishReason: string | null;
  costUsd: number;
  tokens: { input: number; output: number };
  errored: boolean;
  error?: string;
};

export type Totals = {
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  posts: number;
  comments: number;
  elapsedMs: number;
};

export type SimulationResult = {
  id?: string;
  source: string;
  participants: Participant[];
  agentResults: AgentResult[];
  snapshot: Snapshot;
  report?: string | null;
  totals: Totals;
};

// ====== Run record (GET /api/runs/:id) ======

export type SimulationMode = "requeue" | "random";

export type RunSettings = {
  agentCount: number;
  maxStepsPerAgent: number;
  durationSec: number;
  mode: SimulationMode;
  persistentMemory: boolean;
};

export type RunRecord = {
  id: string;
  source: string;
  settings: RunSettings;
  participants: Participant[];
  agentResults: AgentResult[];
  snapshot: Snapshot;
  activity: ActivityEvent[];
  report: string | null;
  totals: Totals;
  createdAt: string;
};

// ====== Run-stream events ======

// One event-name → payload map that both the server emitter and the client
// parser switch over. Adding a new event is a compile error on either side
// until both ends are updated, which is the whole point of the contract.
export type RunStreamEventMap = {
  start: { agentCount: number };
  activity: ActivityEvent;
  "agent-done": AgentResult;
  "simulation-complete": { posts: number; comments: number };
  "report-start": Record<string, never>;
  "report-done": { markdown: string | null; error?: string };
  saved: { id: string };
  done: SimulationResult;
  error: { error: string };
};

export type RunStreamEventName = keyof RunStreamEventMap;

export type RunStreamEvent = {
  [K in RunStreamEventName]: { name: K; data: RunStreamEventMap[K] };
}[RunStreamEventName];

export const RUN_STREAM_EVENT_NAMES = [
  "start",
  "activity",
  "agent-done",
  "simulation-complete",
  "report-start",
  "report-done",
  "saved",
  "done",
  "error",
] as const satisfies ReadonlyArray<RunStreamEventName>;

export function isRunStreamEventName(name: string): name is RunStreamEventName {
  return (RUN_STREAM_EVENT_NAMES as ReadonlyArray<string>).includes(name);
}
