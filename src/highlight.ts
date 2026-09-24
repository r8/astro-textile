import { satteriCreateHighlightFn } from "@astrojs/markdown-satteri";
import type { AstroUserConfig, ShikiConfig } from "astro";
import type { Element, ElementContent, Nodes, Parents } from "hast";
import { toHtml } from "hast-util-to-html";
import { htmlToHast } from "satteri";

type MarkdownConfig = NonNullable<AstroUserConfig["markdown"]>;

export interface HighlightOptions {
  syntaxHighlight?: MarkdownConfig["syntaxHighlight"];
  shikiConfig?: Partial<ShikiConfig>;
}

// Mirrors Astro's `defaultExcludeLanguages`.
const defaultExcludeLanguages = ["math"];

function findCode(pre: Element): Element | undefined {
  return pre.children.find(
    (child): child is Element => child.type === "element" && child.tagName === "code",
  );
}

// textile-js emits `class="language-js"` for `bc(language-js).` and `lang="js"` for `bc[js].`.
function getLanguage(code: Element): string {
  const { className, lang } = code.properties;

  const languageClass = Array.isArray(className)
    ? className.find((name) => typeof name === "string" && name.startsWith("language-"))
    : undefined;

  if (typeof languageClass === "string") {
    return languageClass.slice("language-".length);
  }

  if (typeof lang === "string" && lang) {
    return lang;
  }

  return "plaintext";
}

function textContent(node: Nodes): string {
  if (node.type === "text") {
    return node.value;
  }

  if ("children" in node) {
    return node.children.map(textContent).join("");
  }

  return "";
}

export async function createCodeHighlighter({
  syntaxHighlight = "shiki",
  shikiConfig,
}: HighlightOptions): Promise<(html: string) => Promise<string>> {
  const { type = "shiki", excludeLangs = [] } =
    typeof syntaxHighlight === "object" ? syntaxHighlight : {};

  const highlight = await satteriCreateHighlightFn(
    typeof syntaxHighlight === "object" ? { type, excludeLangs } : syntaxHighlight,
    shikiConfig,
  );

  if (!highlight) {
    return async (html) => html;
  }

  const skipLangs = [...defaultExcludeLanguages, ...excludeLangs];

  const visit = async (parent: Parents): Promise<void> => {
    for (const [index, child] of parent.children.entries()) {
      if (child.type !== "element") {
        continue;
      }

      const code = child.tagName === "pre" ? findCode(child) : undefined;
      if (!code) {
        await visit(child);
        continue;
      }

      const lang = getLanguage(code);
      if (skipLangs.includes(lang)) {
        continue;
      }

      const highlighted = await highlight(textContent(code).replace(/\n$/, ""), lang);
      if (highlighted) {
        parent.children[index] = highlighted as ElementContent;
      }
    }
  };

  return async (html) => {
    if (!html.includes("<pre")) {
      return html;
    }

    const tree = htmlToHast(html, { fragment: true });
    if (tree.type !== "root") {
      return html;
    }

    await visit(tree);

    return toHtml(tree);
  };
}
