import "dotenv/config";
import express from "express";
import cors from "cors";
import { z } from "zod";
import { loadProfiles } from "./profiles.js";
import { runSimulation, getOpenRouter, DEFAULT_MODEL_ID } from "./runSimulation.js";
import { generateReport, type ReportResult } from "./report.js";

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
    const result = await runSimulation({ ...opts, pool: profiles });
    const reportModel = getOpenRouter().chat(DEFAULT_MODEL_ID);
    const report = await generateReport({
      model: reportModel,
      source: opts.source,
      snapshot: result.snapshot,
    });
    res.json({
      ...result,
      report: report.markdown,
      totals: addReportCost(result.totals, report),
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
    const result = await runSimulation({
      ...opts,
      pool: profiles,
      onActivity: (e) => send("activity", e),
      onAgentDone: (r) => send("agent-done", r),
    });
    send("simulation-complete", {
      posts: result.totals.posts,
      comments: result.totals.comments,
    });
    send("report-start", {});
    const reportModel = getOpenRouter().chat(DEFAULT_MODEL_ID);
    const report = await generateReport({
      model: reportModel,
      source: opts.source,
      snapshot: result.snapshot,
    });
    send("report-done", { markdown: report.markdown, error: report.error });
    const finalResult = {
      ...result,
      report: report.markdown,
      totals: addReportCost(result.totals, report),
    };
    send("done", finalResult);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    send("error", { error: msg });
  } finally {
    res.end();
  }
});

const port = Number.parseInt(process.env.PORT || "3811", 10);
app.listen(port, () => {
  console.log(`GlassHive server listening on http://localhost:${port}`);
});
