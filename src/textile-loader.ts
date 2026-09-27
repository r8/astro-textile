import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import picomatch from "picomatch";
import { glob } from "tinyglobby";
import type { Loader } from "astro/loaders";
import { parseFrontmatter } from "astro/markdown";
import textile from "textile-js";
import type { HighlightOptions } from "./highlight";
import { createRenderer } from "./render";
import { type GenerateIdOptions, checkPrefix, generateIdDefault } from "./utils";

export interface TextileLoaderOptions extends HighlightOptions {
  /** The glob pattern to match files, relative to the base directory. Defaults to `**\/*.textile` */
  pattern?: string | Array<string>;
  /** The base directory to resolve the glob pattern from. Relative to the root directory, or an absolute file URL. Defaults to `.` */
  base?: string | URL;
  /**
   * Function that generates an ID for an entry. Default implementation generates a slug from the entry path.
   * @returns The ID of the entry. Must be unique per collection.
   **/
  generateId?: (options: GenerateIdOptions) => string;
  /** Whether to store the raw body of each entry in the data store. Defaults to `true` */
  retainBody?: boolean;
}

const ignorePatterns = ["**/node_modules/**"];

export function textileLoader(textileOptions: TextileLoaderOptions = {}): Loader {
  const pattern = textileOptions.pattern ?? "**/*.textile";

  if (checkPrefix(pattern, "../")) {
    throw new Error(
      "Glob patterns cannot start with `../`. Set the `base` option to a parent directory instead.",
    );
  }
  if (checkPrefix(pattern, "/")) {
    throw new Error(
      "Glob patterns cannot start with `/`. Set the `base` option to a parent directory or use a relative path instead.",
    );
  }

  const generateIdFunc =
    textileOptions.generateId ?? ((opts: GenerateIdOptions) => generateIdDefault(opts));
  const generateId = (opts: GenerateIdOptions) => String(generateIdFunc(opts));

  return {
    name: "textile-loader",
    load: async ({ config, collection, store, logger, parseData, watcher }) => {
      const baseDir = textileOptions.base ? new URL(textileOptions.base, config.root) : config.root;

      if (!baseDir.pathname.endsWith("/")) {
        baseDir.pathname = `${baseDir.pathname}/`;
      }

      const basePath = fileURLToPath(baseDir);
      const rootPath = fileURLToPath(config.root);
      const relativeBasePath = path.relative(rootPath, basePath);

      const baseDirExists = existsSync(baseDir);

      if (!baseDirExists) {
        logger.warn(`The base directory "${basePath}" does not exist.`);
      }

      const files = await glob(pattern, {
        cwd: basePath,
        expandDirectories: false,
        ignore: ignorePatterns,
      });

      if (baseDirExists && files.length === 0) {
        logger.warn(`No files found matching "${pattern}" in directory "${relativeBasePath}"`);
      }

      const render = await createRenderer(textileOptions, config.image);

      // Remembers the ID of each file, so a changed or deleted file can replace or remove its entry.
      const idByFilePath = new Map<string, string>();

      async function syncFile(file: string): Promise<void> {
        const absolutePath = path.join(basePath, file);
        const relativePath = toPosixRelative(rootPath, absolutePath);

        let content: string;
        try {
          content = await readFile(absolutePath, "utf-8");
        } catch (error) {
          // Like Astro's glob loader, skip files that can't be read.
          logger.error(`Error reading ${file}: ${errorMessage(error)}`);
          return;
        }

        let parsed: ReturnType<typeof parseFrontmatter>;
        try {
          parsed = parseFrontmatter(content);
        } catch (error) {
          throw new Error(`Invalid frontmatter in ${relativePath}: ${errorMessage(error)}`, {
            cause: error,
          });
        }
        const { frontmatter, content: doc } = parsed;

        const id = generateId({ entry: file, base: baseDir, data: frontmatter });

        // The ID changes when the file's `slug` changes.
        const oldId = idByFilePath.get(absolutePath);
        if (oldId !== undefined && oldId !== id) {
          store.delete(oldId);
        }

        // Follow Astro's glob loader: the last entry wins unless `prerenderConflictBehavior` is "error".
        const existingFilePath = store.get(id)?.filePath;
        if (
          existingFilePath &&
          existingFilePath !== relativePath &&
          existsSync(new URL(existingFilePath, config.root)) &&
          config.prerenderConflictBehavior !== "ignore"
        ) {
          const message = `Collection "${collection}" has multiple entries with the ID "${id}": ${existingFilePath} and ${relativePath}. IDs must be unique.`;

          if (config.prerenderConflictBehavior === "error") {
            throw new Error(message);
          }

          logger.warn(message);
        }

        const body = doc.replace(/^\uFEFF?(?:\r?\n)*/, "");

        // Like Astro's glob loader, keep the entry without rendered content if rendering fails.
        let rendered: Awaited<ReturnType<typeof render>> | undefined;
        try {
          rendered = await render(textile(body));
        } catch (error) {
          logger.error(`Error rendering ${file}: ${errorMessage(error)}`);
        }

        const data = await parseData({
          id,
          data: {
            ...frontmatter,
          },
          // Astro resolves `image()` paths from this file's directory, so it must be absolute.
          filePath: absolutePath,
        });

        store.set({
          id,
          data,
          body: textileOptions.retainBody === false ? undefined : body,
          filePath: relativePath,
          rendered: rendered && {
            html: rendered.html,
            metadata: { ...rendered.metadata, frontmatter },
          },
          // Like Astro's glob loader, so `astro:assets` can import the images.
          assetImports: rendered?.metadata.imagePaths,
        });
        idByFilePath.set(absolutePath, id);
      }

      store.clear();

      for (const file of files) {
        await syncFile(file);
      }

      // Only set in dev.
      if (!watcher) {
        return;
      }

      const patterns = Array.isArray(pattern) ? pattern : [pattern];
      const isMatch = picomatch(
        patterns.filter((p) => !p.startsWith("!")),
        {
          ignore: [
            ...ignorePatterns,
            ...patterns.filter((p) => p.startsWith("!")).map((p) => p.slice(1)),
          ],
        },
      );
      const toEntry = (changedPath: string): string | undefined => {
        const entry = toPosixRelative(basePath, changedPath);
        return !entry.startsWith("../") && isMatch(entry) ? entry : undefined;
      };

      const onChange = async (changedPath: string): Promise<void> => {
        const entry = toEntry(changedPath);
        if (!entry) {
          return;
        }

        try {
          await syncFile(entry);
          logger.info(`Reloaded data from ${entry}`);
        } catch (error) {
          logger.error(`Failed to reload ${entry}: ${errorMessage(error)}`);
        }
      };

      watcher.add(basePath);
      watcher.on("change", onChange);
      watcher.on("add", onChange);
      watcher.on("unlink", (deletedPath) => {
        if (!toEntry(deletedPath)) {
          return;
        }

        const id = idByFilePath.get(deletedPath);
        if (id !== undefined) {
          store.delete(id);
          idByFilePath.delete(deletedPath);
        }
      });
    },
  } satisfies Loader;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toPosixRelative(from: string, to: string): string {
  return path.relative(from, to).split(path.sep).join("/");
}
