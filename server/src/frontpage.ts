import { randomUUID } from "node:crypto";

export interface Post {
  id: string;
  kind: "post";
  authorUsername: string;
  title: string;
  body: string;
  createdAt: number;
}

export interface Comment {
  id: string;
  kind: "comment";
  authorUsername: string;
  parentId: string;
  postId: string;
  body: string;
  createdAt: number;
}

export type Entity = Post | Comment;
export type SortMode = "top" | "new" | "controversial";

export interface PostSummary {
  id: string;
  authorUsername: string;
  title: string;
  bodyPreview: string;
  createdAt: number;
  karma: number;
  upvotes: number;
  downvotes: number;
  commentCount: number;
}

export interface CommentNode {
  id: string;
  authorUsername: string;
  body: string;
  createdAt: number;
  parentId: string;
  karma: number;
  upvotes: number;
  downvotes: number;
  replies: CommentNode[];
}

export interface FrontpageSnapshot {
  posts: Array<{
    post: Post;
    karma: number;
    upvotes: number;
    downvotes: number;
    comments: CommentNode[];
  }>;
  exportedAt: number;
}

export class SelfVoteError extends Error {
  constructor() {
    super("you cannot vote on your own post or comment");
    this.name = "SelfVoteError";
  }
}

export class UnknownEntityError extends Error {
  constructor(id: string) {
    super(`unknown entity id: ${id}`);
    this.name = "UnknownEntityError";
  }
}

const PREVIEW_LEN = 220;

export class Frontpage {
  private posts = new Map<string, Post>();
  private comments = new Map<string, Comment>();
  private votes = new Map<string, Map<string, 1 | -1>>();
  private now: () => number;

  constructor(opts: { now?: () => number } = {}) {
    this.now = opts.now ?? Date.now;
  }

  createPost(authorUsername: string, title: string, body: string): Post {
    const post: Post = {
      id: randomUUID(),
      kind: "post",
      authorUsername,
      title,
      body,
      createdAt: this.now(),
    };
    this.posts.set(post.id, post);
    return post;
  }

  // parentId can be a post id (creates a top-level comment) or another
  // comment id (creates a nested reply on the same post).
  createComment(authorUsername: string, parentId: string, body: string): Comment {
    const parent = this.getEntity(parentId);
    const postId = parent.kind === "post" ? parent.id : parent.postId;
    const comment: Comment = {
      id: randomUUID(),
      kind: "comment",
      authorUsername,
      parentId,
      postId,
      body,
      createdAt: this.now(),
    };
    this.comments.set(comment.id, comment);
    return comment;
  }

  getEntity(id: string): Entity {
    const p = this.posts.get(id);
    if (p) return p;
    const c = this.comments.get(id);
    if (c) return c;
    throw new UnknownEntityError(id);
  }

  // Idempotent vote: setting the same vote twice clears it (toggle).
  // Voting against yourself is rejected so agents can't self-bump karma.
  vote(username: string, entityId: string, type: "up" | "down"): "set" | "cleared" | "switched" {
    const entity = this.getEntity(entityId);
    if (entity.authorUsername === username) {
      throw new SelfVoteError();
    }
    let bucket = this.votes.get(entityId);
    if (!bucket) {
      bucket = new Map();
      this.votes.set(entityId, bucket);
    }
    const desired: 1 | -1 = type === "up" ? 1 : -1;
    const current = bucket.get(username);
    if (current === desired) {
      bucket.delete(username);
      return "cleared";
    }
    const wasOpposite = current !== undefined && current !== desired;
    bucket.set(username, desired);
    return wasOpposite ? "switched" : "set";
  }

  voteCounts(entityId: string): { up: number; down: number; karma: number } {
    const bucket = this.votes.get(entityId);
    if (!bucket) return { up: 0, down: 0, karma: 0 };
    let up = 0;
    let down = 0;
    for (const v of bucket.values()) {
      if (v === 1) up++;
      else down++;
    }
    return { up, down, karma: up - down };
  }

  private countCommentsFor(postId: string): number {
    let n = 0;
    for (const c of this.comments.values()) {
      if (c.postId === postId) n++;
    }
    return n;
  }

  // Aggregate karma across all of a user's posts and comments.
  userKarma(username: string): { postKarma: number; commentKarma: number; total: number } {
    let postKarma = 0;
    let commentKarma = 0;
    for (const p of this.posts.values()) {
      if (p.authorUsername === username) postKarma += this.voteCounts(p.id).karma;
    }
    for (const c of this.comments.values()) {
      if (c.authorUsername === username) commentKarma += this.voteCounts(c.id).karma;
    }
    return { postKarma, commentKarma, total: postKarma + commentKarma };
  }

  listPosts(opts: { sort?: SortMode; limit?: number } = {}): PostSummary[] {
    const sort = opts.sort ?? "top";
    const limit = opts.limit ?? 50;
    const all: PostSummary[] = [];
    for (const p of this.posts.values()) {
      const v = this.voteCounts(p.id);
      all.push({
        id: p.id,
        authorUsername: p.authorUsername,
        title: p.title,
        bodyPreview: preview(p.body),
        createdAt: p.createdAt,
        karma: v.karma,
        upvotes: v.up,
        downvotes: v.down,
        commentCount: this.countCommentsFor(p.id),
      });
    }
    return sortByMode(all, sort).slice(0, limit);
  }

  // Nested tree of comments under a post. Children of a node are sorted
  // by the same sort mode as the parent listing.
  getCommentTree(postId: string, sort: SortMode = "top"): CommentNode[] {
    if (!this.posts.has(postId)) throw new UnknownEntityError(postId);
    const byParent = new Map<string, CommentNode[]>();
    for (const c of this.comments.values()) {
      if (c.postId !== postId) continue;
      const v = this.voteCounts(c.id);
      const node: CommentNode = {
        id: c.id,
        authorUsername: c.authorUsername,
        body: c.body,
        createdAt: c.createdAt,
        parentId: c.parentId,
        karma: v.karma,
        upvotes: v.up,
        downvotes: v.down,
        replies: [],
      };
      const arr = byParent.get(c.parentId) ?? [];
      arr.push(node);
      byParent.set(c.parentId, arr);
    }
    const attach = (parentId: string): CommentNode[] => {
      const children = byParent.get(parentId) ?? [];
      const sorted = sortByMode(children, sort);
      for (const node of sorted) node.replies = attach(node.id);
      return sorted;
    };
    return attach(postId);
  }

  snapshot(): FrontpageSnapshot {
    const out: FrontpageSnapshot["posts"] = [];
    const sorted = [...this.posts.values()].sort((a, b) => {
      const ka = this.voteCounts(a.id).karma;
      const kb = this.voteCounts(b.id).karma;
      if (ka !== kb) return kb - ka;
      return a.createdAt - b.createdAt;
    });
    for (const post of sorted) {
      const v = this.voteCounts(post.id);
      out.push({
        post,
        karma: v.karma,
        upvotes: v.up,
        downvotes: v.down,
        comments: this.getCommentTree(post.id, "top"),
      });
    }
    return { posts: out, exportedAt: this.now() };
  }
}

function preview(body: string): string {
  const trimmed = body.trim();
  if (trimmed.length <= PREVIEW_LEN) return trimmed;
  return trimmed.slice(0, PREVIEW_LEN).trimEnd() + "…";
}

// Reddit's controversial sort favors entities with high total engagement
// AND a near-even up/down split. min/max gives 1.0 for a 50/50 split,
// approaches 0 for one-sided votes. Multiplying by total volume rewards
// the bigger fights.
function controversyScore(up: number, down: number): number {
  const total = up + down;
  if (total === 0) return 0;
  const denom = Math.max(up, down);
  if (denom === 0) return 0;
  const balance = Math.min(up, down) / denom;
  return total * balance;
}

interface Sortable {
  createdAt: number;
  karma: number;
  upvotes: number;
  downvotes: number;
}

function sortByMode<T extends Sortable>(items: T[], sort: SortMode): T[] {
  const arr = [...items];
  if (sort === "new") {
    arr.sort((a, b) => b.createdAt - a.createdAt);
  } else if (sort === "controversial") {
    arr.sort((a, b) => {
      const ca = controversyScore(a.upvotes, a.downvotes);
      const cb = controversyScore(b.upvotes, b.downvotes);
      if (ca !== cb) return cb - ca;
      return b.createdAt - a.createdAt;
    });
  } else {
    arr.sort((a, b) => {
      if (a.karma !== b.karma) return b.karma - a.karma;
      return b.createdAt - a.createdAt;
    });
  }
  return arr;
}
