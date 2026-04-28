import { For, Show } from "solid-js";
import { TbOutlineDownload } from "solid-icons/tb";
import type { SimulationResult } from "../types";
import { downloadJson, fmtUsd, karmaColor, countAllComments } from "../lib/format";
import CommentTree from "./CommentTree";

export default function Thread(props: { result: SimulationResult }) {
  return (
    <section class="mt-10">
      <div class="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <h2 class="text-sm font-semibold uppercase tracking-widest text-neutral-500">
          the thread
        </h2>
        <button
          type="button"
          onClick={() => downloadJson("glasshive-thread.json", props.result)}
          class="inline-flex items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-300 hover:border-neutral-600 hover:bg-neutral-800"
        >
          <TbOutlineDownload size={14} />
          Export JSON
        </button>
      </div>

      <Show
        when={props.result.snapshot.posts.length > 0}
        fallback={
          <p class="rounded-xl border border-amber-900/60 bg-amber-950/30 p-4 text-sm text-amber-300">
            The room logged on but no one posted. Try giving the agents more
            steps or duration.
          </p>
        }
      >
        <div class="flex flex-col gap-6">
          <For each={props.result.snapshot.posts}>
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
          <span class="text-emerald-400">{fmtUsd(props.result.totals.costUsd)}</span>
          <span class="text-neutral-700"> · </span>
          tokens in={props.result.totals.inputTokens.toLocaleString()} out=
          {props.result.totals.outputTokens.toLocaleString()}
        </div>
        <div>
          {props.result.totals.posts} posts · {props.result.totals.comments} comments ·{" "}
          {(props.result.totals.elapsedMs / 1000).toFixed(1)}s
        </div>
      </footer>
    </section>
  );
}
