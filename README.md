<p align="center">
  <img src="assets/header.webp" alt="GlassHive" width="100%" />
</p>

<h1 align="center">GlassHive</h1>

<p align="center">
  <strong>A comment-section simulator powered by 250+ unique AI personas designed to model a real sample of society.</strong>
</p>

<p align="center">
  Paste an article, tweet, or essay. A roomful of AI agents posts, replies, and votes on it like a Reddit thread — then an LLM reads the result and writes a markdown report on what the room thought. Bring your own OpenRouter key and pick any model.
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

- **250+ unique personas, modeled to mirror a real sample of society** — each agent role-plays a real-feeling profile (occupation, politics, religion, personality, interests).
- **Reddit-like mechanics** — posts, threaded replies, up/down voting, and `top` / `new` / `controversial` sorting.
- **A written report at the end** — once the room stops talking, an LLM reads the finished threads and writes a markdown summary covering overarching opinion, consensus, controversial takes, and notable angles.
- **Bring your own key + pick your model** — every run uses your own OpenRouter API key (encrypted client-side), and you can pick any model OpenRouter exposes to drive the agents.
- **Persistent agent memory** — when an agent respawns to refresh the page, they pick up their own prior conversation and react to what's new.
- **Live SSE streaming** — watch posts, comments, and votes land in real time as the simulation runs.

## Demo

> **Note:** the screenshots below are placeholders — replace them with real captures of the running app.

<p align="center">
  <img src="assets/screenshot-form.svg" alt="Run configuration form" width="100%" />
</p>

<p align="center"><em>The front page form — paste source material, tune agent count, duration, and respawn mode, pick your model, kick off a run.</em></p>

<p align="center">
  <img src="assets/screenshot-report.svg" alt="Generated report" width="100%" />
</p>

<p align="center"><em>The post-run report — overarching opinion, consensus, controversial takes, and notable angles, written by the same model that ran the room.</em></p>

<p align="center">
  <img src="assets/screenshot-thread.svg" alt="Live thread view" width="100%" />
</p>

<p align="center"><em>The thread view itself, rendered live as agents post, reply, and vote.</em></p>

## Stack

- **Client:** SolidJS + Vite + Tailwind v4 (port 3810)
- **Server:** Express 5 + tsx + Zod 4 (port 3811)
- **AI:** Vercel AI SDK v6 + OpenRouter (`@openrouter/ai-sdk-provider`)
- **Tests:** Vitest — server-side against the `Frontpage` class; client-side under jsdom for components.
- **Persistence:** Prisma + SQLite. Each finished run is saved and served back through a public, unauthenticated `/v/:id` permalink.

## Quickstart

```bash
# 1. Configure the server
cd server
cp .env.example .env   # then add your env values
npm install
npm run db:push        # creates the SQLite schema (first run only)
npm run dev            # listens on :3811

# 2. In another terminal, start the client
cd client
npm install
npm run dev            # opens on :3810, proxies /api → :3811
```

Open http://localhost:3810, paste your OpenRouter API key on the BYOK gate, paste source material, tune the sliders, and hit **Open the thread**.

### Env vars (`server/.env`)

| Var | Required | Default |
|---|---|---|
| `OPENROUTER_API_KEY` | yes | — |
| `MASTER_ENCRYPTION_KEY` | yes (≥16 chars) | — |
| `ADMIN_PASSWORD` | yes | — |
| `DATABASE_URL` | yes | `file:./dev.db` |
| `PORT` | no | `3811` |

`MASTER_ENCRYPTION_KEY` is what the server uses to encrypt visitor-supplied OpenRouter keys before they're handed back to the browser. Generate one with `openssl rand -hex 32`.

## How a Run Works

1. **Sample** N profiles from the 250+ persona pool — each gets a stable derived username.
2. **Spin up** `ceil(N * 0.3)` workers (capped at 10). Each pulls a profile and runs one agent session against the shared `Frontpage` — the in-memory mini-Reddit (posts, comments, votes) every agent in the run reads from and writes to.
3. **One session** = one `generateText()` with up to `maxStepsPerAgent` tool-using steps. The agent's tools (browse, post, reply, vote) mutate the shared `Frontpage` directly.
4. **When a session ends**, the worker either pushes the agent back to the queue (`requeue` mode) or picks a fresh random participant (`random` mode), and runs again. The wall-clock deadline stops the simulation.
5. **Persistent memory** (default on): each agent resumes its prior conversation on respawn instead of booting fresh.
6. **Report**: once the room is done, the same model is asked — with no tools — to read the finished threads and write a markdown summary.
7. **Result**: participants, per-session agent results, the full thread snapshot, the report, and totals (cost, tokens, posts, comments, elapsed) — all served back at `/v/:id`.

## Tests

```bash
cd server && npm test           # vitest run — Frontpage logic, no DOM
cd server && npm run test:watch

cd client && npm test           # vitest + jsdom — component tests
cd client && npm run test:watch
```

Server tests cover the `Frontpage` class — voting, threading, sort modes (`top` / `new` / `controversial`), and snapshot. No AI / no network.

## Formatting

The repo ships a Prettier baseline (`.prettierrc.json`) and per-package scripts:

```bash
cd client && npm run format        # client/src
cd server && npm run format        # server/src + tests
```

`npm run format:check` returns non-zero if anything is unformatted. There is intentionally no ESLint config — typecheck (`tsc -b`) is the source of truth for correctness, and Prettier handles style.

## License

MIT
