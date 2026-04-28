import { For, Show } from "solid-js";
import type { CommentNode } from "../types";
import { karmaColor } from "../lib/format";

export default function CommentTree(props: { nodes: CommentNode[]; depth: number }) {
  return (
    <div class={props.depth === 0 ? "" : "ml-4 border-l border-neutral-800 pl-3"}>
      <For each={props.nodes}>
        {(node) => (
          <article class="mt-2 rounded-md bg-neutral-950/40 p-3">
            <header class="flex items-center gap-2 text-xs text-neutral-500">
              <span class="font-semibold text-neutral-300">u/{node.authorUsername}</span>
              <span>·</span>
              <span class={karmaColor(node.karma)}>
                {node.karma >= 0 ? "▲" : "▼"} {Math.abs(node.karma)}
              </span>
              <span class="text-neutral-700">
                ({node.upvotes}↑ / {node.downvotes}↓)
              </span>
            </header>
            <p class="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-neutral-200">
              {node.body}
            </p>
            <Show when={node.replies.length > 0}>
              <CommentTree nodes={node.replies} depth={props.depth + 1} />
            </Show>
          </article>
        )}
      </For>
    </div>
  );
}
