import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { glob } from "tinyglobby";
import type { Loader } from "astro/loaders";
import { parseFrontmatter } from "astro/markdown";
import textile from "textile-js";
import { createCodeHighlighter, type HighlightOptions } from "./highlight";
import { checkPrefix } from "./utils";

export interface TextileLoaderOptions extends HighlightOptions {
  /** The glob pattern to match files, relative to the base directory */
  pattern: string | Array<string>;
  /** The base directory to resolve the glob pattern from. Relative to the root directory, or an absolute file URL. Defaults to `.` */
  base?: string | URL;
}

export function textileLoader(textileOptions: TextileLoaderOptions): Loader {
  if (checkPrefix(textileOptions.pattern, "../")) {
    throw new Error(
      "Glob patterns cannot start with `../`. Set the `base` option to a parent directory instead.",
    );
  }
  if (checkPrefix(textileOptions.pattern, "/")) {
    throw new Error(
      "Glob patterns cannot start with `/`. Set the `base` option to a parent directory or use a relative path instead.",
    );
  }

  return {
    name: "textile-loader",
    load: async ({ config, store, logger, parseData }) => {
      const baseDir = textileOptions.base ? new URL(textileOptions.base, config.root) : config.root;

      const relativeBasePath = path.relative(fileURLToPath(config.root), fileURLToPath(baseDir));

      const baseDirExists = existsSync(baseDir);

      if (!baseDirExists) {
        logger.warn(`The base directory "${fileURLToPath(baseDir)}" does not exist.`);
      }

      const files = await glob(textileOptions.pattern, {
        cwd: fileURLToPath(baseDir),
        expandDirectories: false,
      });

      if (baseDirExists && files.length === 0) {
        logger.warn(
          `No files found matching "${textileOptions.pattern}" in directory "${relativeBasePath}"`,
        );
      }

      const highlight = await createCodeHighlighter(textileOptions);

      store.clear();

      for (const file of files) {
        const id = path.basename(file, path.extname(file));
        const absolutePath = path.join(fileURLToPath(baseDir), file);
        const relativePath = path.relative(fileURLToPath(config.root), absolutePath);

        const content = await readFile(absolutePath, "utf-8");
        const { frontmatter, content: doc } = parseFrontmatter(content);

        const body = await highlight(textile(doc.trimStart()));

        const data = await parseData({
          id,
          data: {
            ...frontmatter,
          },
          filePath: relativePath,
        });

        store.set({
          id,
          data,
          filePath: relativePath,
          rendered: {
            html: body,
            metadata: frontmatter,
          },
        });
      }
    },
  } satisfies Loader;
}
