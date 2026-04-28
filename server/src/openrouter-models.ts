// Cache of OpenRouter's /api/v1/models response. Refetched every 5 minutes,
// served from memory in between. The /api/models endpoint paginates and
// searches over this cache; the trimmed shape that goes to the client drops
// fields the picker doesn't render.

export interface OpenRouterModel {
  id: string;
  canonical_slug?: string;
  name: string;
  description?: string;
  created?: number;
  context_length?: number;
  architecture?: {
    modality?: string;
    input_modalities?: string[];
    output_modalities?: string[];
    tokenizer?: string;
  };
  pricing?: {
    prompt?: string;
    completion?: string;
    [key: string]: unknown;
  };
  top_provider?: {
    context_length?: number;
    max_completion_tokens?: number;
    is_moderated?: boolean;
  };
  // Strings like "tools", "tool_choice", "temperature", etc. We require
  // "tools" because the simulation is built entirely on tool calls — a
  // model without it errors instantly on every session.
  supported_parameters?: string[];
  [key: string]: unknown;
}

export interface OpenRouterModelSummary {
  id: string;
  name: string;
  description: string;
  contextLength: number;
  pricing: { prompt: string; completion: string };
  created: number;
}

const OPENROUTER_URL =
  "https://openrouter.ai/api/v1/models?input_modalities=text";
const CACHE_TTL_MS = 5 * 60 * 1000;

interface ModelsCache {
  models: OpenRouterModel[];
  fetchedAt: number;
}

let cache: ModelsCache | null = null;
let inflight: Promise<OpenRouterModel[]> | null = null;

async function fetchFromOpenRouter(): Promise<OpenRouterModel[]> {
  const res = await fetch(OPENROUTER_URL, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`OpenRouter models API returned ${res.status}`);
  }
  const json = (await res.json()) as { data?: OpenRouterModel[] };
  return json.data ?? [];
}

// De-dupes concurrent calls via a shared inflight promise. On fetch failure,
// returns stale cache if available so a transient OpenRouter blip doesn't
// break the picker.
export async function getAllOpenRouterModels(): Promise<OpenRouterModel[]> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.models;
  }
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const models = await fetchFromOpenRouter();
      cache = { models, fetchedAt: Date.now() };
      return models;
    } catch (err) {
      console.warn("Failed to fetch OpenRouter models:", err);
      if (cache) return cache.models;
      throw err;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export async function searchOpenRouterModels(opts: {
  search?: string;
  offset?: number;
  limit?: number;
  requireTools?: boolean;
}): Promise<{
  models: OpenRouterModel[];
  hasMore: boolean;
  nextOffset: number | null;
  total: number;
}> {
  const all = await getAllOpenRouterModels();
  const search = (opts.search ?? "").trim().toLowerCase();
  const offset = Math.max(0, opts.offset ?? 0);
  const limit = Math.max(1, Math.min(100, opts.limit ?? 30));

  const toolCapable = opts.requireTools
    ? all.filter((m) => (m.supported_parameters ?? []).includes("tools"))
    : all;

  const filtered = search
    ? toolCapable.filter((m) => {
        if (m.id.toLowerCase().includes(search)) return true;
        if (m.name?.toLowerCase().includes(search)) return true;
        if (m.description?.toLowerCase().includes(search)) return true;
        return false;
      })
    : toolCapable;

  const page = filtered.slice(offset, offset + limit);
  const hasMore = offset + limit < filtered.length;

  return {
    models: page,
    hasMore,
    nextOffset: hasMore ? offset + limit : null,
    total: filtered.length,
  };
}

export function trimModelForClient(m: OpenRouterModel): OpenRouterModelSummary {
  return {
    id: m.id,
    name: m.name,
    description: m.description ?? "",
    contextLength: m.context_length ?? m.top_provider?.context_length ?? 0,
    pricing: {
      prompt: m.pricing?.prompt ?? "0",
      completion: m.pricing?.completion ?? "0",
    },
    created: m.created ?? 0,
  };
}
