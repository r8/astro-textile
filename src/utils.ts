// From `astro/src/content/loaders/glob.ts`
export function checkPrefix(pattern: string | Array<string>, prefix: string) {
  if (Array.isArray(pattern)) {
    return pattern.some((p) => p.startsWith(prefix));
  }

  return pattern.startsWith(prefix);
}
