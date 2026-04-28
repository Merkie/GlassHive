import "dotenv/config";
import express from "express";
import cors from "cors";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { loadProfiles } from "./profiles.js";
import { runSimulation, getOpenRouter, DEFAULT_MODEL_ID } from "./runSimulation.js";
import { generateReport, type ReportResult } from "./report.js";
import type { ActivityEvent } from "./tools.js";
import prisma from "./resources/prisma.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const profiles = loadProfiles();
console.log(`Loaded ${profiles.length} profiles`);

const requestSchema = z.object({
  source: z.string().min(1).max(20000),
  agentCount: z.number().int().min(1).max(50).default(10),
  maxStepsPerAgent: z.number().int().min(1).max(40).default(12),
  durationSec: z.number().int().min(10).max(300).default(30),
  mode: z.enum(["requeue", "random"]).default("requeue"),
  persistentMemory: z.boolean().default(true),
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    profiles: profiles.length,
    sampleUsernames: profiles.slice(0, 5).map((p) => p.username),
  });
});

app.get("/api/profiles", (_req, res) => {
  res.json({
    total: profiles.length,
    profiles: profiles.map((p) => ({
      id: p.id,
      username: p.username,
      name: p.name,
      age: p.age,
      occupation: p.occupation,
      location: p.location,
    })),
  });
});

app.post("/api/run", async (req, res) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "invalid request", detail: parsed.error.issues });
  }
  const opts = parsed.data;
  console.log(
    `▶ /api/run: agents=${opts.agentCount} duration=${opts.durationSec}s mode=${opts.mode} source="${opts.source.slice(0, 80).replace(/\s+/g, " ")}…"`
  );
  try {
    const activity: ActivityEvent[] = [
      { kind: "phase", label: "Starting simulation…", tone: "start" },
    ];
    const result = await runSimulation({
      ...opts,
      pool: profiles,
      onActivity: (e) => activity.push(e),
    });
    activity.push({
      kind: "phase",
      label: `Simulation complete — ${result.totals.posts} posts, ${result.totals.comments} comments`,
      tone: "success",
    });
    activity.push({ kind: "phase", label: "Writing report…", tone: "info" });
    const reportModel = getOpenRouter().chat(DEFAULT_MODEL_ID);
    const report = await generateReport({
      model: reportModel,
      source: opts.source,
      snapshot: result.snapshot,
    });
    activity.push({
      kind: "phase",
      label: report.markdown
        ? "Report ready"
        : `Report skipped${report.error ? `: ${report.error}` : ""}`,
      tone: report.markdown ? "success" : "info",
    });
    const finalTotals = addReportCost(result.totals, report);
    const id = await persistRun({
      opts,
      result,
      activity,
      reportMarkdown: report.markdown,
      totals: finalTotals,
    });
    res.json({
      id,
      ...result,
      report: report.markdown,
      totals: finalTotals,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("simulation failed:", msg);
    res.status(500).json({ error: msg });
  }
});

function addReportCost(
  totals: { costUsd: number; inputTokens: number; outputTokens: number; posts: number; comments: number; elapsedMs: number },
  report: ReportResult
) {
  return {
    ...totals,
    costUsd: totals.costUsd + report.costUsd,
    inputTokens: totals.inputTokens + report.tokens.input,
    outputTokens: totals.outputTokens + report.tokens.output,
  };
}

async function persistRun(args: {
  opts: z.infer<typeof requestSchema>;
  result: Awaited<ReturnType<typeof runSimulation>>;
  activity: ActivityEvent[];
  reportMarkdown: string | null;
  totals: ReturnType<typeof addReportCost>;
}): Promise<string> {
  const id = randomUUID();
  await prisma.run.create({
    data: {
      id,
      source: args.opts.source,
      agentCount: args.opts.agentCount,
      maxStepsPerAgent: args.opts.maxStepsPerAgent,
      durationSec: args.opts.durationSec,
      mode: args.opts.mode,
      persistentMemory: args.opts.persistentMemory,
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

// Streaming variant: emit each ActivityEvent + final result as a Server-Sent
// Events stream so the client can render comments arriving live.
app.post("/api/run-stream", async (req, res) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "invalid request", detail: parsed.error.issues });
  }
  const opts = parsed.data;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  send("start", { agentCount: opts.agentCount });
  try {
    const activity: ActivityEvent[] = [
      { kind: "phase", label: "Starting simulation…", tone: "start" },
    ];
    const result = await runSimulation({
      ...opts,
      pool: profiles,
      onActivity: (e) => {
        activity.push(e);
        send("activity", e);
      },
      onAgentDone: (r) => send("agent-done", r),
    });
    send("simulation-complete", {
      posts: result.totals.posts,
      comments: result.totals.comments,
    });
    activity.push({
      kind: "phase",
      label: `Simulation complete — ${result.totals.posts} posts, ${result.totals.comments} comments`,
      tone: "success",
    });
    send("report-start", {});
    activity.push({ kind: "phase", label: "Writing report…", tone: "info" });
    const reportModel = getOpenRouter().chat(DEFAULT_MODEL_ID);
    const report = await generateReport({
      model: reportModel,
      source: opts.source,
      snapshot: result.snapshot,
    });
    send("report-done", { markdown: report.markdown, error: report.error });
    activity.push({
      kind: "phase",
      label: report.markdown
        ? "Report ready"
        : `Report skipped${report.error ? `: ${report.error}` : ""}`,
      tone: report.markdown ? "success" : "info",
    });
    const finalTotals = addReportCost(result.totals, report);
    const id = await persistRun({
      opts,
      result,
      activity,
      reportMarkdown: report.markdown,
      totals: finalTotals,
    });
    send("saved", { id });
    const finalResult = {
      id,
      ...result,
      report: report.markdown,
      totals: finalTotals,
    };
    send("done", finalResult);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    send("error", { error: msg });
  } finally {
    res.end();
  }
});

app.get("/api/runs/:id", async (req, res) => {
  const id = req.params.id;
  if (!id || typeof id !== "string") {
    return res.status(400).json({ error: "invalid id" });
  }
  try {
    const row = await prisma.run.findUnique({ where: { id } });
    if (!row) return res.status(404).json({ error: "run not found" });
    res.json({
      id: row.id,
      source: row.source,
      settings: {
        agentCount: row.agentCount,
        maxStepsPerAgent: row.maxStepsPerAgent,
        durationSec: row.durationSec,
        mode: row.mode,
        persistentMemory: row.persistentMemory,
      },
      participants: JSON.parse(row.participants),
      agentResults: JSON.parse(row.agentResults),
      snapshot: JSON.parse(row.snapshot),
      activity: JSON.parse(row.activity),
      report: row.report,
      totals: JSON.parse(row.totals),
      createdAt: row.createdAt.toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`GET /api/runs/${id} failed:`, msg);
    res.status(500).json({ error: msg });
  }
});

const port = Number.parseInt(process.env.PORT || "3811", 10);
app.listen(port, () => {
  console.log(`GlassHive server listening on http://localhost:${port}`);
});
