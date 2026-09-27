import path from "node:path";
import { slug as githubSlug } from "github-slugger";
import type { Nodes } from "hast";

export interface GenerateIdOptions {
  /** The path to the entry file, relative to the base directory. */
  entry: string;

  /** The base directory URL. */
  base: URL;
  /** The parsed, unvalidated data of the entry. */
  data: Record<string, unknown>;
}

// From `astro/src/content/loaders/glob.ts`
export function checkPrefix(pattern: string | Array<string>, prefix: string) {
  if (Array.isArray(pattern)) {
    return pattern.some((p) => p.startsWith(prefix));
  }

  return pattern.startsWith(prefix);
}

export function generateIdDefault({ entry, data }: GenerateIdOptions): string {
  if (data.slug) {
    return String(data.slug);
  }

  const extension = path.posix.extname(entry);
  const withoutFileExt = entry.slice(0, entry.length - extension.length);

  const slug = withoutFileExt
    .split("/")
    // Slugify each route segment to handle capitalization and spaces.
    // Note: using `slug` instead of `new Slugger()` means no slug deduping.
    .map((segment) => githubSlug(segment))
    .join("/")
    .replace(/\/index$/, "");

  return slug;
}

export function textContent(node: Nodes): string {
  if (node.type === "text") {
    return node.value;
  }

  if ("children" in node) {
    return node.children.map(textContent).join("");
  }

  return "";
}
