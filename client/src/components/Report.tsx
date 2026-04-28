import { Show } from "solid-js";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { TbOutlineDownload } from "solid-icons/tb";
import { downloadFile } from "../lib/format";

export default function Report(props: { markdown: string | null | undefined }) {
  return (
    <Show when={props.markdown}>
      {(md) => (
        <section class="mt-10">
          <div class="mb-3 flex flex-wrap items-baseline justify-between gap-3">
            <h2 class="text-sm font-semibold uppercase tracking-widest text-neutral-500">
              the report
            </h2>
            <button
              type="button"
              onClick={() => downloadFile("glasshive-report.md", md(), "text/markdown")}
              class="inline-flex items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-300 hover:border-neutral-600 hover:bg-neutral-800"
            >
              <TbOutlineDownload size={14} />
              Export Markdown
            </button>
          </div>
          <div
            class="report-md rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6"
            innerHTML={DOMPurify.sanitize(marked.parse(md(), { async: false }) as string)}
          />
        </section>
      )}
    </Show>
  );
}
