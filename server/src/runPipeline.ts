import { randomUUID } from "node:crypto";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  runSimulation,
  DEFAULT_MODEL_ID,
  type PublicAgentResult,
  type SimulationResult,
} from "./runSimulation.js";
import { generateReport, type ReportResult } from "./report.js";
import type { ActivityEvent, SimulationMode } from "../../shared/contracts.js";
import type { Profile } from "./profiles.js";
import prisma from "./resources/prisma.js";

export interface PipelineRequest {
  source: string;
  agentCount: number;
  maxStepsPerAgent: number;
  durationSec: number;
  mode: SimulationMode;
  persistentMemory: boolean;
  modelId?: string;
}

export interface PipelineCallbacks {
  // Forwarded from runSimulation — every state-changing tool call plus the
  // abort-circuit "Stopped" phase. The synthesized lifecycle phases
  // (Starting / Simulation complete / Writing report / Report ready) are
  // recorded into the persisted activity log but NOT sent here, since the
  // SSE route delivers them via dedicated event types.
  onActivity?: (event: ActivityEvent) => void;
  onAgentDone?: (result: PublicAgentResult) => void;
  onSimulationComplete?: (info: { posts: number; comments: number }) => void;
  onReportStart?: () => void;
  onReportDone?: (info: { markdown: string | null; error?: string }) => void;
  onSaved?: (info: { id: string }) => void;
}

export interface PipelineOptions extends PipelineCallbacks {
  request: PipelineRequest;
  profiles: Profile[];
  apiKey: string;
}

type Totals = SimulationResult["totals"];

export interface PipelineResult extends Omit<SimulationResult, "totals"> {
  id: string;
  report: string | null;
  totals: Totals;
}

function addReportCost(totals: Totals, report: ReportResult): Totals {
  return {
    ...totals,
    costUsd: totals.costUsd + report.costUsd,
    inputTokens: totals.inputTokens + report.tokens.input,
    outputTokens: totals.outputTokens + report.tokens.output,
  };
}

async function persistRun(args: {
  request: PipelineRequest;
  result: SimulationResult;
  activity: ActivityEvent[];
  reportMarkdown: string | null;
  totals: Totals;
}): Promise<string> {
  const id = randomUUID();
  await prisma.run.create({
    data: {
      id,
      source: args.request.source,
      agentCount: args.request.agentCount,
      maxStepsPerAgent: args.request.maxStepsPerAgent,
      durationSec: args.request.durationSec,
      mode: args.request.mode,
      persistentMemory: args.request.persistentMemory,
      participants: JSON.stringify(args.result.participants),
      agentResults: JSON.stringify(args.result.agentResults),
      snapshot: JSON.stringify(args.result.snapshot),
      activity: JSON.stringify(args.activity),
      report: args.reportMarkdown,
      totals: JSON.stringify(args.totals),
    },
  });
  return id;
}

// The shared run/report/persist flow. Both /api/run and /api/run-stream
// call this — the streaming route wires up the callbacks to translate
// each phase into SSE events, while the JSON route omits them and just
// awaits the final result.
export async function runPipeline(opts: PipelineOptions): Promise<PipelineResult> {
  const {
    request,
    profiles,
    apiKey,
    onActivity,
    onAgentDone,
    onSimulationComplete,
    onReportStart,
    onReportDone,
    onSaved,
  } = opts;

  const activity: ActivityEvent[] = [
    { kind: "phase", label: "Starting simulation…", tone: "start" },
  ];

  const result = await runSimulation({
    source: request.source,
    pool: profiles,
    apiKey,
    agentCount: request.agentCount,
    maxStepsPerAgent: request.maxStepsPerAgent,
    durationSec: request.durationSec,
    mode: request.mode,
    persistentMemory: request.persistentMemory,
    modelId: request.modelId,
    onActivity: (e) => {
      activity.push(e);
      onActivity?.(e);
    },
    onAgentDone: (r) => onAgentDone?.(r),
  });

  onSimulationComplete?.({
    posts: result.totals.posts,
    comments: result.totals.comments,
  });
  activity.push({
    kind: "phase",
    label: `Simulation complete — ${result.totals.posts} posts, ${result.totals.comments} comments`,
    tone: "success",
  });

  onReportStart?.();
  activity.push({ kind: "phase", label: "Writing report…", tone: "info" });

  const reportModel = createOpenRouter({ apiKey }).chat(
    request.modelId ?? DEFAULT_MODEL_ID
  );
  const report = await generateReport({
    model: reportModel,
    source: request.source,
    snapshot: result.snapshot,
  });

  onReportDone?.({ markdown: report.markdown, error: report.error });
  activity.push({
    kind: "phase",
    label: report.markdown
      ? "Report ready"
      : `Report skipped${report.error ? `: ${report.error}` : ""}`,
    tone: report.markdown ? "success" : "info",
  });

  const finalTotals = addReportCost(result.totals, report);
  const id = await persistRun({
    request,
    result,
    activity,
    reportMarkdown: report.markdown,
    totals: finalTotals,
  });

  onSaved?.({ id });

  return {
    id,
    ...result,
    report: report.markdown,
    totals: finalTotals,
  };
}
