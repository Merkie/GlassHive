import { describe, it, expect, beforeEach } from "vitest";
import { Frontpage, SelfVoteError, UnknownEntityError } from "../src/frontpage.js";

// Deterministic clock so we can assert ordering by createdAt without sleeps.
function makeClock() {
  let t = 1_700_000_000_000;
  return {
    now: () => t,
    tick: (ms: number = 1) => {
      t += ms;
    },
  };
}

describe("Frontpage", () => {
  let fp: Frontpage;
  let clock: ReturnType<typeof makeClock>;

  beforeEach(() => {
    clock = makeClock();
    fp = new Frontpage({ now: clock.now });
  });

  describe("posts", () => {
    it("creates posts with unique uuids", () => {
      const a = fp.createPost("alice", "title a", "body a");
      const b = fp.createPost("bob", "title b", "body b");
      expect(a.id).not.toBe(b.id);
      expect(a.kind).toBe("post");
      expect(a.authorUsername).toBe("alice");
    });

    it("getEntity returns the post by id", () => {
      const post = fp.createPost("alice", "t", "b");
      const fetched = fp.getEntity(post.id);
      expect(fetched.id).toBe(post.id);
    });

    it("getEntity throws for unknown ids", () => {
      expect(() => fp.getEntity("nope")).toThrow(UnknownEntityError);
    });
  });

  describe("comments", () => {
    it("creates a top-level comment under a post", () => {
      const post = fp.createPost("alice", "t", "b");
      const comment = fp.createComment("bob", post.id, "first!");
      expect(comment.kind).toBe("comment");
      expect(comment.parentId).toBe(post.id);
      expect(comment.postId).toBe(post.id);
    });

    it("creates a nested reply that inherits the postId", () => {
      const post = fp.createPost("alice", "t", "b");
      const c1 = fp.createComment("bob", post.id, "first!");
      const c2 = fp.createComment("carol", c1.id, "reply");
      expect(c2.parentId).toBe(c1.id);
      expect(c2.postId).toBe(post.id);
    });

    it("rejects replies to unknown entities", () => {
      expect(() => fp.createComment("bob", "missing", "x")).toThrow(UnknownEntityError);
    });
  });

  describe("voting", () => {
    it("upvote bumps karma by +1", () => {
      const post = fp.createPost("alice", "t", "b");
      fp.vote("bob", post.id, "up");
      expect(fp.voteCounts(post.id)).toEqual({ up: 1, down: 0, karma: 1 });
    });

    it("downvote bumps karma by -1", () => {
      const post = fp.createPost("alice", "t", "b");
      fp.vote("bob", post.id, "down");
      expect(fp.voteCounts(post.id)).toEqual({ up: 0, down: 1, karma: -1 });
    });

    it("repeating the same vote clears it", () => {
      const post = fp.createPost("alice", "t", "b");
      expect(fp.vote("bob", post.id, "up")).toBe("set");
      expect(fp.vote("bob", post.id, "up")).toBe("cleared");
      expect(fp.voteCounts(post.id)).toEqual({ up: 0, down: 0, karma: 0 });
    });

    it("switching from up to down replaces the vote", () => {
      const post = fp.createPost("alice", "t", "b");
      fp.vote("bob", post.id, "up");
      expect(fp.vote("bob", post.id, "down")).toBe("switched");
      expect(fp.voteCounts(post.id)).toEqual({ up: 0, down: 1, karma: -1 });
    });

    it("rejects voting on your own content", () => {
      const post = fp.createPost("alice", "t", "b");
      expect(() => fp.vote("alice", post.id, "up")).toThrow(SelfVoteError);
    });

    it("works the same way on comments", () => {
      const post = fp.createPost("alice", "t", "b");
      const comment = fp.createComment("bob", post.id, "hi");
      fp.vote("carol", comment.id, "up");
      fp.vote("dave", comment.id, "up");
      fp.vote("eve", comment.id, "down");
      expect(fp.voteCounts(comment.id)).toEqual({ up: 2, down: 1, karma: 1 });
    });
  });

  describe("user karma", () => {
    it("aggregates post and comment karma per user", () => {
      const post = fp.createPost("alice", "t", "b");
      const comment = fp.createComment("alice", post.id, "self-comment");
      fp.vote("bob", post.id, "up");
      fp.vote("carol", post.id, "up");
      fp.vote("bob", comment.id, "down");
      const k = fp.userKarma("alice");
      expect(k.postKarma).toBe(2);
      expect(k.commentKarma).toBe(-1);
      expect(k.total).toBe(1);
    });
  });

  describe("listPosts sorting", () => {
    it("'new' returns most recent first", () => {
      const a = fp.createPost("alice", "a", "");
      clock.tick(10);
      const b = fp.createPost("bob", "b", "");
      clock.tick(10);
      const c = fp.createPost("carol", "c", "");
      const ids = fp.listPosts({ sort: "new" }).map((p) => p.id);
      expect(ids).toEqual([c.id, b.id, a.id]);
    });

    it("'top' returns highest karma first", () => {
      const a = fp.createPost("alice", "a", "");
      const b = fp.createPost("bob", "b", "");
      const c = fp.createPost("carol", "c", "");
      fp.vote("u1", a.id, "up");
      fp.vote("u1", b.id, "up");
      fp.vote("u2", b.id, "up");
      fp.vote("u3", b.id, "up");
      fp.vote("u1", c.id, "down");
      const ids = fp.listPosts({ sort: "top" }).map((p) => p.id);
      // b: +3, a: +1, c: -1
      expect(ids).toEqual([b.id, a.id, c.id]);
    });

    it("'controversial' favors mixed votes with high engagement", () => {
      const lopsided = fp.createPost("alice", "lopsided", "");
      const fight = fp.createPost("bob", "fight", "");
      const small = fp.createPost("carol", "small", "");
      // lopsided: 5 up, 0 down → balance 0
      for (const u of ["u1", "u2", "u3", "u4", "u5"]) {
        fp.vote(u, lopsided.id, "up");
      }
      // fight: 4 up, 4 down → balance 1.0, volume 8
      for (const u of ["u1", "u2", "u3", "u4"]) fp.vote(u, fight.id, "up");
      for (const u of ["u5", "u6", "u7", "u8"]) fp.vote(u, fight.id, "down");
      // small: 1 up, 1 down → balance 1.0, volume 2
      fp.vote("u1", small.id, "up");
      fp.vote("u2", small.id, "down");
      const ids = fp.listPosts({ sort: "controversial" }).map((p) => p.id);
      expect(ids[0]).toBe(fight.id);
      expect(ids[1]).toBe(small.id);
      expect(ids[2]).toBe(lopsided.id);
    });

    it("includes preview, comment count, and votes per post", () => {
      const post = fp.createPost("alice", "title", "x".repeat(500));
      fp.createComment("bob", post.id, "c1");
      fp.createComment("carol", post.id, "c2");
      fp.vote("bob", post.id, "up");
      const summary = fp.listPosts()[0];
      expect(summary.id).toBe(post.id);
      expect(summary.commentCount).toBe(2);
      expect(summary.upvotes).toBe(1);
      expect(summary.bodyPreview.endsWith("…")).toBe(true);
      expect(summary.bodyPreview.length).toBeLessThan(500);
    });
  });

  describe("getCommentTree", () => {
    it("nests replies under their parents", () => {
      const post = fp.createPost("alice", "t", "b");
      const c1 = fp.createComment("bob", post.id, "top1");
      const c2 = fp.createComment("carol", post.id, "top2");
      const r1 = fp.createComment("dave", c1.id, "reply1");
      const r2 = fp.createComment("eve", r1.id, "deep");

      const tree = fp.getCommentTree(post.id, "new");
      const ids = tree.map((n) => n.id);
      expect(ids).toContain(c1.id);
      expect(ids).toContain(c2.id);

      const c1Node = tree.find((n) => n.id === c1.id)!;
      expect(c1Node.replies.map((r) => r.id)).toEqual([r1.id]);
      expect(c1Node.replies[0].replies[0].id).toBe(r2.id);
    });

    it("sorts comments at each level by karma when sort='top'", () => {
      const post = fp.createPost("alice", "t", "b");
      const low = fp.createComment("bob", post.id, "low");
      const high = fp.createComment("carol", post.id, "high");
      fp.vote("u1", high.id, "up");
      fp.vote("u2", high.id, "up");
      fp.vote("u1", low.id, "down");
      const tree = fp.getCommentTree(post.id, "top");
      expect(tree[0].id).toBe(high.id);
      expect(tree[1].id).toBe(low.id);
    });
  });

  describe("snapshot", () => {
    it("exports posts ordered by karma with full comment trees", () => {
      const big = fp.createPost("alice", "big", "");
      const small = fp.createPost("bob", "small", "");
      fp.vote("u1", big.id, "up");
      fp.vote("u2", big.id, "up");
      const c = fp.createComment("carol", big.id, "nice");
      fp.vote("u1", c.id, "up");

      const snap = fp.snapshot();
      expect(snap.posts.length).toBe(2);
      expect(snap.posts[0].post.id).toBe(big.id);
      expect(snap.posts[0].karma).toBe(2);
      expect(snap.posts[0].comments.length).toBe(1);
      expect(snap.posts[0].comments[0].id).toBe(c.id);
      expect(snap.posts[0].comments[0].karma).toBe(1);
    });
  });
});
