import "dotenv/config";
import express from "express";
import type { Response } from "express";
import cors from "cors";
import { z } from "zod";
import { loadProfiles } from "./profiles.js";
import { runPipeline } from "./runPipeline.js";
import prisma from "./resources/prisma.js";
import cryptr from "./resources/cryptr.js";
import { runRequestSchema } from "./runRequestSchema.js";
import type {
  RunRecord,
  RunStreamEventMap,
  RunStreamEventName,
} from "../../shared/contracts.js";
import {
  searchOpenRouterModels,
  trimModelForClient,
} from "./openrouter-models.js";

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

// Typed wrapper around `res.write` so adding an event in the contract is a
// compile error here until the emit site is updated.
function makeSseSender(res: Response) {
  return <K extends RunStreamEventName>(
    name: K,
    data: RunStreamEventMap[K]
  ) => {
    res.write(`event: ${name}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
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

app.get("/api/models", async (req, res) => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search : "";
    const offsetRaw = Number(req.query.offset ?? 0);
    const limitRaw = Number(req.query.limit ?? 30);
    const offset = Number.isFinite(offsetRaw) ? offsetRaw : 0;
    const limit = Number.isFinite(limitRaw) ? limitRaw : 30;
    const requireTools = req.query.requireTools === "true";
    const result = await searchOpenRouterModels({ search, offset, limit, requireTools });
    res.json({
      models: result.models.map(trimModelForClient),
      hasMore: result.hasMore,
      nextOffset: result.nextOffset,
      total: result.total,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("GET /api/models failed:", msg);
    res.status(500).json({ error: "Failed to load models" });
  }
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
  const parsed = runRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "invalid request", detail: parsed.error.issues });
  }
  const { encryptedKey, ...request } = parsed.data;
  let resolved: { apiKey: string; mode: "user" | "admin" };
  try {
    resolved = resolveApiKey(encryptedKey);
  } catch (err) {
    if (err instanceof ResolveKeyError) {
      return res.status(401).json({ error: err.message });
    }
    throw err;
  }
  console.log(
    `▶ /api/run [${resolved.mode}]: agents=${request.agentCount} duration=${request.durationSec}s mode=${request.mode} source="${request.source.slice(0, 80).replace(/\s+/g, " ")}…"`
  );
  try {
    const final = await runPipeline({
      request,
      profiles,
      apiKey: resolved.apiKey,
    });
    res.json(final);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("simulation failed:", msg);
    res.status(500).json({ error: msg });
  }
});

// Streaming variant: emit each ActivityEvent + final result as a Server-Sent
// Events stream so the client can render comments arriving live.
app.post("/api/run-stream", async (req, res) => {
  const parsed = runRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "invalid request", detail: parsed.error.issues });
  }
  const { encryptedKey, ...request } = parsed.data;
  let resolved: { apiKey: string; mode: "user" | "admin" };
  try {
    resolved = resolveApiKey(encryptedKey);
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

  const send = makeSseSender(res);

  send("start", { agentCount: request.agentCount });
  try {
    const final = await runPipeline({
      request,
      profiles,
      apiKey: resolved.apiKey,
      onActivity: (e) => send("activity", e),
      onAgentDone: (r) => send("agent-done", r),
      onSimulationComplete: (info) => send("simulation-complete", info),
      onReportStart: () => send("report-start", {}),
      onReportDone: (info) => send("report-done", info),
      onSaved: (info) => send("saved", info),
    });
    send("done", final);
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
    const record: RunRecord = {
      id: row.id,
      source: row.source,
      settings: {
        agentCount: row.agentCount,
        maxStepsPerAgent: row.maxStepsPerAgent,
        durationSec: row.durationSec,
        mode: row.mode as RunRecord["settings"]["mode"],
        persistentMemory: row.persistentMemory,
      },
      participants: JSON.parse(row.participants),
      agentResults: JSON.parse(row.agentResults),
      snapshot: JSON.parse(row.snapshot),
      activity: JSON.parse(row.activity),
      report: row.report,
      totals: JSON.parse(row.totals),
      createdAt: row.createdAt.toISOString(),
    };
    res.json(record);
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
