import { expect, test } from "vitest";
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
      metadata: frontmatter,
    },
  });
  expect(parseData).toHaveBeenCalledWith({
    id: "first",
    data: frontmatter,
    filePath: "posts/first.textile",
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

test("clears the store before loading", async () => {
  const { store } = await runLoader([{ id: "stale" }]);

  expect(store.clear).toHaveBeenCalledOnce();
  expect(store.entries.has("stale")).toBe(false);
});
