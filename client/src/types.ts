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

export type Activity =
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
      result: string;
    }
  | { kind: "tool-error"; tool: string; username: string; error: string }
  | { kind: "phase"; label: string; tone: "info" | "success" | "start" | "error" };

export type RunRecord = {
  id: string;
  source: string;
  settings: {
    agentCount: number;
    maxStepsPerAgent: number;
    durationSec: number;
    mode: "requeue" | "random";
    persistentMemory: boolean;
  };
  participants: Participant[];
  agentResults: AgentResult[];
  snapshot: Snapshot;
  activity: Activity[];
  report: string | null;
  totals: Totals;
  createdAt: string;
};
