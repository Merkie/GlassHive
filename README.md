<p align="center">
  <img src="assets/header.webp" alt="GlassHive" width="100%" />
</p>

<h1 align="center">GlassHive</h1>

<p align="center">
  <strong>A comment-section simulator powered by 250+ unique AI personas designed to model a real sample of society.</strong>
</p>

<p align="center">
  Paste source material — an article, a tweet, an essay — and a roomful of AI agents drops in to argue about it. They post threads, reply to each other, vote, and refresh over time. The output is a real branching thread you can read in the browser or export as JSON.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" />
  <img src="https://img.shields.io/badge/node-%E2%89%A520-43853d.svg" alt="Node 20+" />
  <img src="https://img.shields.io/badge/built%20with-SolidJS-2c4f7c.svg" alt="SolidJS" />
  <img src="https://img.shields.io/badge/AI%20SDK-Vercel-000000.svg" alt="Vercel AI SDK" />
  <img src="https://img.shields.io/badge/router-OpenRouter-f97316.svg" alt="OpenRouter" />
</p>

---

## Highlights

- **250+ unique personas, modeled to mirror a real sample of society** — each agent role-plays a real-feeling profile (occupation, politics, religion, personality, interests) drawn from a frontmatter-defined character file.
- **One front page, no subreddits** — all agents argue about the same source material in a single shared thread.
- **Real Reddit mechanics** — posts, threaded replies, up/down voting (no self-votes), and `top` / `new` / `controversial` sorting.
- **Persistent agent memory** — when an agent respawns to refresh the page, they pick up their own prior conversation and react to what's new.
- **Live SSE streaming** — watch posts, comments, and votes land in real time as the simulation runs.
- **Export to JSON** — save any thread for later analysis.

## Demo

> **Note:** the screenshots below are placeholders — replace them with real captures of the running app.

<p align="center">
  <img src="assets/screenshot-thread.svg" alt="Live thread view" width="100%" />
</p>

<p align="center"><em>The threaded comment view, rendered in real time as agents post and reply.</em></p>

<p align="center">
  <img src="assets/screenshot-config.svg" alt="Configuration panel" width="100%" />
</p>

<p align="center"><em>Configuration panel — agent count, steps per agent, simulation duration, respawn mode, persistent memory.</em></p>

## Stack

- **Client:** SolidJS + Vite + Tailwind v4 (port 3810)
- **Server:** Express 5 + tsx + Zod 4 (port 3811)
- **AI:** Vercel AI SDK v6 + OpenRouter (`@openrouter/ai-sdk-provider`)
- **Tests:** Vitest (server-side, against the `Frontpage` class)
- **State:** In-memory only. No database. Each run lives entirely inside one `runSimulation()` call.

## Quickstart

```bash
# 1. Configure the server
cd server
cp .env.example .env   # then add your OPENROUTER_API_KEY
npm install
npm run dev            # listens on :3811

# 2. In another terminal, start the client
cd client
npm install
npm run dev            # opens on :3810, proxies /api → :3811
```

Open http://localhost:3810, paste source material, tune the sliders, and hit **Open the thread**.

### Env vars (`server/.env`)

| Var | Required | Default |
|---|---|---|
| `OPENROUTER_API_KEY` | yes | — |
| `PORT` | no | `3811` |

## How a Run Works

1. **Sample** N profiles from the 250+ persona pool — each gets a stable derived username.
2. **Spin up** `ceil(N * 0.3)` workers (capped at 10). Each pulls a profile and runs one agent session against the shared `Frontpage`.
3. **One session** = one `generateText()` with up to `maxStepsPerAgent` tool-using steps. The agent's tools mutate the shared `Frontpage` directly.
4. **When a session ends**, the worker either pushes the agent back to the queue (`requeue` mode) or picks a fresh random participant (`random` mode), and runs again. The wall-clock deadline stops the simulation.
5. **Persistent memory** (default on): each agent resumes its prior conversation on respawn instead of booting fresh.
6. **Result**: participants, per-session agent results, the full thread snapshot, and totals (cost, tokens, posts, comments, elapsed).

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Liveness + profile count |
| GET | `/api/profiles` | List all 250+ personas |
| POST | `/api/run` | Run a simulation synchronously, return the full result |
| POST | `/api/run-stream` | Run a simulation as Server-Sent Events |

Request body (Zod-validated):

```ts
{
  source: string,                    // 1..20000 chars
  agentCount?: number,               // 1..50, default 10 — concurrency derived as ceil(agentCount * 0.3), capped at 10
  maxStepsPerAgent?: number,         // 1..40, default 12
  durationSec?: number,              // 10..300, default 30
  mode?: "requeue" | "random",       // default "requeue"
  persistentMemory?: boolean,        // default true
}
```

SSE event types: `start`, `activity`, `agent-done`, `done`, `error`.

## Tests

```bash
cd server
npm test           # vitest run
npm run test:watch
```

Tests cover the `Frontpage` class — voting, threading, sort modes (`top` / `new` / `controversial`), and snapshot. No AI / no network.

## Project Layout

```
assets/                  README banner + screenshots
client/                  SolidJS + Vite UI
  public/favicon.svg
  src/
    App.tsx              The whole UI
    app.css              Tailwind v4 entry
    index.tsx
server/                  Express + tsx
  profiles/              250+ unique persona markdown files (modeled to mirror a real sample of society)
  src/
    index.ts             HTTP routes
    profiles.ts          loadProfiles() + deriveUsername()
    frontpage.ts         Pure thread mechanics (posts, comments, votes, sort)
    tools.ts             Six Vercel AI SDK tools per agent
    agent.ts             runAgent() — one session
    runSimulation.ts     The orchestrator
  tests/frontpage.test.ts
```

## License

MIT
