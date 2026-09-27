import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { glob } from "tinyglobby";
import type { Loader } from "astro/loaders";
import { parseFrontmatter } from "astro/markdown";
import textile from "textile-js";
import { createCodeHighlighter, type HighlightOptions } from "./highlight";
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
}

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
    load: async ({ config, collection, store, logger, parseData }) => {
      const baseDir = textileOptions.base ? new URL(textileOptions.base, config.root) : config.root;

      if (!baseDir.pathname.endsWith("/")) {
        baseDir.pathname = `${baseDir.pathname}/`;
      }

      const relativeBasePath = path.relative(fileURLToPath(config.root), fileURLToPath(baseDir));

      const baseDirExists = existsSync(baseDir);

      if (!baseDirExists) {
        logger.warn(`The base directory "${fileURLToPath(baseDir)}" does not exist.`);
      }

      const files = await glob(pattern, {
        cwd: fileURLToPath(baseDir),
        expandDirectories: false,
        ignore: ["**/node_modules/**"],
      });

      if (baseDirExists && files.length === 0) {
        logger.warn(`No files found matching "${pattern}" in directory "${relativeBasePath}"`);
      }

      const highlight = await createCodeHighlighter(textileOptions);

      store.clear();

      const filePathById = new Map<string, string>();

      for (const file of files) {
        const absolutePath = path.join(fileURLToPath(baseDir), file);
        const relativePath = path
          .relative(fileURLToPath(config.root), absolutePath)
          .split(path.sep)
          .join("/");

        const content = await readFile(absolutePath, "utf-8");
        const { frontmatter, content: doc } = parseFrontmatter(content);

        const id = generateId({ entry: file, base: baseDir, data: frontmatter });

        // Follow Astro's glob loader: the last entry wins unless `prerenderConflictBehavior` is "error".
        const existingFilePath = filePathById.get(id);
        if (existingFilePath && config.prerenderConflictBehavior !== "ignore") {
          const message = `Collection "${collection}" has multiple entries with the ID "${id}": ${existingFilePath} and ${relativePath}. IDs must be unique.`;

          if (config.prerenderConflictBehavior === "error") {
            throw new Error(message);
          }

          logger.warn(message);
        }
        filePathById.set(id, relativePath);

        const body = await highlight(textile(doc.replace(/^\uFEFF?(?:\r?\n)*/, "")));

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
          filePath: relativePath,
          rendered: {
            html: body,
            metadata: { frontmatter },
          },
        });
      }
    },
  } satisfies Loader;
}
