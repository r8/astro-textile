import type { AstroConfig, MarkdownHeading } from "astro";
import { isRemoteAllowed } from "astro/assets/utils";
import type { Element, Parents, Root } from "hast";
import { toHtml } from "hast-util-to-html";
import Slugger from "github-slugger";
import { htmlToHast } from "satteri";
import { createCodeHighlighter, type HighlightOptions } from "./highlight";
import { textContent } from "./utils";

export interface RenderedMetadata {
  headings: Array<MarkdownHeading>;
  localImagePaths: Array<string>;
  remoteImagePaths: Array<string>;
  imagePaths: Array<string>;
}

// Mirrors `HAST_PRESERVED_PROPERTIES` in `@astrojs/markdown-satteri`.
const preservedImageProperties = new Set(["className", "htmlFor"]);

const headingTags = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

function visitElements(parent: Parents, visitor: (element: Element) => void): void {
  for (const child of parent.children) {
    if (child.type === "element") {
      visitor(child);
      visitElements(child, visitor);
    }
  }
}

// Mirrors `createHeadingIdsPlugin` in `@astrojs/markdown-satteri`.
function addHeadingIds(tree: Root): Array<MarkdownHeading> {
  const slugger = new Slugger();
  const headings: Array<MarkdownHeading> = [];

  visitElements(tree, (element) => {
    if (!headingTags.has(element.tagName)) {
      return;
    }

    const text = textContent(element);
    const { id } = element.properties;
    const slug = typeof id === "string" ? id : slugger.slug(text);
    if (typeof id !== "string") {
      element.properties.id = slug;
    }

    headings.push({ depth: Number.parseInt(element.tagName[1], 10), slug, text });
  });

  return headings;
}

// Mirrors `createCollectImagesPlugin` and `createImageMarkerPlugin` in `@astrojs/markdown-satteri`,
// so Astro optimizes images through `astro:assets` like it does for Markdown.
function markImages(
  tree: Root,
  image: AstroConfig["image"] | undefined,
): Pick<RenderedMetadata, "localImagePaths" | "remoteImagePaths"> {
  const domains = image?.domains ?? [];
  const remotePatterns = image?.remotePatterns ?? [];
  const localImagePaths = new Set<string>();
  const remoteImagePaths = new Set<string>();
  const indexBySrc = new Map<string, number>();

  visitElements(tree, (element) => {
    const { src: rawSrc, ...rest } = element.properties;
    if (element.tagName !== "img" || typeof rawSrc !== "string" || !rawSrc) {
      return;
    }

    const src = decodeURI(rawSrc);
    const isRemote = URL.canParse(src);
    if (isRemote) {
      if (!isRemoteAllowed(src, { domains, remotePatterns })) {
        return;
      }
      remoteImagePaths.add(src);
    } else if (src.startsWith("/")) {
      return;
    } else {
      localImagePaths.add(src);
    }

    const index = indexBySrc.get(rawSrc) ?? 0;
    indexBySrc.set(rawSrc, index + 1);

    const imageProperties: Record<string, unknown> = { ...rest, src, index };
    if (isRemote && !("width" in rest) && !("height" in rest)) {
      imageProperties.inferSize = true;
    }

    element.properties = Object.fromEntries(
      Object.entries(rest).filter(([key]) => preservedImageProperties.has(key)),
    );
    element.properties.__ASTRO_IMAGE_ = JSON.stringify(imageProperties);
  });

  return { localImagePaths: [...localImagePaths], remoteImagePaths: [...remoteImagePaths] };
}

export async function createRenderer(
  options: HighlightOptions,
  image: AstroConfig["image"] | undefined,
): Promise<(html: string) => Promise<{ html: string; metadata: RenderedMetadata }>> {
  const highlight = await createCodeHighlighter(options);

  return async (html) => {
    const tree = htmlToHast(html, { fragment: true }) as Root;

    // Same order as Astro's Markdown pipeline: highlight, then images, then heading IDs.
    await highlight?.(tree);
    const { localImagePaths, remoteImagePaths } = markImages(tree, image);
    const headings = addHeadingIds(tree);

    return {
      html: toHtml(tree, { characterReferences: { useNamedReferences: true } }),
      metadata: {
        headings,
        localImagePaths,
        remoteImagePaths,
        imagePaths: [...localImagePaths, ...remoteImagePaths],
      },
    };
  };
}
