import { Show } from "solid-js";

export default function Source(props: { source: string | null | undefined }) {
  return (
    <Show when={props.source && props.source.trim().length > 0 ? props.source : null}>
      {(text) => (
        <section class="mt-10">
          <div class="mb-3">
            <h2 class="text-sm font-semibold uppercase tracking-widest text-neutral-500">
              the source material
            </h2>
          </div>
          <div class="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6">
            <p class="whitespace-pre-wrap font-mono text-sm leading-relaxed text-white">
              {text()}
            </p>
          </div>
          <div class="mt-10 border-t border-neutral-800" />
        </section>
      )}
    </Show>
  );
}
