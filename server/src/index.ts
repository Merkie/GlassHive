import "dotenv/config";
import express from "express";
import cors from "cors";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { loadProfiles } from "./profiles.js";
import { runSimulation, DEFAULT_MODEL_ID } from "./runSimulation.js";
import { generateReport, type ReportResult } from "./report.js";
import type { ActivityEvent } from "./tools.js";
import prisma from "./resources/prisma.js";
import cryptr from "./resources/cryptr.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const profiles = loadProfiles();
console.log(`Loaded ${profiles.length} profiles`);

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  throw new Error("ADMIN_PASSWORD environment variable is required");
}
if (!process.env.OPENROUTER_API_KEY) {
  throw new Error("OPENROUTER_API_KEY environment variable is required");
}

const requestSchema = z.object({
  source: z.string().min(1).max(20000),
  encryptedKey: z.string().min(1),
  agentCount: z.number().int().min(1).max(50).default(10),
  maxStepsPerAgent: z.number().int().min(1).max(40).default(12),
  durationSec: z.number().int().min(10).max(300).default(30),
  mode: z.enum(["requeue", "random"]).default("requeue"),
  persistentMemory: z.boolean().default(true),
});

const encryptKeySchema = z.object({
  key: z.string().min(1).max(256),
});

// Resolves the encrypted localStorage blob into a real OpenRouter key.
// Throws ResolveKeyError on tampered ciphertext so callers can return 401.
class ResolveKeyError extends Error {}

function resolveApiKey(encryptedKey: string): { apiKey: string; mode: "user" | "admin" } {
  let plaintext: string;
  try {
    plaintext = cryptr.decrypt(encryptedKey);
  } catch {
    throw new ResolveKeyError("stored key is invalid — please re-enter");
  }
  if (plaintext === ADMIN_PASSWORD) {
    return { apiKey: process.env.OPENROUTER_API_KEY!, mode: "admin" };
  }
  return { apiKey: plaintext, mode: "user" };
}

async function validateOpenRouterKey(apiKey: string): Promise<boolean> {
  try {
    const r = await fetch("https://openrouter.ai/api/v1/auth/key", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    return r.ok;
  } catch {
    return false;
  }
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    profiles: profiles.length,
    sampleUsernames: profiles.slice(0, 5).map((p) => p.username),
  });
});

app.post("/api/encrypt-key", async (req, res) => {
  const parsed = encryptKeySchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "invalid request", detail: parsed.error.issues });
  }
  const { key } = parsed.data;
  const isAdmin = key === ADMIN_PASSWORD;
  if (!isAdmin) {
    const ok = await validateOpenRouterKey(key);
    if (!ok) return res.status(400).json({ error: "invalid OpenRouter key" });
  }
  const encryptedKey = cryptr.encrypt(key);
  res.json({ encryptedKey, mode: isAdmin ? "admin" : "user" });
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
  let resolved: { apiKey: string; mode: "user" | "admin" };
  try {
    resolved = resolveApiKey(opts.encryptedKey);
  } catch (err) {
    if (err instanceof ResolveKeyError) {
      return res.status(401).json({ error: err.message });
    }
    throw err;
  }
  console.log(
    `▶ /api/run [${resolved.mode}]: agents=${opts.agentCount} duration=${opts.durationSec}s mode=${opts.mode} source="${opts.source.slice(0, 80).replace(/\s+/g, " ")}…"`
  );
  try {
    const activity: ActivityEvent[] = [
      { kind: "phase", label: "Starting simulation…", tone: "start" },
    ];
    const result = await runSimulation({
      ...opts,
      pool: profiles,
      apiKey: resolved.apiKey,
      onActivity: (e) => activity.push(e),
    });
    activity.push({
      kind: "phase",
      label: `Simulation complete — ${result.totals.posts} posts, ${result.totals.comments} comments`,
      tone: "success",
    });
    activity.push({ kind: "phase", label: "Writing report…", tone: "info" });
    const reportModel = createOpenRouter({ apiKey: resolved.apiKey }).chat(DEFAULT_MODEL_ID);
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
  let resolved: { apiKey: string; mode: "user" | "admin" };
  try {
    resolved = resolveApiKey(opts.encryptedKey);
  } catch (err) {
    if (err instanceof ResolveKeyError) {
      return res.status(401).json({ error: err.message });
    }
    throw err;
  }
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
      apiKey: resolved.apiKey,
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
    const reportModel = createOpenRouter({ apiKey: resolved.apiKey }).chat(DEFAULT_MODEL_ID);
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
