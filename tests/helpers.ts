import type { LoaderContext } from "astro/loaders";
import { vi } from "vitest";
import { textileLoader, type TextileLoaderOptions } from "../src";

export type Entry = {
  id: string;
  rendered?: { html: string; metadata?: Record<string, unknown> };
  [key: string]: unknown;
};

export async function runLoader(
  initial: Entry[] = [],
  options: TextileLoaderOptions = { base: "posts", syntaxHighlight: false },
  config: Record<string, unknown> = {},
  context: Record<string, unknown> = {},
) {
  const entries = new Map<string, Entry>(initial.map((entry) => [entry.id, entry]));
  const store = {
    entries,
    get: (id: string) => entries.get(id),
    set: (entry: Entry) => entries.set(entry.id, entry),
    delete: (id: string) => entries.delete(id),
    clear: vi.fn(() => entries.clear()),
  };
  const parseData = vi.fn(async ({ data }: { data: Record<string, unknown> }) => data);
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

  await textileLoader(options).load({
    config: { root: new URL("./fixtures/", import.meta.url), ...config },
    collection: "test",
    store,
    logger,
    parseData,
    ...context,
  } as unknown as LoaderContext);

  return { store, parseData, logger };
}

/** A stand-in for Astro's dev file watcher that lets tests await each event. */
export function createWatcher() {
  const handlers = new Map<string, (path: string) => unknown>();

  return {
    add: vi.fn(),
    on: vi.fn((event: string, handler: (path: string) => unknown) => {
      handlers.set(event, handler);
    }),
    emit: async (event: "add" | "change" | "unlink", path: string) => {
      await handlers.get(event)?.(path);
    },
  };
}
