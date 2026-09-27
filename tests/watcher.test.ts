import { mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, expect, test } from "vitest";
import { createWatcher, runLoader } from "./helpers";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "astro-textile-"));
  await mkdir(path.join(root, "posts"));
  await writeFile(path.join(root, "posts/first.textile"), "h1. First\n");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function watch() {
  const watcher = createWatcher();
  const result = await runLoader(
    [],
    { base: "posts", syntaxHighlight: false },
    { root: pathToFileURL(`${root}/`) },
    { watcher },
  );
  return { ...result, watcher };
}

const postPath = (file: string) => path.join(root, "posts", file);

test("watches the base directory", async () => {
  const { watcher } = await watch();

  expect(watcher.add).toHaveBeenCalledWith(path.join(root, "posts/"));
});

test("reloads an entry when its file changes", async () => {
  const { store, watcher, logger } = await watch();

  await writeFile(postPath("first.textile"), "h1. Changed\n");
  await watcher.emit("change", postPath("first.textile"));

  expect(store.entries.get("first")?.rendered?.html).toBe('<h1 id="changed">Changed</h1>');
  expect(logger.info).toHaveBeenCalledWith("Reloaded data from first.textile");
});

test("adds an entry when a file is added", async () => {
  const { store, watcher } = await watch();

  await writeFile(postPath("second.textile"), "h1. Second\n");
  await watcher.emit("add", postPath("second.textile"));

  expect([...store.entries.keys()].sort()).toEqual(["first", "second"]);
});

test("removes an entry when its file is deleted", async () => {
  const { store, watcher } = await watch();

  await unlink(postPath("first.textile"));
  await watcher.emit("unlink", postPath("first.textile"));

  expect(store.entries.size).toBe(0);
});

test("replaces the entry when a change gives the file a new ID", async () => {
  const { store, watcher } = await watch();

  await writeFile(postPath("first.textile"), "---\nslug: renamed\n---\nh1. First\n");
  await watcher.emit("change", postPath("first.textile"));

  expect([...store.entries.keys()]).toEqual(["renamed"]);
});

test("ignores files that don't match the pattern", async () => {
  const { store, watcher, logger } = await watch();

  await mkdir(postPath("node_modules"));
  await writeFile(postPath("node_modules/dependency.textile"), "h1. Dependency\n");
  await writeFile(postPath("notes.md"), "# Notes\n");
  await writeFile(path.join(root, "outside.textile"), "h1. Outside\n");
  for (const file of [
    postPath("node_modules/dependency.textile"),
    postPath("notes.md"),
    path.join(root, "outside.textile"),
  ]) {
    await watcher.emit("add", file);
  }

  expect([...store.entries.keys()]).toEqual(["first"]);
  expect(logger.info).not.toHaveBeenCalled();
});

test("logs an error and keeps the entry when a changed file can't be loaded", async () => {
  const { store, watcher, logger } = await watch();

  await writeFile(postPath("first.textile"), "---\ntitle: [unclosed\n---\nh1. Broken\n");
  await watcher.emit("change", postPath("first.textile"));

  expect(store.entries.get("first")?.rendered?.html).toBe('<h1 id="first">First</h1>');
  expect(logger.error).toHaveBeenCalledWith(
    expect.stringContaining("Failed to reload first.textile: Invalid frontmatter"),
  );
});
