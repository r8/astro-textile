import type { LoaderContext } from "astro/loaders";
import { vi } from "vitest";
import { textileLoader, type TextileLoaderOptions } from "../src";

export type Entry = { id: string; rendered?: { html: string }; [key: string]: unknown };

export async function runLoader(
  initial: Entry[] = [],
  options: Omit<TextileLoaderOptions, "pattern"> & {
    pattern?: TextileLoaderOptions["pattern"];
  } = { base: "posts", syntaxHighlight: false },
  config: Record<string, unknown> = {},
) {
  const entries = new Map<string, Entry>(initial.map((entry) => [entry.id, entry]));
  const store = {
    entries,
    set: (entry: Entry) => entries.set(entry.id, entry),
    clear: vi.fn(() => entries.clear()),
  };
  const parseData = vi.fn(async ({ data }: { data: Record<string, unknown> }) => data);
  const logger = { warn: vi.fn() };

  await textileLoader({ pattern: "**/*.textile", ...options }).load({
    config: { root: new URL("./fixtures/", import.meta.url), ...config },
    collection: "test",
    store,
    logger,
    parseData,
  } as unknown as LoaderContext);

  return { store, parseData, logger };
}
