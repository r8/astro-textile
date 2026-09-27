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
    loader: textileLoader({ base: "./src/content/posts" }),
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

As with Markdown:

- Headings get slug IDs (unless they set one, e.g. `h2(#intro).`), and `render()` returns them as `headings`.
- Relative images, like `!./cover.png(Cover)!`, are resolved from the entry's directory and optimized with `astro:assets`. Remote images are optimized when they're allowed by `image.domains` or `image.remotePatterns`.

## Options

| Option                | Description                                                                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pattern`             | Glob pattern (or array of patterns) matching the files to load, relative to `base`. Cannot start with `../` or `/`. Files inside `node_modules` are skipped. Defaults to `"**/*.textile"`. |
| `base`                | Directory to resolve `pattern` from, relative to the project root, or an absolute file URL. Defaults to the project root.                                                                  |
| `generateId`          | Function that returns the ID for an entry. Must be unique per collection. See [Entry IDs](#entry-ids).                                                                                     |
| `retainBody`          | Store the raw Textile source (without frontmatter) as `entry.body`. Defaults to `true`.                                                                                                    |
| `syntaxHighlight`     | Same as Astro's `markdown.syntaxHighlight`. Defaults to `"shiki"`; set to `false` to disable code highlighting.                                                                            |
| `shikiConfig`         | Same as Astro's `markdown.shikiConfig`, e.g. `{ theme: "dracula" }`.                                                                                                                       |
| `trimLeadingNewlines` | Remove blank lines at the start of code blocks before highlighting, e.g. after `bc..`. Has no effect when highlighting is disabled. Defaults to `false`.                                   |

## Entry IDs

By default, IDs work like Astro's `glob()` loader. Each ID is the file path relative to `base`, without the extension. Every path segment is turned into a slug, and a trailing `index` is dropped:

| File (relative to `base`)  | ID                 |
| -------------------------- | ------------------ |
| `first-post.textile`       | `first-post`       |
| `2024/Hello World.textile` | `2024/hello-world` |
| `guides/index.textile`     | `guides`           |

A `slug` field in the frontmatter overrides the generated ID.

To build IDs another way, pass `generateId`. It receives a `GenerateIdOptions` object with `entry` (the file path relative to `base`), `base` (the base directory as a file URL) and `data` (the parsed frontmatter, not yet validated):

```ts
textileLoader({
    base: "./src/content/posts",
    generateId: ({ entry }) => entry.replace(/\.textile$/, ""),
});
```

## License

[MIT](LICENSE)
