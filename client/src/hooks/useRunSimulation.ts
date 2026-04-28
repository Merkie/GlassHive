import { createSignal, onCleanup } from "solid-js";
import type { Activity, AgentResult } from "../types";
import {
  openRunStream,
  RunStreamHttpError,
  RunStreamUnauthorizedError,
  type RunStreamEvent,
  type RunStreamInput,
} from "../lib/runStream";

export type UseRunSimulationOptions = {
  onSaved?: (id: string) => void;
  onUnauthorized?: () => void;
};

export function useRunSimulation(opts: UseRunSimulationOptions = {}) {
  const [loading, setLoading] = createSignal(false);
  const [generatingAgents, setGeneratingAgents] = createSignal(false);
  const [reporting, setReporting] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [activity, setActivity] = createSignal<Activity[]>([]);
  const [doneAgents, setDoneAgents] = createSignal<AgentResult[]>([]);
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

  const handleEvent = (event: RunStreamEvent) => {
    switch (event.name) {
      case "activity":
        setActivity((arr) => [...arr, event.data]);
        return;
      case "agent-done":
        setDoneAgents((arr) => [...arr, event.data]);
        return;
      case "agents-generating-start":
        setGeneratingAgents(true);
        setActivity((arr) => [
          ...arr,
          {
            kind: "phase",
            label: `Generating ${event.data.count} tailored agents…`,
            tone: "info",
          },
        ]);
        return;
      case "agents-generating-done":
        setGeneratingAgents(false);
        setActivity((arr) => [
          ...arr,
          {
            kind: "phase",
            label: `Generated ${event.data.count} tailored agents`,
            tone: "success",
          },
        ]);
        return;
      case "simulation-complete":
        stopTimer();
        setActivity((arr) => [
          ...arr,
          {
            kind: "phase",
            label: `Simulation complete — ${event.data.posts} posts, ${event.data.comments} comments`,
            tone: "success",
          },
        ]);
        return;
      case "report-start":
        setReporting(true);
        setActivity((arr) => [...arr, { kind: "phase", label: "Writing report…", tone: "info" }]);
        return;
      case "report-done":
        setReporting(false);
        if (event.data.markdown) {
          setActivity((arr) => [...arr, { kind: "phase", label: "Report ready", tone: "success" }]);
        } else {
          setActivity((arr) => [
            ...arr,
            {
              kind: "phase",
              label: `Report skipped${event.data.error ? `: ${event.data.error}` : ""}`,
              tone: "info",
            },
          ]);
        }
        return;
      case "error":
        setError(event.data.error ?? "unknown error");
        return;
      case "start":
      case "saved":
      case "done":
        return;
    }
  };

  const run = async (input: RunStreamInput) => {
    setLoading(true);
    setGeneratingAgents(false);
    setReporting(false);
    setError(null);
    setActivity([{ kind: "phase", label: "Starting simulation…", tone: "start" }]);
    setDoneAgents([]);
    setLogCollapsed(false);
    startTimer(input.durationSec);

    let savedId: string | null = null;
    try {
      for await (const event of openRunStream(input)) {
        if (event.name === "saved") {
          savedId = event.data.id;
        }
        handleEvent(event);
      }
      if (savedId) opts.onSaved?.(savedId);
    } catch (err) {
      if (err instanceof RunStreamUnauthorizedError) {
        opts.onUnauthorized?.();
        setError(err.message);
      } else if (err instanceof RunStreamHttpError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      stopTimer();
      setLoading(false);
      setGeneratingAgents(false);
      setReporting(false);
    }
  };

  onCleanup(stopTimer);

  return {
    loading,
    generatingAgents,
    reporting,
    error,
    activity,
    doneAgents,
    logCollapsed,
    setLogCollapsed,
    remainingSec,
    run,
  };
}
