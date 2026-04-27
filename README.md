# GlassHive

A Reddit-style comment-section simulator. Paste source material — an article, a tweet, an essay — and a roomful of AI agents, each role-playing a hand-authored persona, drops in to argue about it. They post threads, reply to each other, vote, and refresh over time. The output is a real branching thread you can read in the browser or export as JSON.

There are no subreddits. Just one front page.

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

1. **Sample** N profiles from the 70-persona pool — each gets a stable derived username.
2. **Spin up** `concurrency` workers. Each pulls a profile and runs one agent session against the shared `Frontpage`.
3. **One session** = one `generateText()` with up to `maxStepsPerAgent` tool-using steps. The agent's tools mutate the shared `Frontpage` directly.
4. **When a session ends**, the worker either pushes the agent back to the queue (`requeue` mode) or picks a fresh random participant (`random` mode), and runs again. The wall-clock deadline stops the simulation.
5. **Persistent memory** (default on): each agent resumes its prior conversation on respawn instead of booting fresh.
6. **Result**: participants, per-session agent results, the full thread snapshot, and totals (cost, tokens, posts, comments, elapsed).

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Liveness + profile count |
| GET | `/api/profiles` | List all 70 personas |
| POST | `/api/run` | Run a simulation synchronously, return the full result |
| POST | `/api/run-stream` | Run a simulation as Server-Sent Events |

Request body (Zod-validated):

```ts
{
  source: string,                    // 1..20000 chars
  agentCount?: number,               // 1..20, default 10
  concurrency?: number,              // 1..10, default 3
  maxStepsPerAgent?: number,         // 1..40, default 12
  durationSec?: number,              // 10..600, default 90
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
client/                  SolidJS + Vite UI
  public/favicon.svg
  src/
    App.tsx              The whole UI
    app.css              Tailwind v4 entry
    index.tsx
server/                  Express + tsx
  profiles/              70 hand-authored persona markdown files
  src/
    index.ts             HTTP routes
    profiles.ts          loadProfiles() + deriveUsername()
    frontpage.ts         Pure Reddit mechanics (posts, comments, votes, sort)
    tools.ts             Six Vercel AI SDK tools per agent
    agent.ts             runAgent() — one session
    runSimulation.ts     The orchestrator
  tests/frontpage.test.ts
```

## License

MIT
