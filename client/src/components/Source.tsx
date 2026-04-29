import { For, Show } from "solid-js";

export default function Source(props: {
  source: string | null | undefined;
  imageUrls?: string[];
}) {
  const hasText = () => Boolean(props.source && props.source.trim().length > 0);
  const images = () => props.imageUrls ?? [];
  const hasImages = () => images().length > 0;

  return (
    <Show when={hasText() || hasImages()}>
      <section class="mt-10">
        <div class="mb-3">
          <h2 class="text-sm font-semibold uppercase tracking-widest text-neutral-500">
            the source material
          </h2>
        </div>
        <div class="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6">
          <Show when={hasText()}>
            <p class="whitespace-pre-wrap font-mono text-sm leading-relaxed text-white">
              {props.source}
            </p>
          </Show>
          <Show when={hasImages()}>
            <div
              class="flex flex-wrap gap-3"
              classList={{ "mt-5 border-t border-neutral-800/60 pt-5": hasText() }}
            >
              <For each={images()}>
                {(url) => (
                  <a href={url} target="_blank" rel="noreferrer" class="group block">
                    <img
                      src={url}
                      alt=""
                      class="h-32 w-32 rounded-lg border border-neutral-800 object-cover transition group-hover:border-neutral-600"
                      loading="lazy"
                    />
                  </a>
                )}
              </For>
            </div>
          </Show>
        </div>
        <div class="mt-10 border-t border-neutral-800" />
      </section>
    </Show>
  );
}
