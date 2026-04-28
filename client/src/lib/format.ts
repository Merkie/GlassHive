import type { CommentNode } from "../types";

export function fmtUsd(n: number): string {
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(6)}`;
  return `$${n.toFixed(4)}`;
}

export function karmaColor(k: number): string {
  if (k > 0) return "text-orange-400";
  if (k < 0) return "text-rose-400";
  return "text-neutral-500";
}

export function downloadFile(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadJson(name: string, data: unknown) {
  downloadFile(name, JSON.stringify(data, null, 2), "application/json");
}

export function formatDuration(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m${s}s`;
}

export function countAllComments(nodes: CommentNode[]): number {
  let n = 0;
  for (const node of nodes) n += 1 + countAllComments(node.replies);
  return n;
}
