import { createSignal, createMemo, createEffect, For, Show, Switch, Match, type JSX } from "solid-js";
import { marked } from "marked";
import {
  TbOutlineSparkles,
  TbOutlineLoader2,
  TbOutlineSettings,
  TbOutlineChevronRight,
  TbOutlineMessagePlus,
  TbOutlineArrowBackUp,
  TbFillArrowBigUp,
  TbFillArrowBigDown,
  TbOutlineAlertTriangle,
  TbOutlineMessageCircle,
  TbOutlineUsers,
  TbOutlineBolt,
  TbOutlineDownload,
  TbOutlineClock,
  TbOutlineHeartbeat,
  TbOutlineFileText,
  TbOutlineRefresh,
  TbOutlineRepeat,
  TbOutlineArrowsShuffle,
  TbOutlineBrain,
  TbOutlineCircleCheck,
  TbOutlinePencil,
} from "solid-icons/tb";

type Post = {
  id: string;
  authorUsername: string;
  title: string;
  body: string;
  createdAt: number;
};

type CommentNode = {
  id: string;
  authorUsername: string;
  body: string;
  createdAt: number;
  parentId: string;
  karma: number;
  upvotes: number;
  downvotes: number;
  replies: CommentNode[];
};

type Snapshot = {
  posts: Array<{
    post: Post;
    karma: number;
    upvotes: number;
    downvotes: number;
    comments: CommentNode[];
  }>;
  exportedAt: number;
};

type Participant = {
  username: string;
  name: string;
  occupation: string;
  location: string;
};

type AgentResult = {
  username: string;
  steps: number;
  finishReason: string | null;
  costUsd: number;
  tokens: { input: number; output: number };
  errored: boolean;
  error?: string;
};

type SimulationResult = {
  source: string;
  participants: Participant[];
  agentResults: AgentResult[];
  snapshot: Snapshot;
  report?: string | null;
  totals: {
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
    posts: number;
    comments: number;
    elapsedMs: number;
  };
};

type Activity =
  | { kind: "post-created"; postId: string; username: string; title: string }
  | { kind: "comment-created"; commentId: string; postId: string; parentId: string; username: string; body: string }
  | { kind: "vote"; entityId: string; username: string; type: "up" | "down"; result: string }
  | { kind: "tool-error"; tool: string; username: string; error: string }
  | { kind: "phase"; label: string; tone: "info" | "success" | "start" };

function fmtUsd(n: number): string {
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(6)}`;
  return `$${n.toFixed(4)}`;
}

function karmaColor(k: number): string {
  if (k > 0) return "text-orange-400";
  if (k < 0) return "text-rose-400";
  return "text-neutral-500";
}

function downloadFile(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadJson(name: string, data: unknown) {
  downloadFile(name, JSON.stringify(data, null, 2), "application/json");
}

function CommentTree(props: { nodes: CommentNode[]; depth: number }) {
  return (
    <div class={props.depth === 0 ? "" : "ml-4 border-l border-neutral-800 pl-3"}>
      <For each={props.nodes}>
        {(node) => (
          <article class="mt-2 rounded-md bg-neutral-950/40 p-3">
            <header class="flex items-center gap-2 text-xs text-neutral-500">
              <span class="font-semibold text-neutral-300">u/{node.authorUsername}</span>
              <span>·</span>
              <span class={karmaColor(node.karma)}>
                {node.karma >= 0 ? "▲" : "▼"} {Math.abs(node.karma)}
              </span>
              <span class="text-neutral-700">
                ({node.upvotes}↑ / {node.downvotes}↓)
              </span>
            </header>
            <p class="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-neutral-200">
              {node.body}
            </p>
            <Show when={node.replies.length > 0}>
              <CommentTree nodes={node.replies} depth={props.depth + 1} />
            </Show>
          </article>
        )}
      </For>
    </div>
  );
}

const SAMPLE_SOURCE = `BREAKING: Chinese AI lab DeepSeek released a new open-weights model that scores within 2 points of GPT-5 on standard benchmarks while costing roughly 1/30th to train. The release dropped overnight on Hugging Face with a permissive license. Western labs are reportedly scrambling to respond.`;

export default function App() {
  const [source, setSource] = createSignal(SAMPLE_SOURCE);
  const [agentCount, setAgentCount] = createSignal(10);
  const [maxStepsPerAgent, setMaxStepsPerAgent] = createSignal(12);
  const [durationSec, setDurationSec] = createSignal(30);
  const [mode, setMode] = createSignal<"requeue" | "random">("requeue");
  const [persistentMemory, setPersistentMemory] = createSignal(true);
  const [showAdvanced, setShowAdvanced] = createSignal(false);

  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [result, setResult] = createSignal<SimulationResult | null>(null);
  const [report, setReport] = createSignal<string | null>(null);
  const [activity, setActivity] = createSignal<Activity[]>([]);
  const [logCollapsed, setLogCollapsed] = createSignal(false);
  const [remainingSec, setRemainingSec] = createSignal<number | null>(null);
  let timerHandle: ReturnType<typeof setInterval> | undefined;
  const stopTimer = () => {
    if (timerHandle !== undefined) {
      clearInterval(timerHandle);
      timerHandle = undefined;
    }
    setRemainingSec(null);
  };
  const startTimer = (totalSec: number) => {
    stopTimer();
    const deadline = Date.now() + totalSec * 1000;
    setRemainingSec(totalSec);
    timerHandle = setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemainingSec(left);
      if (left <= 0 && timerHandle !== undefined) {
        clearInterval(timerHandle);
        timerHandle = undefined;
      }
    }, 250);
  };
  let logRef: HTMLDivElement | undefined;
  createEffect(() => {
    activity();
    if (logRef) logRef.scrollTop = logRef.scrollHeight;
  });
  const [doneAgents, setDoneAgents] = createSignal<AgentResult[]>([]);

  const stats = createMemo(() => {
    const a = activity();
    return {
      posts: a.filter((e) => e.kind === "post-created").length,
      comments: a.filter((e) => e.kind === "comment-created").length,
      votes: a.filter((e) => e.kind === "vote").length,
      errors: a.filter((e) => e.kind === "tool-error").length,
    };
  });

  const submit = async () => {
    const text = source().trim();
    if (!text) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setReport(null);
    setActivity([
      { kind: "phase", label: "Spinning up the room…", tone: "start" },
    ]);
    setDoneAgents([]);
    setLogCollapsed(false);
    startTimer(durationSec());

    try {
      const res = await fetch("/api/run-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: text,
          agentCount: agentCount(),
          maxStepsPerAgent: maxStepsPerAgent(),
          durationSec: durationSec(),
          mode: mode(),
          persistentMemory: persistentMemory(),
        }),
      });
      if (!res.ok || !res.body) {
        const body = await res.text();
        throw new Error(`${res.status}: ${body}`);
      }
      // Parse SSE stream by hand. Each event is: `event: <name>\ndata: <json>\n\n`.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const eventLine = chunk.match(/^event:\s*(.*)$/m);
          const dataLine = chunk.match(/^data:\s*(.*)$/m);
          if (!eventLine || !dataLine) continue;
          const name = eventLine[1].trim();
          let data: any;
          try {
            data = JSON.parse(dataLine[1]);
          } catch {
            continue;
          }
          if (name === "activity") {
            setActivity((arr) => [...arr, data as Activity]);
          } else if (name === "agent-done") {
            setDoneAgents((arr) => [...arr, data as AgentResult]);
          } else if (name === "simulation-complete") {
            stopTimer();
            setActivity((arr) => [
              ...arr,
              {
                kind: "phase",
                label: `simulation complete — ${data.posts} posts, ${data.comments} comments`,
                tone: "success",
              },
            ]);
          } else if (name === "report-start") {
            setActivity((arr) => [
              ...arr,
              { kind: "phase", label: "writing report…", tone: "info" },
            ]);
          } else if (name === "report-done") {
            if (data.markdown) {
              setReport(data.markdown);
              setActivity((arr) => [
                ...arr,
                { kind: "phase", label: "report ready", tone: "success" },
              ]);
              setLogCollapsed(true);
            } else {
              setActivity((arr) => [
                ...arr,
                {
                  kind: "phase",
                  label: `report skipped${data.error ? `: ${data.error}` : ""}`,
                  tone: "info",
                },
              ]);
            }
          } else if (name === "done") {
            setResult(data as SimulationResult);
          } else if (name === "error") {
            setError(data.error ?? "unknown error");
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      stopTimer();
      setLoading(false);
    }
  };

  return (
    <div class="min-h-full w-full">
      <div class="mx-auto max-w-5xl px-6 py-10">
        <header class="mb-8 flex items-baseline justify-between">
          <div>
            <h1 class="flex items-baseline gap-2 text-4xl font-black tracking-tight">
              <svg viewBox="0 0 64 64" class="h-9 w-9 self-center" aria-hidden="true">
                <defs>
                  <linearGradient id="hiveGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="#fb923c" />
                    <stop offset="100%" stop-color="#ea580c" />
                  </linearGradient>
                </defs>
                <polygon
                  points="32,4 56,18 56,46 32,60 8,46 8,18"
                  fill="url(#hiveGrad)"
                  opacity="0.18"
                  stroke="#fb923c"
                  stroke-width="2"
                />
                <polygon
                  points="32,18 46,26 46,42 32,50 18,42 18,26"
                  fill="none"
                  stroke="#fb923c"
                  stroke-width="2"
                />
              </svg>
              <span>Glass<span class="text-orange-500">Hive</span></span>
            </h1>
            <p class="mt-1 text-sm text-neutral-400">
              Drop in source material. Watch a roomful of AI agents argue about it
              in a fake comment section.
            </p>
          </div>
        </header>

        <section class="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-6 shadow-xl">
          <label class="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-300">
            <TbOutlineFileText size={16} class="text-neutral-500" />
            Source material
          </label>
          <textarea
            class="mt-2 min-h-[160px] w-full resize-y rounded-lg border border-neutral-800 bg-neutral-950/70 p-3 font-mono text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-orange-500"
            placeholder="Paste a news article, a tweet, an essay, a Reddit post — anything for the agents to react to."
            value={source()}
            onInput={(e) => setSource(e.currentTarget.value)}
            disabled={loading()}
          />

          <div class="mt-5 grid gap-5 sm:grid-cols-2">
            <Slider
              label="Agents"
              value={agentCount()}
              min={1}
              max={50}
              onChange={setAgentCount}
              disabled={loading()}
              accent="text-orange-400"
              icon={<TbOutlineUsers size={16} class="text-neutral-500" />}
            />
            <Slider
              label="Simulation duration"
              value={durationSec()}
              min={10}
              max={300}
              step={10}
              onChange={setDurationSec}
              disabled={loading()}
              accent="text-emerald-400"
              format={formatDuration}
              icon={<TbOutlineClock size={16} class="text-neutral-500" />}
            />
          </div>

          <div class="mt-5 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950/40">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              class="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-medium text-neutral-300 transition hover:bg-neutral-900/60"
              aria-expanded={showAdvanced()}
            >
              <span class="flex items-center gap-2">
                <TbOutlineSettings size={16} class="text-neutral-500" />
                Advanced settings
              </span>
              <TbOutlineChevronRight
                size={16}
                class="text-neutral-500 transition-transform"
                style={{ transform: showAdvanced() ? "rotate(90deg)" : "rotate(0deg)" }}
              />
            </button>
            <Show when={showAdvanced()}>
              <div class="space-y-5 border-t border-neutral-800/60 p-4">
                <Slider
                  label="Agent lifespan"
                  value={maxStepsPerAgent()}
                  min={1}
                  max={40}
                  onChange={setMaxStepsPerAgent}
                  disabled={loading()}
                  accent="text-fuchsia-400"
                  unit="steps"
                  icon={<TbOutlineHeartbeat size={16} class="text-neutral-500" />}
                />

                <div class="grid gap-5 md:grid-cols-2">
                <div>
                  <label class="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-300">
                    <TbOutlineRefresh size={16} class="text-neutral-500" />
                    Respawn mode
                  </label>
                  <div class="mt-2 grid grid-cols-2 gap-2">
                    <ModeButton
                      active={mode() === "requeue"}
                      disabled={loading()}
                      onClick={() => setMode("requeue")}
                      label="Requeue"
                      icon={<TbOutlineRepeat size={16} />}
                    />
                    <ModeButton
                      active={mode() === "random"}
                      disabled={loading()}
                      onClick={() => setMode("random")}
                      label="Random"
                      icon={<TbOutlineArrowsShuffle size={16} />}
                    />
                  </div>
                  <p class="mt-2 text-xs italic text-neutral-500">
                    {mode() === "requeue"
                      ? "Round-robin: each agent waits their turn before being respawned"
                      : "Any participant fills the next open slot — louder users post more, others post less"}
                  </p>
                </div>

                <div>
                  <label class="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-300">
                    <TbOutlineBrain size={16} class="text-neutral-500" />
                    Persistent agent memory
                  </label>
                  <div class="mt-2 flex items-center gap-3">
                    <Toggle
                      on={persistentMemory()}
                      disabled={loading()}
                      onToggle={() => setPersistentMemory((v) => !v)}
                    />
                    <span class="text-sm font-semibold text-neutral-200">
                      {persistentMemory() ? "On" : "Off"}
                    </span>
                  </div>
                  <p class="mt-2 text-xs italic text-neutral-500">
                    {persistentMemory()
                      ? "Agents resume their conversation when respawned"
                      : "Every respawn boots fresh from the system prompt"}
                  </p>
                </div>
                </div>
              </div>
            </Show>
          </div>

          <div class="mt-5 flex justify-end">
            <button
              type="button"
              onClick={submit}
              disabled={loading() || !source().trim()}
              class="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-6 py-3 text-sm font-semibold text-black shadow-lg shadow-orange-500/20 transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Show when={loading()} fallback={<TbOutlineSparkles size={18} />}>
                <TbOutlineLoader2 size={18} class="animate-spin" />
              </Show>
              {loading() ? "The room is talking…" : "Generate"}
            </button>
          </div>
        </section>

        <Show when={error()}>
          <div class="mt-6 rounded-lg border border-rose-900/60 bg-rose-950/40 p-4 text-sm text-rose-300">
            {error()}
          </div>
        </Show>

        <Show when={(loading() || activity().length > 0) && !logCollapsed()}>
          <section class="mt-8 rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 font-mono text-xs text-neutral-400">
            <div class="mb-2 flex flex-wrap items-center gap-4">
              <Show when={remainingSec() !== null}>
                <span class="inline-flex items-center gap-1.5">
                  <TbOutlineClock size={14} class="text-sky-400" />
                  <span class="text-sky-400 tabular-nums">
                    {formatDuration(remainingSec()!)}
                  </span>
                  <span>remaining</span>
                </span>
              </Show>
              <span class="inline-flex items-center gap-1.5">
                <TbOutlineMessagePlus size={14} class="text-orange-400" />
                Posts: <span class="text-orange-400">{stats().posts}</span>
              </span>
              <span class="inline-flex items-center gap-1.5">
                <TbOutlineMessageCircle size={14} class="text-fuchsia-400" />
                Comments: <span class="text-fuchsia-400">{stats().comments}</span>
              </span>
              <span class="inline-flex items-center gap-1.5">
                <TbOutlineBolt size={14} class="text-emerald-400" />
                Votes: <span class="text-emerald-400">{stats().votes}</span>
              </span>
              <span class="inline-flex items-center gap-1.5">
                <TbOutlineAlertTriangle size={14} class="text-rose-400" />
                Errors: <span class="text-rose-400">{stats().errors}</span>
              </span>
              <span class="inline-flex items-center gap-1.5">
                <TbOutlineUsers size={14} class="text-neutral-300" />
                Agent lifecycles: <span class="text-neutral-200">{doneAgents().length}</span>
              </span>
              <Show when={!loading() && activity().length > 0}>
                <button
                  type="button"
                  onClick={() => setLogCollapsed(true)}
                  class="ml-auto inline-flex items-center gap-1 text-neutral-500 hover:text-neutral-300"
                >
                  Hide
                </button>
              </Show>
            </div>
            <div
              ref={logRef}
              class="no-scrollbar flex h-48 flex-col overflow-y-auto border-t border-neutral-800 pt-2 text-[11px] leading-tight"
              style={{ "scroll-behavior": "smooth" }}
            >
              <div class="mt-auto">
                <For each={activity().slice(-80)}>
                  {(e) => <ActivityLine event={e} />}
                </For>
              </div>
            </div>
          </section>
        </Show>

        <Show when={logCollapsed() && activity().length > 0}>
          <button
            type="button"
            onClick={() => setLogCollapsed(false)}
            class="mt-8 inline-flex items-center gap-1.5 font-mono text-xs text-neutral-500 hover:text-neutral-300"
          >
            <TbOutlineChevronRight size={14} />
            Show activity log ({activity().length} events)
          </button>
        </Show>

        <Show when={report()}>
          {(md) => (
            <section class="mt-10">
              <div class="mb-3 flex flex-wrap items-baseline justify-between gap-3">
                <h2 class="text-sm font-semibold uppercase tracking-widest text-neutral-500">
                  the report
                </h2>
                <button
                  type="button"
                  onClick={() => downloadFile("glasshive-report.md", md(), "text/markdown")}
                  class="inline-flex items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-300 hover:border-neutral-600 hover:bg-neutral-800"
                >
                  <TbOutlineDownload size={14} />
                  Export Markdown
                </button>
              </div>
              <div
                class="report-md rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6"
                innerHTML={marked.parse(md(), { async: false }) as string}
              />
            </section>
          )}
        </Show>

        <Show when={result()}>
          {(r) => (
            <section class="mt-10">
              <div class="mb-6 flex flex-wrap items-baseline justify-between gap-3">
                <h2 class="text-sm font-semibold uppercase tracking-widest text-neutral-500">
                  the thread
                </h2>
                <button
                  type="button"
                  onClick={() => downloadJson("glasshive-thread.json", r())}
                  class="inline-flex items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-300 hover:border-neutral-600 hover:bg-neutral-800"
                >
                  <TbOutlineDownload size={14} />
                  Export JSON
                </button>
              </div>

              <Show
                when={r().snapshot.posts.length > 0}
                fallback={
                  <p class="rounded-xl border border-amber-900/60 bg-amber-950/30 p-4 text-sm text-amber-300">
                    The room logged on but no one posted. Try giving the agents more
                    steps or duration.
                  </p>
                }
              >
                <div class="flex flex-col gap-6">
                  <For each={r().snapshot.posts}>
                    {(p) => (
                      <article class="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5">
                        <header class="flex items-start gap-4">
                          <div class="flex flex-col items-center pt-1">
                            <span class={`text-2xl font-bold ${karmaColor(p.karma)}`}>
                              {p.karma >= 0 ? "▲" : "▼"}
                            </span>
                            <span class={`font-mono text-lg ${karmaColor(p.karma)}`}>
                              {p.karma}
                            </span>
                          </div>
                          <div class="flex-1">
                            <div class="text-xs text-neutral-500">
                              posted by{" "}
                              <span class="text-neutral-300">u/{p.post.authorUsername}</span>
                            </div>
                            <h3 class="mt-1 text-xl font-bold text-neutral-100">
                              {p.post.title}
                            </h3>
                            <Show when={p.post.body.trim().length > 0}>
                              <p class="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-neutral-300">
                                {p.post.body}
                              </p>
                            </Show>
                            <div class="mt-2 text-xs text-neutral-500">
                              {p.upvotes}↑ {p.downvotes}↓ ·{" "}
                              {countAllComments(p.comments)} comments
                            </div>
                          </div>
                        </header>
                        <Show when={p.comments.length > 0}>
                          <div class="mt-4 border-t border-neutral-800 pt-3">
                            <CommentTree nodes={p.comments} depth={0} />
                          </div>
                        </Show>
                      </article>
                    )}
                  </For>
                </div>
              </Show>

              <footer class="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-950/60 px-4 py-3 font-mono text-xs text-neutral-500">
                <div>
                  <span class="text-neutral-400">cost</span>{" "}
                  <span class="text-emerald-400">{fmtUsd(r().totals.costUsd)}</span>
                  <span class="text-neutral-700"> · </span>
                  tokens in={r().totals.inputTokens.toLocaleString()} out=
                  {r().totals.outputTokens.toLocaleString()}
                </div>
                <div>
                  {r().totals.posts} posts · {r().totals.comments} comments ·{" "}
                  {(r().totals.elapsedMs / 1000).toFixed(1)}s
                </div>
              </footer>
            </section>
          )}
        </Show>
      </div>
    </div>
  );
}

function ModeButton(props: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  label: string;
  icon?: JSX.Element;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      class={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold transition disabled:opacity-40 ${
        props.active
          ? "border-orange-500 bg-orange-500/10 text-neutral-100"
          : "border-neutral-800 bg-neutral-900/40 text-neutral-400 hover:border-neutral-700 hover:bg-neutral-900 hover:text-neutral-200"
      }`}
    >
      <Show when={props.icon}>{props.icon}</Show>
      {props.label}
    </button>
  );
}

function Toggle(props: {
  on: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.on}
      onClick={props.onToggle}
      disabled={props.disabled}
      class={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        props.on ? "bg-orange-500" : "bg-neutral-700"
      }`}
    >
      <span
        class={`pointer-events-none block h-4 w-4 rounded-full bg-white transition-transform duration-200 ease-in-out ${
          props.on ? "translate-x-[22px]" : "translate-x-0.5"
        }`}
        style={{ "box-shadow": "0 1px 3px rgba(0,0,0,0.2)" }}
      />
    </button>
  );
}

function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (n: number) => void;
  disabled: boolean;
  accent: string;
  unit?: string;
  format?: (n: number) => string;
  icon?: JSX.Element;
}) {
  return (
    <div>
      <div class="flex items-center justify-between text-sm font-medium text-neutral-300">
        <span class="inline-flex items-center gap-1.5">
          <Show when={props.icon}>{props.icon}</Show>
          {props.label}
        </span>
        <span class={`font-mono text-lg font-bold ${props.accent}`}>
          <Show
            when={props.format}
            fallback={
              <>
                {props.value}
                <Show when={props.unit}>
                  <span class="ml-1 text-sm font-normal text-neutral-400">{props.unit}</span>
                </Show>
              </>
            }
          >
            {(format) => <>{format()(props.value)}</>}
          </Show>
        </span>
      </div>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={props.value}
        onInput={(e) => props.onChange(Number.parseInt(e.currentTarget.value, 10))}
        disabled={props.disabled}
        class="mt-2 w-full accent-orange-500"
      />
    </div>
  );
}

function formatDuration(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m${s}s`;
}

function ActivityLine(props: { event: Activity }) {
  return (
    <div class="flex items-start gap-1.5 py-0.5">
      <Switch>
        <Match when={props.event.kind === "post-created" && props.event}>
          {(e) => (
            <>
              <TbOutlineMessagePlus size={12} class="mt-0.5 shrink-0 text-orange-400" />
              <span>
                <span class="text-neutral-300">u/{e().username}</span>
                <span class="text-neutral-600">: </span>
                <span class="text-neutral-300">"{e().title.slice(0, 80)}"</span>
              </span>
            </>
          )}
        </Match>
        <Match when={props.event.kind === "comment-created" && props.event}>
          {(e) => (
            <>
              <TbOutlineArrowBackUp size={12} class="mt-0.5 shrink-0 text-fuchsia-400" />
              <span>
                <span class="text-neutral-300">u/{e().username}</span>
                <span class="text-neutral-600">: </span>
                <span class="text-neutral-300">"{e().body.slice(0, 80)}"</span>
              </span>
            </>
          )}
        </Match>
        <Match when={props.event.kind === "vote" && props.event}>
          {(e) => (
            <>
              <Show
                when={e().type === "up"}
                fallback={<TbFillArrowBigDown size={12} class="mt-0.5 shrink-0 text-rose-400" />}
              >
                <TbFillArrowBigUp size={12} class="mt-0.5 shrink-0 text-emerald-400" />
              </Show>
              <span>
                <span class="text-neutral-300">u/{e().username}</span>
                <span class="text-neutral-600"> → </span>
                <span class="text-neutral-500">{e().entityId.slice(0, 8)}</span>
                <span class="text-neutral-700"> ({e().result})</span>
              </span>
            </>
          )}
        </Match>
        <Match when={props.event.kind === "tool-error" && props.event}>
          {(e) => (
            <>
              <TbOutlineAlertTriangle size={12} class="mt-0.5 shrink-0 text-rose-400" />
              <span class="text-rose-300">
                <span class="text-neutral-400">{e().tool}</span>{" "}
                <span class="text-neutral-300">u/{e().username}</span>
                <span class="text-neutral-600">: </span>
                {e().error.slice(0, 100)}
              </span>
            </>
          )}
        </Match>
        <Match when={props.event.kind === "phase" && props.event}>
          {(e) => (
            <>
              <Switch
                fallback={
                  <TbOutlinePencil size={12} class="mt-0.5 shrink-0 animate-pulse text-sky-400" />
                }
              >
                <Match when={e().tone === "success"}>
                  <TbOutlineCircleCheck size={12} class="mt-0.5 shrink-0 text-emerald-400" />
                </Match>
                <Match when={e().tone === "start"}>
                  <TbOutlineLoader2 size={12} class="mt-0.5 shrink-0 animate-spin text-orange-400" />
                </Match>
              </Switch>
              <span
                class={
                  e().tone === "success"
                    ? "font-semibold text-emerald-300"
                    : e().tone === "start"
                      ? "font-semibold text-orange-300"
                      : "font-semibold text-sky-300"
                }
              >
                {e().label}
              </span>
            </>
          )}
        </Match>
      </Switch>
    </div>
  );
}

function countAllComments(nodes: CommentNode[]): number {
  let n = 0;
  for (const node of nodes) n += 1 + countAllComments(node.replies);
  return n;
}
