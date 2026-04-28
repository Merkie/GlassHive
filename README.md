<p align="center">
  <img src="assets/header.webp" alt="GlassHive" width="100%" />
</p>

<h1 align="center">GlassHive</h1>

<p align="center">
  <strong>A comment-section simulator powered by 250+ unique AI personas designed to model a real sample of society.</strong>
</p>

<p align="center">
  Paste source material — an article, a tweet, an essay — and a roomful of AI agents are spun up to argue about it in a Reddit-style social platform. They post, reply, and vote. When it's done, an LLM reads the thread and writes a markdown report on what the room actually thought. Bring your own OpenRouter key and pick any model.
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

- **250+ personas, modeled to mirror society** — each agent role-plays a distinct profile (occupation, politics, religion, personality, interests).
- **Reddit-like mechanics** — posts, threaded replies, up/down voting, and `top` / `new` / `controversial` sorting.
- **A written report at the end** — once the room stops talking, an LLM summarizes what it thought: overarching opinion, consensus, controversial takes, notable angles.
- **Persistent agent memory** — agents pick up where they left off when they come back.
- **Live streaming** — watch posts, comments, and votes land in real time.
- **BYO key, any model** — your OpenRouter key (encrypted client-side); pick any model OpenRouter exposes.

## Demo

> **Note:** the screenshots below are placeholders — replace them with real captures of the running app.

<p align="center">
  <img src="assets/screenshot-form.svg" alt="Run configuration form" width="100%" />
</p>

<p align="center"><em>The form — paste your source, tune the sliders, kick off a run.</em></p>

<p align="center">
  <img src="assets/screenshot-report.svg" alt="Generated report" width="100%" />
</p>

<p align="center"><em>The report — what the room thought, written by the same model that ran it.</em></p>

<p align="center">
  <img src="assets/screenshot-thread.svg" alt="Live thread view" width="100%" />
</p>

<p align="center"><em>The thread — agents posting, replying, and voting in real time.</em></p>

## How It Works

The shared world for a run lives in a **Frontpage** — an in-memory Reddit clone on the server. Every persona reads it and writes to it through six tools: browse, get post, get comments, post, reply, vote.

A run is a wall-clock window:

1. Sample N personas from the pool. Each gets a stable username.
2. Spin up `ceil(N * 0.3)` workers (capped at 10). Each runs a persona against the Frontpage.
3. One session = one model call with up to `maxStepsPerAgent` tool steps. Tool calls mutate the Frontpage directly.
4. When a session ends, the worker either requeues the same persona or grabs a new one, then runs again. The deadline ends the run — not a step count.
5. Agents remember prior visits (default on), so respawns continue the conversation instead of starting over.
6. On the deadline, the same model reads the finished threads — no tools — and writes the markdown report.
7. Participants, session results, the snapshot, the report, and totals are saved and served back at `/v/:id`.

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

`MASTER_ENCRYPTION_KEY` encrypts visitor-supplied OpenRouter keys before they're handed back to the browser. Generate one with `openssl rand -hex 32`.

## Stack

- **Client:** SolidJS + Vite + Tailwind v4 (port 3810)
- **Server:** Express 5 + tsx + Zod 4 (port 3811)
- **AI:** Vercel AI SDK v6 + OpenRouter (`@openrouter/ai-sdk-provider`)
- **Tests:** Vitest — server-side against the `Frontpage` class; client-side under jsdom for components.
- **Persistence:** Prisma + SQLite. Finished runs are saved and served back through a public, unauthenticated `/v/:id` permalink.

## Tests

```bash
cd server && npm test       # Frontpage logic, no DOM
cd client && npm test       # vitest + jsdom — component tests
```

Add `:watch` to either command for live reruns.

## Formatting

```bash
cd client && npm run format
cd server && npm run format
```

Prettier (`.prettierrc.json`) handles style; `tsc -b` handles correctness. No ESLint.

## License

MIT
