import { createSignal, createEffect, onCleanup, For, Show } from "solid-js";
import {
  TbOutlineX,
  TbOutlineSearch,
  TbOutlineRefresh,
  TbOutlineLoader2,
  TbOutlineExternalLink,
} from "solid-icons/tb";

interface ModelSummary {
  id: string;
  name: string;
  description: string;
  contextLength: number;
  pricing: { prompt: string; completion: string };
  created: number;
}

interface Props {
  value: string | null;
  onChange: (id: string | null) => void;
  open: boolean;
  onClose: () => void;
  title?: string;
}

const PAGE_LIMIT = 30;

function formatContext(n: number): string {
  if (!n) return "—";
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}M`;
  }
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

function pricePerMillion(perToken: string): number {
  const val = Number.parseFloat(perToken) * 1_000_000;
  return Number.isFinite(val) ? val : 0;
}

function formatPricePerMillion(perToken: string): string {
  return `$${pricePerMillion(perToken).toFixed(2)}`;
}

// Output price per 1M tokens drives the color: ≤$5 green, ≤$15 amber, >$15 rose.
function priceTierColor(out: number): string {
  if (out <= 5) return "text-emerald-400";
  if (out <= 15) return "text-amber-400";
  return "text-rose-400";
}

export default function ModelPicker(props: Props) {
  const [models, setModels] = createSignal<ModelSummary[]>([]);
  const [search, setSearch] = createSignal("");
  const [nextOffset, setNextOffset] = createSignal<number | null>(0);
  const [hasMore, setHasMore] = createSignal(false);
  const [isLoading, setIsLoading] = createSignal(false);
  const [isLoadingMore, setIsLoadingMore] = createSignal(false);
  const [error, setError] = createSignal("");

  let searchDebounce: ReturnType<typeof setTimeout> | null = null;
  let loadedOnce = false;

  async function fetchPage(args: { offset: number; search: string; append: boolean }) {
    if (args.append) setIsLoadingMore(true);
    else setIsLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        offset: String(args.offset),
        limit: String(PAGE_LIMIT),
        requireTools: "true",
      });
      if (args.search) params.set("search", args.search);
      const res = await fetch(`/api/models?${params.toString()}`);
      if (!res.ok) {
        setError("Failed to load models");
        return;
      }
      const payload = await res.json();
      const incoming: ModelSummary[] = payload.models ?? [];
      if (args.append) setModels((prev) => [...prev, ...incoming]);
      else setModels(incoming);
      setHasMore(!!payload.hasMore);
      setNextOffset(payload.nextOffset);
    } catch {
      setError("Failed to load models");
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }

  // Lazy: fetch the first page the first time the modal opens.
  createEffect(() => {
    if (props.open && !loadedOnce) {
      loadedOnce = true;
      void fetchPage({ offset: 0, search: "", append: false });
    }
  });

  // Esc closes the modal.
  createEffect(() => {
    if (!props.open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", handler);
    onCleanup(() => window.removeEventListener("keydown", handler));
  });

  onCleanup(() => {
    if (searchDebounce) clearTimeout(searchDebounce);
  });

  const onSearchInput = (value: string) => {
    setSearch(value);
    if (searchDebounce) clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      void fetchPage({ offset: 0, search: value, append: false });
    }, 300);
  };

  const onScroll = (e: Event) => {
    const target = e.currentTarget as HTMLDivElement;
    const scrollBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    const offset = nextOffset();
    if (scrollBottom < 200 && hasMore() && !isLoadingMore() && offset != null) {
      void fetchPage({ offset, search: search(), append: true });
    }
  };

  const select = (id: string | null) => {
    props.onChange(id);
    props.onClose();
  };

  return (
    <Show when={props.open}>
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) props.onClose();
        }}
      >
          <div class="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl">
            <div class="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
              <h2 class="text-base font-semibold text-neutral-100">{props.title ?? "Pick a model"}</h2>
              <button
                type="button"
                onClick={() => props.onClose()}
                class="flex h-7 w-7 items-center justify-center rounded-md text-neutral-500 transition hover:bg-neutral-900 hover:text-neutral-200"
                aria-label="Close"
              >
                <TbOutlineX size={16} />
              </button>
            </div>

            <div class="border-b border-neutral-800 px-5 py-3">
              <div class="relative">
                <TbOutlineSearch
                  size={14}
                  class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
                />
                <input
                  type="text"
                  value={search()}
                  onInput={(e) => onSearchInput(e.currentTarget.value)}
                  placeholder="Search by name, id, or description…"
                  class="w-full rounded-lg border border-neutral-800 bg-neutral-900/60 py-2 pl-9 pr-3 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-600 focus:border-orange-500"
                  autofocus
                />
              </div>
            </div>

            <div class="flex-1 overflow-y-auto" onScroll={onScroll}>
              <Show when={error()}>
                <div class="mx-5 mt-3 rounded border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-xs text-rose-400">
                  {error()}
                </div>
              </Show>

              <Show
                when={!isLoading()}
                fallback={
                  <div class="flex items-center justify-center py-12">
                    <TbOutlineLoader2 size={24} class="animate-spin text-orange-500" />
                  </div>
                }
              >
                <Show
                  when={models().length > 0}
                  fallback={
                    <div class="px-5 py-12 text-center text-sm text-neutral-500">
                      No models match "{search()}"
                    </div>
                  }
                >
                  <For each={models()}>
                    {(model) => (
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => select(model.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            select(model.id);
                          }
                        }}
                        class="flex w-full cursor-pointer items-start gap-3 border-b border-neutral-900 px-5 py-3 text-left transition hover:bg-neutral-900/50"
                        classList={{
                          "bg-orange-500/5": props.value === model.id,
                        }}
                      >
                        <div class="min-w-0 flex-1">
                          <div class="flex items-center gap-2">
                            <span class="truncate text-sm font-medium text-neutral-100">
                              {model.name}
                            </span>
                            <Show when={props.value === model.id}>
                              <span class="rounded bg-orange-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-orange-400">
                                Current
                              </span>
                            </Show>
                          </div>
                          <div class="mt-0.5 truncate font-mono text-[11px] text-neutral-500">
                            {model.id}
                          </div>
                          <Show when={model.description}>
                            <p class="mt-1.5 line-clamp-2 text-xs leading-relaxed text-neutral-400">
                              {model.description}
                            </p>
                          </Show>
                        </div>
                        <div class="flex shrink-0 flex-col items-end justify-between gap-2 self-stretch text-right text-[11px] text-neutral-500">
                          <div>
                            <div class="whitespace-nowrap">
                              <span class="font-mono text-neutral-300">
                                {formatContext(model.contextLength)}
                              </span>
                              <span class="ml-1 text-neutral-500">ctx</span>
                            </div>
                            <div
                              class={`mt-1.5 whitespace-nowrap ${priceTierColor(pricePerMillion(model.pricing.completion))}`}
                            >
                              <span class="font-mono">
                                {formatPricePerMillion(model.pricing.prompt)}
                              </span>
                              <span> /M in</span>
                              <span class="mx-1 text-neutral-700">·</span>
                              <span class="font-mono">
                                {formatPricePerMillion(model.pricing.completion)}
                              </span>
                              <span> /M out</span>
                            </div>
                          </div>
                          <a
                            href={`https://openrouter.ai/${model.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            class="inline-flex items-center gap-1 rounded border border-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-500 transition hover:border-orange-500/50 hover:bg-neutral-900 hover:text-orange-400"
                          >
                            <TbOutlineExternalLink size={11} />
                            View on OpenRouter
                          </a>
                        </div>
                      </div>
                    )}
                  </For>

                  <Show when={isLoadingMore()}>
                    <div class="flex items-center justify-center gap-2 py-4 text-xs text-neutral-500">
                      <TbOutlineLoader2 size={12} class="animate-spin" />
                      Loading more…
                    </div>
                  </Show>

                  <Show when={!hasMore() && !isLoadingMore() && models().length > 0}>
                    <div class="py-4 text-center text-[11px] text-neutral-600">End of list</div>
                  </Show>
                </Show>
              </Show>
            </div>

            <div class="flex items-center justify-between gap-3 border-t border-neutral-800 px-5 py-3">
              <button
                type="button"
                class="inline-flex items-center gap-1.5 px-2 py-2 text-xs text-neutral-500 transition hover:text-neutral-300"
                onClick={() => select(null)}
              >
                <TbOutlineRefresh size={14} />
                Reset to default
              </button>
              <button
                type="button"
                class="rounded-lg border border-neutral-800 px-4 py-2 text-sm text-neutral-300 transition hover:border-neutral-700 hover:bg-neutral-900"
                onClick={() => props.onClose()}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </Show>
  );
}
