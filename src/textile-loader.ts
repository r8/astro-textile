import path from "node:path";
import { fileURLToPath } from "node:url";
import { readdir, readFile } from "node:fs/promises";
import type { Loader } from "astro/loaders";
import { simplematter } from "simplematter";
import textile from "textile-js";

export function textileLoader(options: { base: string }): Loader {
  return {
    name: "textile-loader",
    load: async ({ config, store, parseData }) => {
      const baseDir = path.resolve(fileURLToPath(config.root), options.base);
      let dirItems = await readdir(baseDir, { withFileTypes: true });
      let files = dirItems
        .filter((item) => item.isFile())
        .filter((item) => path.extname(item.name) === ".textile");

      store.clear();

      for (const file of files) {
        const id = path.basename(file.name, path.extname(file.name));
        const filePath = path.join(baseDir, file.name);
        const relPath = path.relative(fileURLToPath(config.root), filePath);

        const content = await readFile(filePath, "utf-8");
        const [frontmatter, doc] = simplematter(content) as [Record<string, unknown>, string];
        const body = textile(doc);

        const data = await parseData({
          id,
          data: {
            ...frontmatter,
          },
          filePath: relPath,
        });

        store.set({
          id,
          data,
          filePath: relPath,
          rendered: {
            html: body,
            metadata: frontmatter,
          },
        });
      }
    },
  } satisfies Loader;
}
