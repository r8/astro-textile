# astro-textile

[![CI](https://github.com/r8/astro-textile/actions/workflows/ci.yml/badge.svg)](https://github.com/r8/astro-textile/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/astro-textile.svg)](https://www.npmjs.com/package/astro-textile)

Textile integration for Astro. Provides a content loader that renders `.textile` files for Astro content collections.

## Installation

```sh
npm install astro-textile
```

Requires Astro 7.3+ and Node.js 22.12+.

## Usage

Define a collection with `textileLoader` in `src/content.config.ts`:

```ts
import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { textileLoader } from "astro-textile";

const posts = defineCollection({
    loader: textileLoader({ pattern: "**/*.textile", base: "./src/content/posts" }),
    schema: z.object({
        title: z.string(),
        tags: z.array(z.string()).optional(),
    }),
});

export const collections = { posts };
```

Write posts as `.textile` files with YAML (`---`) or TOML (`+++`) frontmatter:

```textile
---
title: First post
tags: [astro, textile]
---
h1. Hello

Some *bold* text.

bc(language-js). console.log("highlighted");
```

Render them like any other collection entry:

```astro
---
import { getEntry, render } from "astro:content";

const post = await getEntry("posts", "first-post");
const { Content } = await render(post);
---

<h1>{post.data.title}</h1>
<Content />
```

## Options

| Option            | Description                                                                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pattern`         | Glob pattern (or array of patterns) matching the files to load, relative to `base`, e.g. `"**/*.textile"`. Cannot start with `../` or `/`. Required. |
| `base`            | Directory to resolve `pattern` from, relative to the project root, or an absolute file URL. Defaults to the project root.                            |
| `syntaxHighlight` | Same as Astro's `markdown.syntaxHighlight`. Defaults to `"shiki"`; set to `false` to disable code highlighting.                                      |
| `shikiConfig`     | Same as Astro's `markdown.shikiConfig`, e.g. `{ theme: "dracula" }`.                                                                                 |

## License

[MIT](LICENSE)
