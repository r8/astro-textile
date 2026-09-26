import { expect, test } from "vitest";
import { checkPrefix } from "../src/utils";

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
