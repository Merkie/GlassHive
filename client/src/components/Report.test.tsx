import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@solidjs/testing-library";
import Report from "./Report";

afterEach(() => {
  cleanup();
});

describe("Report sanitization (regression for #3)", () => {
  it("strips <script> tags from report markdown", () => {
    const exec = vi.fn();
    (window as unknown as { __reportXssHit: typeof exec }).__reportXssHit = exec;

    const md = `# Heading

<script>window.__reportXssHit("script")</script>

Paragraph after.`;

    const { container } = render(() => <Report markdown={md} />);

    expect(container.querySelector("script")).toBeNull();
    expect(container.innerHTML).not.toContain("__reportXssHit");
    expect(exec).not.toHaveBeenCalled();
  });

  it("strips inline event handler attributes (on*)", () => {
    const md = `<img src="x" onerror="window.__reportXssHit('onerror')" alt="x">

<a href="#" onclick="window.__reportXssHit('onclick')">click</a>`;

    const { container } = render(() => <Report markdown={md} />);

    const html = container.innerHTML;
    expect(html).not.toMatch(/onerror=/i);
    expect(html).not.toMatch(/onclick=/i);
    expect(html).not.toContain("__reportXssHit");
  });

  it("strips javascript: URLs from links", () => {
    const md = `[evil](javascript:window.__reportXssHit('href'))

[also evil](JaVaScRiPt:alert(1))`;

    const { container } = render(() => <Report markdown={md} />);

    const links = container.querySelectorAll("a");
    for (const link of Array.from(links)) {
      const href = link.getAttribute("href") ?? "";
      expect(href.toLowerCase()).not.toMatch(/^javascript:/);
    }
    expect(container.innerHTML.toLowerCase()).not.toContain("javascript:");
  });

  it("preserves safe markdown (headings, paragraphs, links, code)", () => {
    const md = `# Title

A paragraph with [a safe link](https://example.com) and \`inline code\`.

\`\`\`
const x = 1;
\`\`\``;

    const { container } = render(() => <Report markdown={md} />);

    expect(container.querySelector("h1")?.textContent).toBe("Title");
    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toBe("https://example.com");
    expect(container.querySelector("code")).not.toBeNull();
  });

  it("renders nothing when markdown is null", () => {
    const { container } = render(() => <Report markdown={null} />);
    expect(container.querySelector("section")).toBeNull();
  });
});
