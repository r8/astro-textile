import { satteriCreateHighlightFn } from "@astrojs/markdown-satteri";
import type { AstroUserConfig, ShikiConfig } from "astro";
import type { Element, ElementContent, Nodes, Parents } from "hast";
import { toHtml } from "hast-util-to-html";
import { htmlToHast } from "satteri";

type MarkdownConfig = NonNullable<AstroUserConfig["markdown"]>;

export interface HighlightOptions {
  syntaxHighlight?: MarkdownConfig["syntaxHighlight"];
  shikiConfig?: Partial<ShikiConfig>;
  /** Remove blank lines at the start of code blocks before highlighting */
  trimLeadingNewlines?: boolean;
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

function getClassNames(element: Element): Array<string> {
  const { className, class: classString } = element.properties;

  if (Array.isArray(className)) {
    return className.filter((name): name is string => typeof name === "string");
  }

  // Shiki sets `class` as a string instead of a `className` array.
  if (typeof classString === "string") {
    return classString.split(/\s+/).filter(Boolean);
  }

  return [];
}

// Keep the `id` and custom classes Textile put on the block, e.g. with `bc(custom#example).`
function copyBlockAttributes(from: Element, to: Element): void {
  const { id } = from.properties;
  if (id !== undefined) {
    to.properties.id = id;
  }

  const customClassNames = getClassNames(from).filter((name) => !name.startsWith("language-"));
  if (customClassNames.length === 0) {
    return;
  }

  const classNames = [...new Set([...getClassNames(to), ...customClassNames])];
  if (typeof to.properties.class === "string") {
    to.properties.class = classNames.join(" ");
  } else {
    to.properties.className = classNames;
  }
}

export async function createCodeHighlighter({
  syntaxHighlight = "shiki",
  shikiConfig,
  trimLeadingNewlines = false,
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

      let source = textContent(code).replace(/\n$/, "");
      if (trimLeadingNewlines) {
        source = source.replace(/^\n+/, "");
      }

      const highlighted = await highlight(source, lang);
      if (highlighted) {
        if (highlighted.type === "element") {
          copyBlockAttributes(child, highlighted);
        }
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
