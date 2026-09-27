import { expect, test } from "vitest";
import { checkPrefix, generateIdDefault } from "../src/utils";

test("detects a prefix on a string pattern", () => {
  expect(checkPrefix("../posts/*.textile", "../")).toBe(true);
  expect(checkPrefix("/posts/*.textile", "/")).toBe(true);
});

test("returns false when a string pattern lacks the prefix", () => {
  expect(checkPrefix("posts/*.textile", "../")).toBe(false);
  expect(checkPrefix("posts/../*.textile", "../")).toBe(false);
  expect(checkPrefix("./posts/*.textile", "/")).toBe(false);
});

test("detects a prefix on any pattern in an array", () => {
  expect(checkPrefix(["posts/*.textile", "../drafts/*.textile"], "../")).toBe(true);
});

test("returns false when no pattern in an array has the prefix", () => {
  expect(checkPrefix(["posts/*.textile", "drafts/*.textile"], "../")).toBe(false);
  expect(checkPrefix([], "../")).toBe(false);
});

const base = new URL("file:///content/");

test("generates an ID from the entry path without the extension", () => {
  expect(generateIdDefault({ entry: "post.textile", base, data: {} })).toBe("post");
  expect(generateIdDefault({ entry: "blog/2024/post.textile", base, data: {} })).toBe(
    "blog/2024/post",
  );
});

test("slugifies each path segment", () => {
  expect(generateIdDefault({ entry: "My Blog/Hello World.textile", base, data: {} })).toBe(
    "my-blog/hello-world",
  );
});

test("drops a trailing index segment", () => {
  expect(generateIdDefault({ entry: "guides/index.textile", base, data: {} })).toBe("guides");
});

test("uses the slug from the data when present", () => {
  expect(generateIdDefault({ entry: "post.textile", base, data: { slug: "custom" } })).toBe(
    "custom",
  );
  expect(generateIdDefault({ entry: "post.textile", base, data: { slug: 42 } })).toBe("42");
});

test("keeps # and ? in file names", () => {
  expect(generateIdDefault({ entry: "a#b.textile", base, data: {} })).toBe("ab");
  expect(generateIdDefault({ entry: "a?b.textile", base, data: {} })).toBe("ab");
});
