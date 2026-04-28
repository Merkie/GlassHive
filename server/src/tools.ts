import { tool } from "ai";
import { z } from "zod";
import {
  Frontpage,
  SelfVoteError,
  UnknownEntityError,
  type SortMode,
} from "./frontpage.js";
import type { ActivityEvent } from "../../shared/contracts.js";

export type { ActivityEvent } from "../../shared/contracts.js";

export interface ToolContext {
  fp: Frontpage;
  username: string;
  // Called after every successful state-changing tool call so the
  // orchestrator can stream progress to the client / log activity.
  onActivity?: (event: ActivityEvent) => void;
}

const sortSchema = z
  .enum(["top", "new", "controversial"])
  .describe("Sort order. 'top' = most upvoted, 'new' = most recent, 'controversial' = most debated.");

// Centralized error wrapper so every tool returns a consistent
// `{ error: string }` shape instead of throwing inside the AI SDK
// step loop. The model gets the message and can usefully retry.
function safeRun<T>(
  ctx: ToolContext,
  toolName: string,
  fn: () => T
): T | { error: string } {
  try {
    return fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.onActivity?.({
      kind: "tool-error",
      tool: toolName,
      username: ctx.username,
      error: msg,
    });
    if (err instanceof SelfVoteError || err instanceof UnknownEntityError) {
      return { error: msg };
    }
    return { error: `internal error: ${msg}` };
  }
}

export function buildTools(ctx: ToolContext) {
  return {
    get_posts: tool({
      description:
        "Fetch a list of posts on the front page. Returns id, title, body preview, author, karma, and comment count for each. Use this to find threads to engage with.",
      inputSchema: z.object({
        sort: sortSchema.default("top"),
        limit: z.number().int().min(1).max(50).default(25),
      }),
      execute: async ({ sort, limit }) =>
        safeRun(ctx, "get_posts", () =>
          ctx.fp.listPosts({ sort: sort as SortMode, limit })
        ),
    }),

    get_post: tool({
      description:
        "Fetch a single post by id along with its full nested comment tree (sorted by 'top' by default). Use this when you want to read a thread before replying or voting.",
      inputSchema: z.object({
        post_id: z.string().min(1),
        comment_sort: sortSchema.default("top"),
      }),
      execute: async ({ post_id, comment_sort }) =>
        safeRun(ctx, "get_post", () => {
          const entity = ctx.fp.getEntity(post_id);
          if (entity.kind !== "post") {
            return { error: `id ${post_id} is a comment, not a post` };
          }
          const counts = ctx.fp.voteCounts(post_id);
          return {
            post: {
              id: entity.id,
              author: entity.authorUsername,
              title: entity.title,
              body: entity.body,
              createdAt: entity.createdAt,
              karma: counts.karma,
              upvotes: counts.up,
              downvotes: counts.down,
            },
            comments: ctx.fp.getCommentTree(post_id, comment_sort as SortMode),
          };
        }),
    }),

    get_comments: tool({
      description:
        "Fetch the comment tree for a specific post, with a chosen sort order. Useful for re-reading a thread sorted differently from how you first saw it.",
      inputSchema: z.object({
        post_id: z.string().min(1),
        sort: sortSchema.default("top"),
      }),
      execute: async ({ post_id, sort }) =>
        safeRun(ctx, "get_comments", () =>
          ctx.fp.getCommentTree(post_id, sort as SortMode)
        ),
    }),

    create_post: tool({
      description:
        "Create a new top-level post on the front page. Use this to start a new thread on the source material — pose a question, share a hot take, link to a piece of news. Pick a title that you'd actually click on.",
      inputSchema: z.object({
        title: z.string().min(3).max(300),
        body: z.string().min(0).max(8000).default(""),
      }),
      execute: async ({ title, body }) =>
        safeRun(ctx, "create_post", () => {
          const post = ctx.fp.createPost(ctx.username, title, body);
          ctx.onActivity?.({
            kind: "post-created",
            postId: post.id,
            username: ctx.username,
            title: post.title,
          });
          return {
            ok: true,
            post_id: post.id,
            title: post.title,
            createdAt: post.createdAt,
          };
        }),
    }),

    reply: tool({
      description:
        "Reply to a post (creates a top-level comment) or to another comment (creates a nested reply). Pass the id of the entity you're replying to.",
      inputSchema: z.object({
        entity_id: z.string().min(1),
        body: z.string().min(1).max(4000),
      }),
      execute: async ({ entity_id, body }) =>
        safeRun(ctx, "reply", () => {
          const comment = ctx.fp.createComment(ctx.username, entity_id, body);
          ctx.onActivity?.({
            kind: "comment-created",
            commentId: comment.id,
            postId: comment.postId,
            parentId: comment.parentId,
            username: ctx.username,
            body: comment.body,
          });
          return {
            ok: true,
            comment_id: comment.id,
            parent_id: comment.parentId,
            post_id: comment.postId,
            createdAt: comment.createdAt,
          };
        }),
    }),

    react: tool({
      description:
        "Upvote or downvote a post or comment. Use the entity's id (post id or comment id). You cannot vote on your own content. Voting the same way twice removes your vote; voting the opposite way switches it.",
      inputSchema: z.object({
        entity_id: z.string().min(1),
        type: z.enum(["up", "down"]),
      }),
      execute: async ({ entity_id, type }) =>
        safeRun(ctx, "react", () => {
          const result = ctx.fp.vote(ctx.username, entity_id, type);
          const counts = ctx.fp.voteCounts(entity_id);
          ctx.onActivity?.({
            kind: "vote",
            entityId: entity_id,
            username: ctx.username,
            type,
            result,
          });
          return {
            ok: true,
            result,
            karma: counts.karma,
            upvotes: counts.up,
            downvotes: counts.down,
          };
        }),
    }),
  };
}
