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
    filePath: "posts/first.textile",
    rendered: {
      html: "<h1>Heading</h1>\n<p>Some <strong>bold</strong> text.</p>",
      metadata: { frontmatter },
    },
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
  expect(entry.rendered?.html).toBe("<h1>Heading</h1>");
});

test("parses YAML dates as Date objects", async () => {
  const entry = await loadFrontmatter("date");

  expect(entry.data.date).toEqual(new Date("2024-01-02"));
});

test("parses frontmatter after a byte order mark", async () => {
  const entry = await loadFrontmatter("bom");

  expect(entry.data).toEqual({ title: "BOM post" });
  expect(entry.rendered?.html).toBe("<h1>Heading</h1>");
});

test("keeps a leading space on the first line after the frontmatter", async () => {
  const { store } = await runLoader([], { base: "leading-space", syntaxHighlight: false });

  // In Textile, a line starting with a space isn't wrapped in a paragraph.
  expect(store.entries.get("post")?.rendered?.html).toBe("Not a paragraph.");
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
