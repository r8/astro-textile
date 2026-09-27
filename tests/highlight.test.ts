import { expect, test } from "vitest";
import type { TextileLoaderOptions } from "../src";
import { runLoader } from "./helpers";

async function renderCode(
  options: Omit<TextileLoaderOptions, "base" | "pattern"> = {},
  base = "code",
) {
  const { store } = await runLoader([], { base, ...options });
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

test("keeps leading newlines in code blocks by default", async () => {
  const html = await renderCode({ syntaxHighlight: "prism" }, "leading-newlines");

  expect(html).toContain('<code class="language-js">\n\n<span class="token keyword">const</span>');
});

test("trims leading newlines from code blocks with trimLeadingNewlines", async () => {
  const html = await renderCode(
    { syntaxHighlight: "prism", trimLeadingNewlines: true },
    "leading-newlines",
  );

  expect(html).toContain('<code class="language-js"><span class="token keyword">const</span>');
  expect(html).toContain(
    '<span class="token punctuation">;</span>\n\n<span class="token keyword">const</span> b',
  );
});

test("trims leading newlines before highlighting with Shiki", async () => {
  const html = await renderCode({ trimLeadingNewlines: true }, "leading-newlines");

  expect(html).toContain('<code><span class="line"><span style="color:#F97583">const</span>');
});
