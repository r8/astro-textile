import { expect, test, vi } from "vitest";
import { runLoader } from "./helpers";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    readFile: vi.fn((file: string, encoding: BufferEncoding) =>
      file.endsWith("unreadable.textile")
        ? Promise.reject(new Error("permission denied"))
        : actual.readFile(file, encoding),
    ),
  };
});

vi.mock("textile-js", async (importOriginal) => {
  const actual = await importOriginal<{ default: typeof import("textile-js") }>();
  return {
    default: (source: string) => {
      if (source.startsWith("Throws")) {
        throw new Error("textile failed");
      }
      return actual.default(source);
    },
  };
});

test("skips files that can't be read and keeps entries that fail to render", async () => {
  const { store, logger } = await runLoader([], { base: "errors", syntaxHighlight: false });

  expect([...store.entries.keys()].sort()).toEqual(["broken", "good"]);
  expect(store.entries.get("good")?.rendered?.html).toBe('<h1 id="good">Good</h1>');
  expect(store.entries.get("broken")).toEqual({
    id: "broken",
    data: { title: "Broken" },
    body: "Throws while rendering.\n",
    filePath: "errors/broken.textile",
    rendered: undefined,
    assetImports: undefined,
  });
  expect(logger.error).toHaveBeenCalledTimes(2);
  expect(logger.error).toHaveBeenCalledWith("Error reading unreadable.textile: permission denied");
  expect(logger.error).toHaveBeenCalledWith("Error rendering broken.textile: textile failed");
});
