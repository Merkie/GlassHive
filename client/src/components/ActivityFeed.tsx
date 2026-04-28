import { createEffect, createMemo, For, Show } from "solid-js";
import {
  TbOutlineMessagePlus,
  TbOutlineMessageCircle,
  TbOutlineBolt,
  TbOutlineAlertTriangle,
  TbOutlineUsers,
  TbOutlineClock,
  TbOutlineChevronRight,
} from "solid-icons/tb";
import type { Activity, AgentResult } from "../types";
import { formatDuration } from "../lib/format";
import ActivityLine from "./ActivityLine";

export default function ActivityFeed(props: {
  activity: Activity[];
  doneAgents: AgentResult[];
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  // null when not running. Set to a positive number to show "remaining" counter.
  remainingSec: number | null;
  // when true, the "Hide" button is suppressed (the feed should stay open while
  // the simulation is in flight).
  isLive: boolean;
}) {
  let logRef: HTMLDivElement | undefined;
  createEffect(() => {
    props.activity;
    if (logRef) logRef.scrollTop = logRef.scrollHeight;
  });

  const stats = createMemo(() => {
    const a = props.activity;
    return {
      posts: a.filter((e) => e.kind === "post-created").length,
      comments: a.filter((e) => e.kind === "comment-created").length,
      votes: a.filter((e) => e.kind === "vote").length,
      errors: a.filter((e) => e.kind === "tool-error").length,
    };
  });

  return (
    <>
      <Show when={!props.collapsed && props.activity.length > 0}>
        <section class="mt-8 rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 font-mono text-xs text-neutral-400">
          <div class="mb-2 flex flex-wrap items-center gap-4">
            <Show when={props.remainingSec !== null}>
              <Show
                when={props.remainingSec! > 0}
                fallback={
                  <span class="inline-flex animate-pulse items-center gap-1.5">
                    <TbOutlineClock size={14} class="text-sky-400" />
                    <span class="text-sky-400">Waiting…</span>
                  </span>
                }
              >
                <span class="inline-flex items-center gap-1.5">
                  <TbOutlineClock size={14} class="text-sky-400" />
                  <span class="text-sky-400 tabular-nums">
                    {formatDuration(props.remainingSec!)}
                  </span>
                  <span>remaining</span>
                </span>
              </Show>
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
              Agent lifecycles: <span class="text-neutral-200">{props.doneAgents.length}</span>
            </span>
            <Show when={!props.isLive && props.activity.length > 0}>
              <button
                type="button"
                onClick={() => props.setCollapsed(true)}
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
              <For each={props.activity.slice(-80)}>{(e) => <ActivityLine event={e} />}</For>
            </div>
          </div>
        </section>
      </Show>

      <Show when={props.collapsed && props.activity.length > 0}>
        <button
          type="button"
          onClick={() => props.setCollapsed(false)}
          class="mt-3 inline-flex items-center gap-1.5 font-mono text-xs text-neutral-500 hover:text-neutral-300"
        >
          <TbOutlineChevronRight size={14} />
          Show activity log ({props.activity.length} events)
        </button>
      </Show>
    </>
  );
}
