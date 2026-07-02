export type DiffEntry = {
  type: "added" | "removed" | "changed";
  path: string;
  from?: unknown;
  to?: unknown;
};

export function computeDiff(prev: unknown, next: unknown, basePath = ""): DiffEntry[] {
  const diffs: DiffEntry[] = [];

  if (prev === next) return diffs;

  if (prev === undefined || prev === null) {
    diffs.push({ type: "added", path: basePath, to: next });
    return diffs;
  }

  if (next === undefined || next === null) {
    diffs.push({ type: "removed", path: basePath, from: prev });
    return diffs;
  }

  if (typeof prev !== typeof next) {
    diffs.push({ type: "changed", path: basePath, from: prev, to: next });
    return diffs;
  }

  if (Array.isArray(prev) && Array.isArray(next)) {
    if (prev.length !== next.length || prev.some((v, i) => JSON.stringify(v) !== JSON.stringify(next[i]))) {
      diffs.push({ type: "changed", path: basePath, from: prev, to: next });
    }
    return diffs;
  }

  if (typeof prev === "object" && prev !== null && typeof next === "object" && next !== null) {
    const prevKeys = new Set([...Object.keys(prev as Record<string, unknown>), ...Object.keys(next as Record<string, unknown>)]);
    for (const key of prevKeys) {
      const childPath = basePath ? `${basePath}.${key}` : key;
      const prevVal = (prev as Record<string, unknown>)[key];
      const nextVal = (next as Record<string, unknown>)[key];
      diffs.push(...computeDiff(prevVal, nextVal, childPath));
    }
    return diffs;
  }

  if (prev !== next) {
    diffs.push({ type: "changed", path: basePath, from: prev, to: next });
  }

  return diffs;
}
