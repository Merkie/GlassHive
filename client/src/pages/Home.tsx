import { createSignal, Show, type JSX } from "solid-js";
import { useNavigate } from "@solidjs/router";
import {
  TbOutlineSparkles,
  TbOutlineLoader2,
  TbOutlineSettings,
  TbOutlineChevronRight,
  TbOutlineUsers,
  TbOutlineClock,
  TbOutlineFileText,
  TbOutlineRefresh,
  TbOutlineRepeat,
  TbOutlineArrowsShuffle,
  TbOutlineBrain,
  TbOutlineHeartbeat,
  TbOutlineCpu,
  TbOutlineAlertTriangle,
  TbOutlineWand,
} from "solid-icons/tb";
import { formatDuration } from "../lib/format";
import Logo from "../components/Logo";
import ActivityFeed from "../components/ActivityFeed";
import KeyGate from "../components/KeyGate";
import SettingsModal from "../components/SettingsModal";
import { clearStoredKey, getStoredKey, type StoredKey } from "../lib/keyStore";
import {
  DEFAULT_MODEL_ID,
  getStoredAgentModel,
  setStoredAgentModel,
  getStoredReportModel,
  setStoredReportModel,
} from "../lib/modelStore";
import { useRunSimulation } from "../hooks/useRunSimulation";

const SAMPLE_SOURCE = `BREAKING: Chinese AI lab DeepSeek has released its flagship V4 model series, featuring a massive 1-million token context window and performance that trails GPT-5.5 by only a few months of development. Dropped overnight on Hugging Face under a permissive MIT license, the 1.6-trillion parameter V4-Pro model delivers frontier-class reasoning at roughly 1/30th the API cost of its Western counterparts. Silicon Valley is reportedly scrambling as the release fundamentally resets the economics of the global AI race.`;

export default function Home() {
  const navigate = useNavigate();

  const [source, setSource] = createSignal(SAMPLE_SOURCE);
  const [agentCount, setAgentCount] = createSignal(10);
  const [maxStepsPerAgent, setMaxStepsPerAgent] = createSignal(12);
  const [durationSec, setDurationSec] = createSignal(30);
  const [mode, setMode] = createSignal<"requeue" | "random">("requeue");
  const [persistentMemory, setPersistentMemory] = createSignal(true);
  const [tailoredAgents, setTailoredAgents] = createSignal(false);
  const [showAdvanced, setShowAdvanced] = createSignal(false);
  const [confirmOpen, setConfirmOpen] = createSignal(false);

  const tailoredHighRisk = () => tailoredAgents() && agentCount() >= 20;

  const [keyBlob, setKeyBlob] = createSignal<StoredKey | null>(getStoredKey());
  const [agentModelId, setAgentModelInternal] = createSignal<string | null>(getStoredAgentModel());
  const [reportModelId, setReportModelInternal] = createSignal<string | null>(
    getStoredReportModel()
  );

  const setAgentModelId = (id: string | null) => {
    setAgentModelInternal(id);
    setStoredAgentModel(id);
  };
  const setReportModelId = (id: string | null) => {
    setReportModelInternal(id);
    setStoredReportModel(id);
  };

  const resetKey = () => {
    clearStoredKey();
    setKeyBlob(null);
  };

  const {
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
  } = useRunSimulation({
    onSaved: (id) => navigate(`/v/${id}`),
    onUnauthorized: resetKey,
  });

  const startRun = () => {
    const text = source().trim();
    if (!text) return;
    const stored = keyBlob();
    if (!stored) return;
    void run({
      source: text,
      encryptedKey: stored.encryptedKey,
      agentCount: agentCount(),
      maxStepsPerAgent: maxStepsPerAgent(),
      durationSec: durationSec(),
      mode: mode(),
      persistentMemory: persistentMemory(),
      tailoredAgents: tailoredAgents(),
      modelId: agentModelId(),
      reportModelId: reportModelId(),
    });
  };

  const submit = () => {
    if (tailoredHighRisk()) {
      setConfirmOpen(true);
      return;
    }
    startRun();
  };

  return (
    <div class="min-h-full w-full">
      <div class="mx-auto max-w-5xl px-6 py-10">
        <header class="mb-8 flex items-start justify-between gap-4">
          <div>
            <Logo />
            <p class="mt-3 mb-2 text-sm text-neutral-400">
              Drop in source material. Watch a roomful of AI agents argue about it in a fake comment
              section.
            </p>
          </div>
          <div class="flex items-center gap-2">
            <Show when={keyBlob()}>
              {(blob) => (
                <SettingsModal
                  keyBlob={blob()}
                  agentModelId={agentModelId()}
                  reportModelId={reportModelId()}
                  onChangeAgentModel={setAgentModelId}
                  onChangeReportModel={setReportModelId}
                  onResetKey={resetKey}
                  disabled={loading()}
                />
              )}
            </Show>
          </div>
        </header>

        <Show when={!keyBlob()}>
          <KeyGate onSaved={setKeyBlob} />
        </Show>

        <Show when={keyBlob()}>
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
              <div>
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
                <Show when={tailoredHighRisk()}>
                  <p class="mt-2 inline-flex items-start gap-1 text-[11px] text-amber-400">
                    <TbOutlineAlertTriangle size={12} class="mt-0.5 shrink-0" />
                    <span>
                      Tailored generation can hallucinate or repeat archetypes at 20+ agents.
                    </span>
                  </p>
                </Show>
              </div>
              <Slider
                label="Simulation duration"
                value={durationSec()}
                min={10}
                max={300}
                step={10}
                onChange={setDurationSec}
                disabled={loading()}
                accent="text-orange-400"
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
                  style={{
                    transform: showAdvanced() ? "rotate(90deg)" : "rotate(0deg)",
                  }}
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
                    accent="text-orange-400"
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

                  <div>
                    <label class="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-300">
                      <TbOutlineWand size={16} class="text-neutral-500" />
                      Generate tailored agents
                      <span class="ml-1 inline-flex items-center rounded border border-orange-500/40 bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-300">
                        Experimental
                      </span>
                    </label>
                    <div class="mt-2 flex items-center gap-3">
                      <Toggle
                        on={tailoredAgents()}
                        disabled={loading()}
                        onToggle={() => setTailoredAgents((v) => !v)}
                      />
                      <span class="text-sm font-semibold text-neutral-200">
                        {tailoredAgents() ? "On" : "Off"}
                      </span>
                    </div>
                    <p class="mt-2 text-xs italic text-neutral-500">
                      {tailoredAgents()
                        ? "Generates a custom roster of personas tailored to the source instead of sampling the on-disk pool"
                        : "Samples random personas from the on-disk pool"}
                    </p>
                  </div>
                </div>
              </Show>
            </div>

            <div class="mt-5 flex items-center justify-between gap-4">
              <div class="flex min-w-0 flex-col gap-1 text-[11px] text-neutral-500">
                <span
                  class="inline-flex min-w-0 items-center gap-1.5 font-mono"
                  title="Model used by every agent in the room"
                >
                  <TbOutlineCpu size={14} class="shrink-0 text-neutral-600" />
                  <span class="shrink-0 text-neutral-400">Agent model</span>
                  <span class="truncate">{agentModelId() ?? DEFAULT_MODEL_ID}</span>
                </span>
                <span
                  class="inline-flex min-w-0 items-center gap-1.5 font-mono"
                  title="Model used to write the post-run report"
                >
                  <TbOutlineFileText size={14} class="shrink-0 text-neutral-600" />
                  <span class="shrink-0 text-neutral-400">Report model</span>
                  <span class="truncate">{reportModelId() ?? DEFAULT_MODEL_ID}</span>
                </span>
              </div>
              <button
                type="button"
                onClick={submit}
                disabled={loading() || !source().trim() || !keyBlob()}
                class="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-6 py-3 text-sm font-semibold text-black shadow-lg shadow-orange-500/20 transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Show when={loading()} fallback={<TbOutlineSparkles size={18} />}>
                  <TbOutlineLoader2 size={18} class="animate-spin" />
                </Show>
                {loading()
                  ? generatingAgents()
                    ? "Generating agents…"
                    : reporting()
                      ? "Finishing up…"
                      : "The room is talking…"
                  : "Generate"}
              </button>
            </div>
          </section>
        </Show>

        <Show when={error()}>
          <div class="mt-6 rounded-lg border border-rose-900/60 bg-rose-950/40 p-4 text-sm text-rose-300">
            {error()}
          </div>
        </Show>

        <ActivityFeed
          activity={activity()}
          doneAgents={doneAgents()}
          collapsed={logCollapsed()}
          setCollapsed={setLogCollapsed}
          remainingSec={remainingSec()}
          isLive={loading()}
        />
      </div>

      <Show when={confirmOpen()}>
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div class="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-6 shadow-2xl">
            <div class="flex items-start gap-3">
              <TbOutlineAlertTriangle size={20} class="mt-0.5 shrink-0 text-amber-400" />
              <div>
                <h2 class="text-base font-semibold text-neutral-100">
                  Generate {agentCount()} tailored agents?
                </h2>
                <p class="mt-2 text-sm text-neutral-400">
                  At 20+ agents the model can hallucinate or repeat archetypes, which makes the
                  room less useful. Lower the count for cleaner output, or continue if you know
                  what you're trading.
                </p>
              </div>
            </div>
            <div class="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                class="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-300 transition hover:border-neutral-700 hover:bg-neutral-800 hover:text-neutral-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmOpen(false);
                  startRun();
                }}
                class="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-orange-400"
              >
                <TbOutlineSparkles size={16} />
                Generate anyway
              </button>
            </div>
          </div>
        </div>
      </Show>
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

function Toggle(props: { on: boolean; disabled: boolean; onToggle: () => void }) {
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
