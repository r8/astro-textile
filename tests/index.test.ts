import type { LoaderContext } from "astro/loaders";
import { expect, test, vi } from "vitest";
import { textileLoader, type TextileLoaderOptions } from "../src";

type Entry = { id: string; rendered?: { html: string }; [key: string]: unknown };

async function runLoader(
  initial: Entry[] = [],
  options: TextileLoaderOptions = { base: "posts", syntaxHighlight: false },
) {
  const entries = new Map<string, Entry>(initial.map((entry) => [entry.id, entry]));
  const store = {
    entries,
    set: (entry: Entry) => entries.set(entry.id, entry),
    clear: vi.fn(() => entries.clear()),
  };
  const parseData = vi.fn(async ({ data }: { data: Record<string, unknown> }) => data);

  await textileLoader(options).load({
    config: { root: new URL("./fixtures/", import.meta.url) },
    store,
    parseData,
  } as unknown as LoaderContext);

  return { store, parseData };
}

test("loads only .textile files", async () => {
  const { store } = await runLoader();

  expect([...store.entries.keys()].sort()).toEqual(["first", "second"]);
});

test("parses frontmatter and renders textile to HTML", async () => {
  const { store, parseData } = await runLoader();
  const frontmatter = { title: "First post", tags: ["a", "b"] };

  expect(store.entries.get("first")).toEqual({
    id: "first",
    data: frontmatter,
    filePath: "posts/first.textile",
    rendered: {
      html: "<h1>Heading</h1>\n<p>Some <strong>bold</strong> text.</p>",
      metadata: frontmatter,
    },
  });
  expect(parseData).toHaveBeenCalledWith({
    id: "first",
    data: frontmatter,
    filePath: "posts/first.textile",
  });
});

test("clears the store before loading", async () => {
  const { store } = await runLoader([{ id: "stale" }]);

  expect(store.clear).toHaveBeenCalledOnce();
  expect(store.entries.has("stale")).toBe(false);
});

async function renderCode(options: Omit<TextileLoaderOptions, "base"> = {}) {
  const { store } = await runLoader([], { base: "code", ...options });
  const html = store.entries.get("code")?.rendered?.html;

  expect(html).toBeTypeOf("string");
  return html as string;
}

test("highlights code blocks with Shiki by default", async () => {
  const html = await renderCode();

  expect(html).toContain('class="astro-code github-dark"');
  expect(html).toContain('data-language="js"');
  expect(html).toContain('data-language="ts"');
  expect(html).toContain('data-language="plaintext"');
  expect(html).not.toContain("&amp;lt;");
});

test("applies the Shiki theme from shikiConfig", async () => {
  const html = await renderCode({ shikiConfig: { theme: "dracula" } });

  expect(html).toContain('class="astro-code dracula"');
});

test("highlights code blocks with Prism", async () => {
  const html = await renderCode({ syntaxHighlight: "prism" });

  expect(html).toContain('<pre class="language-js" data-language="js">');
  expect(html).toContain('<span class="token keyword">const</span>');
});

test("leaves code blocks untouched when highlighting is disabled", async () => {
  const html = await renderCode({ syntaxHighlight: false });

  expect(html).toBe(
    [
      '<pre class="language-js"><code class="language-js">const tag = "&lt;b&gt;" &amp;&amp; 1;</code></pre>',
      '<pre lang="ts"><code lang="ts">let x: number = 1;</code></pre>',
      "<pre><code>plain &amp; text</code></pre>",
    ].join("\n"),
  );
});

test("skips languages listed in excludeLangs", async () => {
  const html = await renderCode({ syntaxHighlight: { type: "shiki", excludeLangs: ["js"] } });

  expect(html).toContain('<code class="language-js">');
  expect(html).not.toContain('data-language="js"');
  expect(html).toContain('data-language="ts"');
});
