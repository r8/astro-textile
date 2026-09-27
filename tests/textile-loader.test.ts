import { fileURLToPath } from "node:url";
import { expect, test, vi } from "vitest";
import { runLoader, type Entry } from "./helpers";

test("loads only .textile files", async () => {
  const { store } = await runLoader();

  expect([...store.entries.keys()].sort()).toEqual(["first", "second"]);
});

test("parses frontmatter and renders textile to HTML", async () => {
  const { store, parseData } = await runLoader();
  const frontmatter = { title: "First post", tags: ["a", "b"] };

  expect(store.entries.get("first")).toEqual({
    id: "first",
    data: frontmatter,
    body: "h1. Heading\n\nSome *bold* text.\n",
    filePath: "posts/first.textile",
    rendered: {
      html: '<h1 id="heading">Heading</h1>\n<p>Some <strong>bold</strong> text.</p>',
      metadata: {
        headings: [{ depth: 1, slug: "heading", text: "Heading" }],
        localImagePaths: [],
        remoteImagePaths: [],
        imagePaths: [],
        frontmatter,
      },
    },
    assetImports: [],
  });
  expect(parseData).toHaveBeenCalledWith({
    id: "first",
    data: frontmatter,
    filePath: fileURLToPath(new URL("./fixtures/posts/first.textile", import.meta.url)),
  });
});

async function loadFrontmatter(id: string) {
  const { store } = await runLoader([], { base: "frontmatter", syntaxHighlight: false });
  return store.entries.get(id) as Entry & { data: Record<string, unknown> };
}

test("parses TOML frontmatter", async () => {
  const entry = await loadFrontmatter("toml");

  expect(entry.data).toEqual({ title: "TOML post", tags: ["a", "b"] });
  expect(entry.rendered?.html).toBe('<h1 id="heading">Heading</h1>');
});

test("parses YAML dates as Date objects", async () => {
  const entry = await loadFrontmatter("date");

  expect(entry.data.date).toEqual(new Date("2024-01-02"));
});

test("parses frontmatter after a byte order mark", async () => {
  const entry = await loadFrontmatter("bom");

  expect(entry.data).toEqual({ title: "BOM post" });
  expect(entry.rendered?.html).toBe('<h1 id="heading">Heading</h1>');
});

test("throws an error naming the file when the frontmatter is invalid", async () => {
  await expect(runLoader([], { base: "bad-frontmatter", syntaxHighlight: false })).rejects.toThrow(
    "Invalid frontmatter in bad-frontmatter/post.textile",
  );
});

test("keeps a leading space on the first line after the frontmatter", async () => {
  const { store } = await runLoader([], { base: "leading-space", syntaxHighlight: false });

  // In Textile, a line starting with a space isn't wrapped in a paragraph.
  expect(store.entries.get("post")?.rendered?.html).toBe("Not a paragraph.");
});

test("does not store the body when retainBody is false", async () => {
  const { store } = await runLoader([], {
    base: "posts",
    syntaxHighlight: false,
    retainBody: false,
  });

  expect(store.entries.get("first")?.body).toBeUndefined();
});

test("adds IDs to headings and returns them as metadata", async () => {
  const { store } = await runLoader([], { base: "headings", syntaxHighlight: false });
  const rendered = store.entries.get("post")?.rendered;

  expect(rendered?.html).toBe(
    [
      '<h1 id="hello-world">Hello <strong>World</strong></h1>',
      '<h2 id="intro">Intro</h2>',
      '<h2 id="intro-1">Intro</h2>',
      '<h3 id="custom">Custom ID</h3>',
    ].join("\n"),
  );
  expect(rendered?.metadata?.headings).toEqual([
    { depth: 1, slug: "hello-world", text: "Hello World" },
    { depth: 2, slug: "intro", text: "Intro" },
    { depth: 2, slug: "intro-1", text: "Intro" },
    { depth: 3, slug: "custom", text: "Custom ID" },
  ]);
});

test("marks local and allowed remote images for astro:assets", async () => {
  const { store } = await runLoader(
    [],
    { base: "images", syntaxHighlight: false },
    { image: { domains: ["example.com"], remotePatterns: [] } },
  );
  const entry = store.entries.get("post");
  const marker = (props: Record<string, unknown>) =>
    `<img __ASTRO_IMAGE_="${JSON.stringify(props).replaceAll('"', "&quot;")}">`;

  expect(entry?.rendered?.html).toBe(
    [
      `<p>${marker({ title: "Cover", alt: "Cover", src: "./cover.png", index: 0 })}</p>`,
      `<p>${marker({ alt: "", src: "./cover.png", index: 1 })}</p>`,
      `<p>${marker({ alt: "", src: "https://example.com/remote.png", index: 0, inferSize: true })}</p>`,
      '<p><img src="https://other.com/remote.png" alt=""></p>',
      '<p><img src="/public.png" alt=""></p>',
    ].join("\n"),
  );
  expect(entry?.rendered?.metadata).toMatchObject({
    localImagePaths: ["./cover.png"],
    remoteImagePaths: ["https://example.com/remote.png"],
    imagePaths: ["./cover.png", "https://example.com/remote.png"],
  });
  expect(entry?.assetImports).toEqual(["./cover.png", "https://example.com/remote.png"]);
});

test("clears the store before loading", async () => {
  const { store } = await runLoader([{ id: "stale" }]);

  expect(store.clear).toHaveBeenCalledOnce();
  expect(store.entries.has("stale")).toBe(false);
});

test("generates IDs from the path relative to the base directory", async () => {
  const { store, logger } = await runLoader([], { base: "ids", syntaxHighlight: false });

  expect([...store.entries.keys()].sort()).toEqual(["a/intro", "b/intro", "custom-slug", "guides"]);
  expect(logger.warn).not.toHaveBeenCalled();
});

test("generates the same IDs whether or not the base has a trailing slash", async () => {
  const { store } = await runLoader([], { base: "posts/", syntaxHighlight: false });

  expect([...store.entries.keys()].sort()).toEqual(["first", "second"]);
});

test("generates IDs relative to the root when no base is set", async () => {
  const { store } = await runLoader([], { pattern: "posts/*.textile", syntaxHighlight: false });

  expect([...store.entries.keys()].sort()).toEqual(["posts/first", "posts/second"]);
});

test("skips files inside node_modules", async () => {
  const { store } = await runLoader([], { base: "node-modules", syntaxHighlight: false });

  expect([...store.entries.keys()]).toEqual(["post"]);
});

test("uses a custom generateId function", async () => {
  const generateId = vi.fn(({ entry }: { entry: string }) => `custom/${entry}`);
  const { store } = await runLoader([], { base: "posts", syntaxHighlight: false, generateId });

  expect(generateId).toHaveBeenCalledWith({
    entry: "first.textile",
    base: new URL("./fixtures/posts/", import.meta.url),
    data: { title: "First post", tags: ["a", "b"] },
  });
  expect([...store.entries.keys()].sort()).toEqual([
    "custom/first.textile",
    "custom/second.textile",
  ]);
});

test("warns when entries share an ID", async () => {
  const { store, logger } = await runLoader([], { base: "duplicates", syntaxHighlight: false });

  expect([...store.entries.keys()]).toEqual(["guides"]);
  expect(logger.warn).toHaveBeenCalledOnce();
  for (const text of ['"guides"', "duplicates/guides.textile", "duplicates/guides/index.textile"]) {
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(text));
  }
});

test("throws when entries share an ID and prerenderConflictBehavior is error", async () => {
  await expect(
    runLoader(
      [],
      { base: "duplicates", syntaxHighlight: false },
      { prerenderConflictBehavior: "error" },
    ),
  ).rejects.toThrow('multiple entries with the ID "guides"');
});

test("ignores entries that share an ID when prerenderConflictBehavior is ignore", async () => {
  const { logger } = await runLoader(
    [],
    { base: "duplicates", syntaxHighlight: false },
    { prerenderConflictBehavior: "ignore" },
  );

  expect(logger.warn).not.toHaveBeenCalled();
});
