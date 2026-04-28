import { createResource, createSignal, Show } from "solid-js";
import { useParams } from "@solidjs/router";
import { TbOutlineLoader2 } from "solid-icons/tb";
import type { RunRecord, SimulationResult } from "../types";
import Logo from "../components/Logo";
import ActivityFeed from "../components/ActivityFeed";
import Report from "../components/Report";
import Thread from "../components/Thread";

async function fetchRun(id: string): Promise<RunRecord> {
  const res = await fetch(`/api/runs/${encodeURIComponent(id)}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status}: ${body || "failed to load run"}`);
  }
  return (await res.json()) as RunRecord;
}

export default function View() {
  const params = useParams<{ id: string }>();
  const [run] = createResource(() => params.id, fetchRun);
  const [logCollapsed, setLogCollapsed] = createSignal(false);

  return (
    <div class="min-h-full w-full">
      <div class="mx-auto max-w-5xl px-6 py-10">
        <header class="mb-8 flex items-baseline justify-between">
          <div>
            <Logo linkToHome />
          </div>
        </header>

        <Show
          when={!run.loading && !run.error && run()}
          fallback={
            <Show
              when={run.error}
              fallback={
                <div class="flex items-center gap-2 text-sm text-neutral-400">
                  <TbOutlineLoader2 size={16} class="animate-spin" />
                  Loading run…
                </div>
              }
            >
              <div class="rounded-lg border border-rose-900/60 bg-rose-950/40 p-4 text-sm text-rose-300">
                {run.error instanceof Error ? run.error.message : String(run.error)}
              </div>
            </Show>
          }
        >
          {(record) => {
            const result = (): SimulationResult => ({
              id: record().id,
              source: record().source,
              participants: record().participants,
              agentResults: record().agentResults,
              snapshot: record().snapshot,
              report: record().report,
              totals: record().totals,
            });
            return (
              <>
                <ActivityFeed
                  activity={record().activity}
                  doneAgents={record().agentResults}
                  collapsed={logCollapsed()}
                  setCollapsed={setLogCollapsed}
                  remainingSec={null}
                  isLive={false}
                />

                <Report markdown={record().report} />

                <Thread result={result()} />
              </>
            );
          }}
        </Show>
      </div>
    </div>
  );
}
