import { generateText, type LanguageModel } from "ai";
import type { CommentNode, FrontpageSnapshot } from "./frontpage.js";

export interface ReportResult {
  markdown: string | null;
  error?: string;
  costUsd: number;
  tokens: { input: number; output: number };
}

export interface GenerateReportOptions {
  model: LanguageModel;
  source: string;
  snapshot: FrontpageSnapshot;
}

const SYSTEM_PROMPT = `You are an analyst summarizing a Reddit-style discussion thread that a roomful of people had about some source material.

Your job: write a clear, lively report that captures what the room actually said. The thread is sorted by top — what's at the top got the most karma and represents what the room rallied behind.

Cover, in this rough shape (use your judgment, drop sections that don't apply):

1. **Overarching opinion** — what's the dominant read on the source material? Where did the room land?
2. **Common consensus** — what did most people agree on, even across different angles?
3. **Controversial takes** — where were the genuine fights? Quote a couple of representative comments. Highlight near-50/50 splits.
4. **Notable individual angles** — interesting one-off perspectives that stood out (even if they didn't get karma).
5. **Anything surprising** — unexpected directions the conversation went, jokes that landed, blind spots, etc.

Output rules:
- Markdown. Use ## headings, bullet lists, and short blockquotes (>) for direct quotes.
- Keep it tight — a few paragraphs per section, not an essay.
- Quote actual users by their u/handle when you reference a specific take.
- Don't restate the source material. Don't moralize. Don't add disclaimers.
- Lead with a one-sentence TL;DR at the very top before any heading.`;

function indent(depth: number): string {
  return "  ".repeat(depth);
}

function serializeComment(node: CommentNode, depth: number): string {
  const head = `${indent(depth)}- [karma ${node.karma}] u/${node.authorUsername}: ${node.body.replace(/\s+/g, " ").trim()}`;
  if (node.replies.length === 0) return head;
  const children = node.replies.map((c) => serializeComment(c, depth + 1)).join("\n");
  return `${head}\n${children}`;
}

function serializeSnapshot(snapshot: FrontpageSnapshot): string {
  const blocks: string[] = [];
  for (const p of snapshot.posts) {
    const header = `## [karma ${p.karma}] "${p.post.title}" — u/${p.post.authorUsername}`;
    const body = p.post.body.trim().length > 0 ? `\n\n${p.post.body.trim()}` : "";
    const commentLines = p.comments.length > 0
      ? `\n\nComments:\n${p.comments.map((c) => serializeComment(c, 0)).join("\n")}`
      : "\n\n(no comments)";
    blocks.push(`${header}${body}${commentLines}`);
  }
  return blocks.join("\n\n---\n\n");
}

function extractCost(providerMetadata: unknown): number {
  const pm = providerMetadata as
    | { openrouter?: { usage?: { cost?: number } } }
    | undefined;
  const cost = pm?.openrouter?.usage?.cost;
  return typeof cost === "number" ? cost : 0;
}

export async function generateReport(opts: GenerateReportOptions): Promise<ReportResult> {
  const { model, source, snapshot } = opts;

  if (snapshot.posts.length === 0) {
    return { markdown: null, costUsd: 0, tokens: { input: 0, output: 0 } };
  }

  const userPrompt = `=== SOURCE MATERIAL ===

"""
${source}
"""

=== DISCUSSION (sorted by top) ===

${serializeSnapshot(snapshot)}

Write the report now.`;

  try {
    const { text, totalUsage, providerMetadata } = await generateText({
      model,
      providerOptions: {
        openrouter: { usage: { include: true } },
      },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });

    return {
      markdown: text.trim() || null,
      costUsd: extractCost(providerMetadata),
      tokens: {
        input: totalUsage?.inputTokens ?? 0,
        output: totalUsage?.outputTokens ?? 0,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      markdown: null,
      error: msg,
      costUsd: 0,
      tokens: { input: 0, output: 0 },
    };
  }
}
