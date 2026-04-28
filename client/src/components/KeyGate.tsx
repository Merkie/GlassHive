import { createSignal, Show } from "solid-js";
import { TbOutlineKey, TbOutlineLoader2 } from "solid-icons/tb";
import { setStoredKey, type StoredKey } from "../lib/keyStore";

export default function KeyGate(props: { onSaved: (blob: StoredKey) => void }) {
  const [value, setValue] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const submit = async () => {
    const key = value().trim();
    if (!key) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/encrypt-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? `Request failed (${res.status})`);
        return;
      }
      const blob: StoredKey = {
        encryptedKey: data.encryptedKey,
        mode: data.mode === "admin" ? "admin" : "user",
      };
      setStoredKey(blob);
      props.onSaved(blob);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section class="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-6 shadow-xl">
      <label class="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-300">
        <TbOutlineKey size={16} class="text-neutral-500" />
        OpenRouter API key
      </label>
      <p class="mt-1 text-xs text-neutral-500">
        GlassHive uses your own OpenRouter credit. Paste a key (
        <code class="text-neutral-400">sk-or-v1-…</code>) or the host admin
        password. The key is encrypted on the server and stored only in this
        browser.
      </p>
      <input
        type="password"
        value={value()}
        onInput={(e) => setValue(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        disabled={submitting()}
        placeholder="sk-or-v1-…"
        class="mt-3 w-full rounded-lg border border-neutral-800 bg-neutral-950/70 p-3 font-mono text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-orange-500"
        autocomplete="off"
        spellcheck={false}
      />
      <Show when={error()}>
        <p class="mt-2 text-sm text-rose-400">{error()}</p>
      </Show>
      <div class="mt-4 flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={submitting() || !value().trim()}
          class="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-6 py-3 text-sm font-semibold text-black shadow-lg shadow-orange-500/20 transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Show when={submitting()} fallback={<TbOutlineKey size={18} />}>
            <TbOutlineLoader2 size={18} class="animate-spin" />
          </Show>
          {submitting() ? "Saving…" : "Save key"}
        </button>
      </div>
    </section>
  );
}
