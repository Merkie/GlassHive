import { createSignal, createEffect, onCleanup, Show } from "solid-js";
import {
  TbOutlineSettings,
  TbOutlineX,
  TbOutlineKey,
  TbOutlineCpu,
  TbOutlineRefresh,
  TbOutlineTrash,
} from "solid-icons/tb";
import ModelPicker from "./ModelPicker";
import { DEFAULT_MODEL_ID } from "../lib/modelStore";
import type { StoredKey } from "../lib/keyStore";

interface Props {
  keyBlob: StoredKey;
  modelId: string | null;
  onChangeModel: (id: string | null) => void;
  onResetKey: () => void;
  disabled?: boolean;
}

export default function SettingsModal(props: Props) {
  const [open, setOpen] = createSignal(false);
  const [pickerOpen, setPickerOpen] = createSignal(false);

  // Esc closes the settings modal (the picker handles its own Esc).
  createEffect(() => {
    if (!open() || pickerOpen()) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    onCleanup(() => window.removeEventListener("keydown", handler));
  });

  const removeKey = () => {
    props.onResetKey();
    setOpen(false);
  };

  const resetModel = () => {
    props.onChangeModel(null);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={props.disabled}
        title="Settings"
        class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-neutral-800 bg-neutral-900/60 px-3 py-1.5 text-xs font-medium text-neutral-400 transition hover:border-neutral-700 hover:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <TbOutlineSettings size={14} class="text-neutral-500" />
        Settings
      </button>

      <Show when={open()}>
        <div
          class="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div class="flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl">
            <div class="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
              <h2 class="inline-flex items-center gap-2 text-base font-semibold text-neutral-100">
                <TbOutlineSettings size={16} class="text-neutral-500" />
                Settings
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                class="flex h-7 w-7 items-center justify-center rounded-md text-neutral-500 transition hover:bg-neutral-900 hover:text-neutral-200"
                aria-label="Close"
              >
                <TbOutlineX size={16} />
              </button>
            </div>

            <div class="space-y-5 px-5 py-5">
              <section>
                <div class="flex items-center justify-between">
                  <label class="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-300">
                    <TbOutlineCpu size={14} class="text-neutral-500" />
                    Model
                  </label>
                  <Show when={props.modelId}>
                    <button
                      type="button"
                      onClick={resetModel}
                      class="inline-flex items-center gap-1 text-[11px] text-neutral-500 transition hover:text-neutral-300"
                      title="Reset to default model"
                    >
                      <TbOutlineRefresh size={12} />
                      Reset
                    </button>
                  </Show>
                </div>
                <div class="mt-2 flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900/40 p-2.5">
                  <span class="min-w-0 flex-1 truncate font-mono text-[11px] text-neutral-300">
                    {props.modelId ?? DEFAULT_MODEL_ID}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    class="shrink-0 rounded-md border border-neutral-800 bg-neutral-950 px-2.5 py-1 text-xs font-medium text-neutral-300 transition hover:border-neutral-700 hover:bg-neutral-900"
                  >
                    Change
                  </button>
                </div>
                <Show when={!props.modelId}>
                  <p class="mt-1.5 text-[11px] italic text-neutral-500">
                    Default model. Pick another to override.
                  </p>
                </Show>
              </section>

              <section>
                <label class="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-300">
                  <TbOutlineKey size={14} class="text-neutral-500" />
                  OpenRouter key
                </label>
                <div class="mt-2 flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900/40 p-2.5">
                  <span class="min-w-0 flex-1 truncate text-xs text-neutral-300">
                    {props.keyBlob.mode === "admin" ? "Host admin" : "Your OpenRouter key"}
                  </span>
                  <button
                    type="button"
                    onClick={removeKey}
                    class="inline-flex shrink-0 items-center gap-1 rounded-md border border-rose-900/60 bg-rose-950/30 px-2.5 py-1 text-xs font-medium text-rose-300 transition hover:border-rose-800 hover:bg-rose-950/60"
                  >
                    <TbOutlineTrash size={12} />
                    Remove
                  </button>
                </div>
                <p class="mt-1.5 text-[11px] italic text-neutral-500">
                  {props.keyBlob.mode === "admin"
                    ? "Using the host's OpenRouter key via admin password."
                    : "Stored encrypted in your browser. Remove to enter a different key."}
                </p>
              </section>
            </div>
          </div>
        </div>
      </Show>

      <ModelPicker
        value={props.modelId}
        onChange={props.onChangeModel}
        open={pickerOpen()}
        onClose={() => setPickerOpen(false)}
      />
    </>
  );
}
