import type { LoaderContext } from "astro/loaders";
import { expect, test, vi } from "vitest";
import { textileLoader } from "../src";

type Entry = { id: string; [key: string]: unknown };

async function runLoader(initial: Entry[] = []) {
  const entries = new Map<string, Entry>(initial.map((entry) => [entry.id, entry]));
  const store = {
    entries,
    set: (entry: Entry) => entries.set(entry.id, entry),
    clear: vi.fn(() => entries.clear()),
  };
  const parseData = vi.fn(async ({ data }: { data: Record<string, unknown> }) => data);

  await textileLoader({ base: "posts" }).load({
    config: { root: new URL("./fixtures/", import.meta.url) },
    store,
    parseData,
  } as unknown as LoaderContext);

  return { store, parseData };
}

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

test("clears the store before loading", async () => {
  const { store } = await runLoader([{ id: "stale" }]);

  expect(store.clear).toHaveBeenCalledOnce();
  expect(store.entries.has("stale")).toBe(false);
});
