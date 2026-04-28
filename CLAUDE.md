# GlassHive

A Reddit-style comment-section simulator. Paste source material (an article, a tweet, an essay) into the front page, and a roomful of AI agents — each role-playing a unique persona drawn from a pool designed to model a real sample of society — drops in to argue about it. They post threads, reply to each other, vote, and refresh over time. The output is a real branching thread you can read in the browser or export as JSON.

There are no subreddits. Just one front page.

## Stack

- **Client:** SolidJS + Vite + Tailwind v4 (port 3810)
- **Server:** Express 5 + tsx (no build step in dev) + Zod 4 (port 3811)
- **AI:** Vercel AI SDK v6 (`ai@6.0.160`) + `@openrouter/ai-sdk-provider@2.3.3`. All LLM calls go through OpenRouter.
- **Tests:** Vitest (server-side, pure logic against the `Frontpage` class)
- **Persistence:** Prisma + SQLite (`server/prisma/dev.db`). One `Run` row per finished simulation — id (uuid v4), source, settings, the full activity log, agent results, snapshot, report markdown, totals. Public, unauthenticated `/v/:id` page reads from this. Runs in flight live in memory; only the completed run is persisted.
- **Routing:** `@solidjs/router`. `/` is the form/live-feed page; `/v/:id` is the read-only saved view.

### Pinned versions

`ai@6.0.160` and `@openrouter/ai-sdk-provider@2.3.3` are pinned for the same reason they are in picket: newer OpenRouter providers strip unsigned `reasoning_details` and break Gemini multi-turn flows. Don't bump without re-verifying.

## AI Models

| Use | Model | File |
|---|---|---|
| Per-agent reddit roleplay | `google/gemini-3.1-flash-lite-preview` | `server/src/runSimulation.ts` (default `modelId`) |

Only one model in use today. The default lives on `SimulationOptions.modelId`; callers can override it per-request, but the HTTP/UI surface doesn't expose that yet.

## Project Structure

```
client/                              SolidJS + Vite + Tailwind v4
  index.html                         Mounts /src/index.tsx, references /favicon.svg
  public/
    favicon.svg                      Dark tile + cyan honeycomb hex (GlassHive mark)
  src/
    index.tsx                        Router setup. Two routes: `/` → Home, `/v/:id` → View.
    app.css                          @import "tailwindcss" + dark-mode body styling
                                     + a `.report-md` block of @apply rules used by the
                                     marked-rendered report HTML.
    types.ts                         Shared shapes: Post, CommentNode, Snapshot, Participant,
                                     AgentResult, Totals, SimulationResult, Activity (the
                                     superset including server-emitted events + client-side
                                     phase markers), and RunRecord (the GET /api/runs/:id
                                     payload).
    lib/format.ts                    Pure helpers: fmtUsd, karmaColor, formatDuration,
                                     downloadFile/downloadJson, countAllComments.
    components/
      Logo.tsx                       The GlassHive wordmark + hex SVG. Optional `linkToHome`
                                     wraps it in an <A href="/"> for the View page.
      CommentTree.tsx                Recursive nested-comment renderer.
      ActivityLine.tsx               One row of the activity log — switches on event kind
                                     (post-created / comment-created / vote / tool-error /
                                     phase) to pick an icon + format.
      ActivityFeed.tsx               The full collapsible log section: stats bar (posts /
                                     comments / votes / errors / agent lifecycles), optional
                                     remaining-time chip, scrolling log, "Hide" / "Show
                                     activity log" toggle. `isLive` suppresses the Hide
                                     button so the feed stays open during a run.
      Report.tsx                     Markdown-rendered "the report" section + Export
                                     Markdown button. Renders nothing when markdown is null.
      Thread.tsx                     The full thread renderer: post cards, vote pills,
                                     nested CommentTree, totals/cost footer, Export JSON
                                     button. Used identically by Home (during a finished
                                     run) and View (after reload).
    pages/
      Home.tsx                       The form: source textarea, Agents + Duration sliders,
                                     collapsible Advanced settings (lifespan, respawn mode,
                                     persistent memory). Owns the SSE client. While a run
                                     is in flight, renders ActivityFeed live with the
                                     countdown timer. When the SSE stream emits `saved`
                                     with an id, calls `useNavigate()` to push to /v/:id.
      View.tsx                       Read-only page mounted at /v/:id. Fetches
                                     /api/runs/:id with createResource and renders Logo +
                                     ActivityFeed (collapsible, no timer) + Report + Thread
                                     from the saved row. Public, no auth.

server/                              Express + tsx
  .env                               OPENROUTER_API_KEY + MASTER_ENCRYPTION_KEY +
                                     ADMIN_PASSWORD + PORT + DATABASE_URL
  prisma/
    schema.prisma                    SQLite datasource. Single `Run` model — id (uuid v4),
                                     source, settings (agentCount/maxStepsPerAgent/
                                     durationSec/mode/persistentMemory), and JSON-stringified
                                     blobs for participants, agentResults, snapshot,
                                     activity, totals. `report` is plain markdown text or
                                     null. createdAt for ordering.
    dev.db                           Local SQLite file (gitignored). Recreate with
                                     `npm run db:push`.
  profiles/                          250+ unique persona markdown files (modeled to mirror a real sample of society)
    NN-first-last.md                 YAML frontmatter (id, name, age, occupation, location,
                                     politics, religion, personality, interests) + body bio.
                                     Copied from TestMyBit at scaffolding time.
  src/
    index.ts                         Express bootstrap + endpoints. /api/run and /api/run-stream
                                     both end by writing the finished run into Prisma and
                                     return / emit the resulting `id`. /api/runs/:id reads
                                     a row back, parses the JSON blobs, and returns the
                                     full RunRecord shape the View page expects.
    resources/prisma.ts              `new PrismaClient()` singleton.
    profiles.ts                      loadProfiles() reads profiles/*.md, parses frontmatter,
                                     derives a stable reddit-style username per profile
                                     (`deriveUsername()`). sampleProfiles() = Fisher-Yates
                                     shuffle + slice.
    frontpage.ts                     The Reddit mechanic. Pure logic, no AI. Posts (uuid,
                                     title, body), comments (uuid, parentId can be a post or
                                     another comment, denormalized postId), votes (per-user,
                                     toggle on repeat, switch on opposite, self-vote rejected
                                     via SelfVoteError). Sort modes: top (karma desc), new
                                     (createdAt desc), controversial ((up+down)*min/max).
                                     Exposes listPosts / getCommentTree / snapshot.
    tools.ts                         buildTools(ctx): six Vercel AI SDK tools per agent —
                                     get_posts, get_post, get_comments, create_post, reply,
                                     react. Every state-changing tool emits an ActivityEvent
                                     via ctx.onActivity. Errors (SelfVoteError,
                                     UnknownEntityError) are caught and returned as
                                     `{ error: string }` so the model can retry.
    agent.ts                         runAgent(opts): one model call (a "session"). Builds a
                                     system prompt from the profile + source, calls
                                     generateText with stopWhen=stepCountIs(maxSteps), checks
                                     the simulation deadline before kicking off, returns
                                     { steps, costUsd, tokens, messages }. On a fresh spawn
                                     uses [system, FIRST_VISIT_USER]; on a resume uses
                                     [...priorMessages, RETURN_VISIT_USER] so the agent
                                     reacts to what's changed instead of repeating itself.
    runSimulation.ts                 The orchestrator. Samples N participants from the pool,
                                     then starts `ceil(N * 0.3)` workers (capped at 10) that
                                     loop until the deadline. Two modes: "requeue" (round-robin
                                     queue — each agent waits their turn) and "random" (any
                                     participant fills the next open slot). Persistent memory
                                     keeps a `Map<username, ModelMessage[]>` and feeds it
                                     back into runAgent on each respawn. Strips messages
                                     from the public result so the API payload stays small.
                                     Exports getOpenRouter() and DEFAULT_MODEL_ID so the
                                     report path in index.ts can reuse the same model.
    report.ts                        generateReport({ model, source, snapshot }): one
                                     no-tools generateText call that asks the LLM to write
                                     a markdown summary of the (already top-sorted) snapshot.
                                     Returns { markdown, costUsd, tokens, error? }. Returns
                                     markdown=null when there are no posts to summarize or
                                     the call throws.
  tests/
    frontpage.test.ts                20 vitest tests for the Frontpage class — voting,
                                     threading, sort modes, snapshot. No AI / no network.
```

## Routes

**HTTP** (mounted in `server/src/index.ts`):

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Liveness + profile count |
| GET | `/api/profiles` | List all 250+ personas (id, username, name, age, occupation, location) |
| POST | `/api/run` | Run a simulation synchronously, persist it, return the full result + snapshot + new `id` |
| POST | `/api/run-stream` | Run a simulation as Server-Sent Events. Persists at the end and emits a `saved { id }` event before `done`. |
| GET | `/api/runs/:id` | Fetch a saved run by uuid. Returns RunRecord (settings + participants + agentResults + snapshot + activity + report + totals + createdAt). 404 if missing. Public, unauthenticated — this is what the /v/:id page calls. |

**Request body** (Zod schema in `index.ts`):

```ts
{
  source: string,                    // 1..20000 chars
  agentCount?: number,               // 1..50, default 10 — concurrency derived as ceil(agentCount * 0.3), capped at 10
  maxStepsPerAgent?: number,         // 1..40, default 12 — caps each session, not lifetime
  durationSec?: number,              // 10..300, default 30 — wall-clock budget for the whole run
  mode?: "requeue" | "random",       // default "requeue"
  persistentMemory?: boolean,        // default true — agents resume their conversation on respawn
}
```

**SSE events** (`/api/run-stream`):

| `event:` | When |
|---|---|
| `start` | Once at the top of the run |
| `activity` | Every `post-created` / `comment-created` / `vote` / `tool-error` from any agent |
| `agent-done` | Each time an agent session completes (one agent fires this many times across a run) |
| `simulation-complete` | Once, after all workers finish — payload `{ posts, comments }` |
| `report-start` | Once, right before the LLM is asked to write the report |
| `report-done` | Once, with `{ markdown, error? }` — `markdown` is null if the run had 0 posts or the report call errored |
| `saved` | Once, with `{ id }` (uuid v4) after the run is written to the DB. The Home page navigates to /v/:id when this arrives. |
| `done` | Final SimulationResult on success (now includes top-level `report` field and `id`) |
| `error` | Terminal error |

## How a Run Works

1. **Sample** `agentCount` profiles from the 250+ persona pool — each gets a stable derived username (`deriveUsername()` in `profiles.ts`).
2. **Spin up** `ceil(agentCount * 0.3)` workers (capped at 10). Each worker pulls a profile and runs `runAgent()` against the shared `Frontpage`.
3. **One session** = one `generateText()` with up to `maxStepsPerAgent` tool-using steps. The agent's tools mutate the shared `Frontpage` directly. ActivityEvents are emitted as a side effect of every state change.
4. **When a session ends**, the worker either pushes the agent back to the queue (`requeue` mode) or just picks a fresh random participant (`random` mode), and runs again. **The wall-clock deadline is what stops the simulation** — workers loop until `Date.now() >= deadline`. Per-agent step limits cap each visit, not the whole run.
5. **Persistent memory** (default on): the runner keeps a per-username `ModelMessage[]` and passes it as `priorMessages` on the next respawn. The agent appends a "you're back, what's new?" user turn so the model fetches the latest thread state instead of repeating itself.
6. **Report** (in the HTTP handler, not inside `runSimulation`): once the simulation finishes, `generateReport()` (`server/src/report.ts`) takes the top-sorted snapshot and asks the same model — with no tools — to write a markdown summary covering overarching opinion, consensus, controversial takes, and notable angles. Cost folds into `totals`. Skipped (markdown=null) when there are 0 posts.
7. **Result**: a `SimulationResult` with `id` (uuid v4 of the saved row), `participants`, `agentResults` (per-session, message log stripped), `snapshot` (the full thread tree), `report` (the markdown summary, or null), and `totals` (cost, tokens, posts, comments, elapsedMs).
8. **Persist**: once the report call returns, the handler writes everything to a single `Run` row in SQLite — the source, the settings used, the full activity timeline (with synthesized phase markers so /v/:id replays the same banners the live user saw), participants, agentResults, the snapshot, the report markdown, and the totals. The id is a fresh `randomUUID()`.
9. **Auto-navigate**: the SSE handler emits `saved { id }` immediately after the write, then `done`. The Home page captures the id and `useNavigate()`s to `/v/:id` so the user lands on a permalink they can share / refresh / bookmark.

## The Six Agent Tools

All defined in `server/src/tools.ts`. Bound to a single `username` per agent so a tool call can't impersonate.

| Tool | Purpose |
|---|---|
| `get_posts({ sort, limit })` | Browse the front page. `sort` ∈ `top` / `new` / `controversial`. |
| `get_post({ post_id, comment_sort })` | Fetch one post + its full nested comment tree. |
| `get_comments({ post_id, sort })` | Re-read just the comment tree with a different sort. |
| `create_post({ title, body })` | Start a new top-level thread. |
| `reply({ entity_id, body })` | One tool for replying to **either** a post (top-level comment) or another comment (nested reply). The Frontpage figures out which from `entity_id`. |
| `react({ entity_id, type })` | Up/downvote any post or comment. Self-votes throw `SelfVoteError`. Repeating the same vote toggles it; opposite vote switches it. |

`UnknownEntityError` and `SelfVoteError` are caught in `safeRun()` and returned as `{ error }` to the model so it can recover gracefully.

## Frontpage Mechanics

`server/src/frontpage.ts` is the only stateful object in the run. Pure data, deterministic, fully unit-tested.

- **Posts and comments** use `randomUUID()` ids. Comments carry both `parentId` (post or comment they reply to) and `postId` (denormalized root post for grouping/sort).
- **Voting** is per-user-per-entity. Repeated up/down toggles; opposite switches. Self-voting is rejected.
- **Sort modes:**
  - `top` — karma desc, tiebreak by createdAt desc
  - `new` — createdAt desc
  - `controversial` — `(up + down) * min(up,down) / max(up,down)` — favors high-engagement, near-50/50 splits
- **`snapshot()`** dumps every post (sorted by karma) with its full nested comment tree. This is what the API returns and what the UI renders.

## Dev Setup

```bash
# Server (port 3811) — `npm run dev` runs `prisma generate` first, then tsx watch
cd server && npm install && npm run db:push && npm run dev

# Client (port 3810, proxies /api → :3811)
cd client && npm install && npm run dev

# Tests
cd server && npm test           # vitest run
cd server && npm run test:watch
```

### Env vars (`server/.env`)

- `OPENROUTER_API_KEY` — host's key. Used only when a visitor authenticates with the admin password.
- `MASTER_ENCRYPTION_KEY` — symmetric key used by `server/src/resources/cryptr.ts` to encrypt visitor-supplied OpenRouter keys before they're stored in `localStorage`. Required, ≥16 chars; rotate to invalidate every stored client blob. Recommended: `openssl rand -hex 32`.
- `ADMIN_PASSWORD` — bypass password. When a visitor types this on the BYOK gate, the server uses `OPENROUTER_API_KEY` instead of treating their input as a real key.
- `PORT` — defaults to `3811`
- `DATABASE_URL` — Prisma SQLite URL, e.g. `file:./dev.db`

The client has no env vars; Vite proxies `/api` straight to `localhost:3811` (see `client/vite.config.ts`).

### BYOK (bring-your-own-key)

Every `/api/run` and `/api/run-stream` request requires an `encryptedKey` field. The flow:

1. Client posts plaintext to `POST /api/encrypt-key`. Server validates against OpenRouter's `/api/v1/auth/key` (or skips if it matches `ADMIN_PASSWORD`), encrypts the key with `cryptr` + `MASTER_ENCRYPTION_KEY`, returns `{ encryptedKey, mode: "user" | "admin" }`.
2. Client stashes the ciphertext under `glasshive_encrypted_openrouter_key` in `localStorage` (`client/src/lib/keyStore.ts`).
3. Every subsequent run sends the ciphertext. The server decrypts in memory, builds a per-request `createOpenRouter({ apiKey })` client, and threads it through `runSimulation` and `generateReport`. The plaintext key never persists to disk and never gets logged.
4. Tampered or stale ciphertext returns 401; the client clears localStorage and re-prompts via `KeyGate`.

## SolidJS Rules (MANDATORY)

This is a SolidJS project. **Not React.** Same rules as the rest of the user's SolidJS apps — violations silently break reactivity.

### Watch out for name collisions

`Switch` is a SolidJS control-flow component (`<Switch>` + `<Match>`). Don't name a local component `Switch` — `vite-plugin-solid` will resolve the JSX tag to the imported one even without an import statement, and you'll get `Cannot read properties of undefined (reading 'when')` at runtime. The toggle in `App.tsx` is named `Toggle` for this reason.

### Control flow

- `{condition && <JSX>}` — **BANNED.** Use `<Show when={condition}>`.
- `{array.map(item => <JSX>)}` — **BANNED.** Use `<For each={array}>`.
- `<Switch>` / `<Match>` for multi-branch.

`.map()` outside of JSX (in memos, event handlers, signal setters) is fine.

### Reactivity

- Components run **once.** No re-renders. The function body wires up the reactive graph.
- Never destructure props.
- Signals are functions: `count()` to read, `setCount(v)` to write.
- `createMemo` / `createEffect` track dependencies automatically — no dependency arrays.

## Conventions

- **Profiles are immutable.** They were copied from TestMyBit; usernames are derived deterministically by `deriveUsername()` (a hash-based pick from a small pattern pool). If you ever need to add a `username:` field directly to a profile's frontmatter, the loader will honor it and skip the derivation.
- **One row per finished run.** Each simulation starts with a fresh in-memory `Frontpage` and is persisted exactly once at the end (after the report call). Runs in flight aren't stored — refresh during a generation and you lose your spot in the SSE stream. After the `saved` event the user is on `/v/:id` and refreshes are safe.
- **No streaming partial UI updates of the thread itself.** SSE streams `activity` events (which feed the live activity counter and log), but the rendered thread doesn't appear until the `done` event lands. If you need live-rendering of comments as they're created, that's a feature to add — wire each `comment-created` activity event through to a live snapshot fetch or push the snapshot deltas directly.
- **The simulation deadline is global, not per-agent.** Once `Date.now()` passes the deadline, no more sessions start. An in-flight `generateText` is allowed to finish, so you can overshoot by one step.
