import { randomUUID } from "node:crypto";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  runSimulation,
  DEFAULT_MODEL_ID,
  type PublicAgentResult,
  type SimulationResult,
} from "./runSimulation.js";
import { generateReport, type ReportResult } from "./report.js";
import { generateProfiles, toGeneratedProfile } from "./generateProfiles.js";
import type { ActivityEvent, GeneratedProfile, SimulationMode } from "../../shared/contracts.js";
import type { Profile } from "./profiles.js";
import prisma from "./resources/prisma.js";

export interface PipelineRequest {
  source: string;
  // CDN URLs of any photos attached to the source. Each will be passed to
  // every agent as part of their first user message; persisted on the Run row.
  imageUrls: string[];
  agentCount: number;
  maxStepsPerAgent: number;
  durationSec: number;
  mode: SimulationMode;
  persistentMemory: boolean;
  tailoredAgents: boolean;
  modelId?: string;
  reportModelId?: string;
}

export interface PipelineCallbacks {
  // Forwarded from runSimulation — every state-changing tool call plus the
  // abort-circuit "Stopped" phase. The synthesized lifecycle phases
  // (Starting / Generating agents / Simulation complete / Writing report /
  // Report ready) are recorded into the persisted activity log but NOT sent
  // here, since the SSE route delivers them via dedicated event types.
  onActivity?: (event: ActivityEvent) => void;
  onAgentDone?: (result: PublicAgentResult) => void;
  onAgentsGenerationStart?: (info: { count: number }) => void;
  onAgentsGenerationDone?: (info: { count: number }) => void;
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
  generatedProfiles: GeneratedProfile[] | null;
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

function addExtraCost(
  totals: Totals,
  extra: { costUsd: number; tokens: { input: number; output: number } }
): Totals {
  return {
    ...totals,
    costUsd: totals.costUsd + extra.costUsd,
    inputTokens: totals.inputTokens + extra.tokens.input,
    outputTokens: totals.outputTokens + extra.tokens.output,
  };
}

async function persistRun(args: {
  request: PipelineRequest;
  result: SimulationResult;
  activity: ActivityEvent[];
  reportMarkdown: string | null;
  generatedProfiles: GeneratedProfile[] | null;
  totals: Totals;
}): Promise<string> {
  const id = randomUUID();
  await prisma.run.create({
    data: {
      id,
      source: args.request.source,
      imageUrls: JSON.stringify(args.request.imageUrls),
      agentCount: args.request.agentCount,
      maxStepsPerAgent: args.request.maxStepsPerAgent,
      durationSec: args.request.durationSec,
      mode: args.request.mode,
      persistentMemory: args.request.persistentMemory,
      tailoredAgents: args.request.tailoredAgents,
      participants: JSON.stringify(args.result.participants),
      agentResults: JSON.stringify(args.result.agentResults),
      snapshot: JSON.stringify(args.result.snapshot),
      activity: JSON.stringify(args.activity),
      report: args.reportMarkdown,
      totals: JSON.stringify(args.totals),
      generatedProfiles: args.generatedProfiles ? JSON.stringify(args.generatedProfiles) : null,
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
    onAgentsGenerationStart,
    onAgentsGenerationDone,
    onSimulationComplete,
    onReportStart,
    onReportDone,
    onSaved,
  } = opts;

  const activity: ActivityEvent[] = [
    { kind: "phase", label: "Starting simulation…", tone: "start" },
  ];

  // Tailored-agents path: generate the room from the source material before
  // the simulation starts, using the same model the agents will roleplay on.
  // Cost/tokens fold into the run's totals; the bios persist on the Run row
  // so /v/:id can show "who is u/marcus_chen". Generation failure aborts the
  // run — there's no silent fallback to disk profiles, since the user
  // explicitly opted into the tailored path.
  let participants: Profile[] | undefined;
  let generatedProfiles: GeneratedProfile[] | null = null;
  let generationCost: { costUsd: number; tokens: { input: number; output: number } } = {
    costUsd: 0,
    tokens: { input: 0, output: 0 },
  };
  if (request.tailoredAgents) {
    onAgentsGenerationStart?.({ count: request.agentCount });
    activity.push({
      kind: "phase",
      label: `Generating ${request.agentCount} tailored agents…`,
      tone: "info",
    });

    const agentModel = createOpenRouter({ apiKey }).chat(request.modelId ?? DEFAULT_MODEL_ID);
    const gen = await generateProfiles({
      model: agentModel,
      source: request.source,
      imageUrls: request.imageUrls,
      count: request.agentCount,
    });
    participants = gen.profiles;
    generatedProfiles = gen.profiles.map(toGeneratedProfile);
    generationCost = { costUsd: gen.costUsd, tokens: gen.tokens };

    onAgentsGenerationDone?.({ count: gen.profiles.length });
    activity.push({
      kind: "phase",
      label: `Generated ${gen.profiles.length} tailored agents`,
      tone: "success",
    });
  }

  const result = await runSimulation({
    source: request.source,
    imageUrls: request.imageUrls,
    pool: profiles,
    participants,
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
    request.reportModelId ?? DEFAULT_MODEL_ID
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

  const finalTotals = addExtraCost(addReportCost(result.totals, report), generationCost);
  const id = await persistRun({
    request,
    result,
    activity,
    reportMarkdown: report.markdown,
    generatedProfiles,
    totals: finalTotals,
  });

  onSaved?.({ id });

  return {
    id,
    ...result,
    imageUrls: request.imageUrls,
    report: report.markdown,
    generatedProfiles,
    totals: finalTotals,
  };
}
