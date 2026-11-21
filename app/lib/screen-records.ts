import { APP_POLICY, type AppLimits } from "./screen-policy";

import type { RecordSource } from "./screen-model";

// Records as the app lists them (zms model.ts selectRecords): a block's source, its
// records sorted by the app's rule, and capped at the app's list size.

/** Where a source's records come from: its category's schemas, in the app's order, and the app's limits. */
export interface ListScope {
  schemas: readonly { id: string }[];
  limits?: AppLimits;
}

export function normalizeSource(raw: unknown): RecordSource | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const source = raw as Record<string, unknown>;
  return typeof source.category === "string" && source.category ? (source as unknown as RecordSource) : undefined;
}

/** A sort value the app treats as absent; forms save a cleared text field as "". */
function isMissing(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

function asText(value: unknown): string {
  return String(value);
}

/** Two present values: numbers by value, anything else as text, numbers inside it by value and case aside. */
function compareValues(first: unknown, second: unknown): number {
  if (typeof first === "number" && typeof second === "number") {
    return first - second;
  }
  return asText(first).localeCompare(asText(second), undefined, { numeric: true, sensitivity: "base" });
}

/**
 * Records sorted by `key`. Records without it go last in both orders, and equal
 * values keep file order. The app sorts with this same rule (zms model.ts).
 */
export function sortByField<T extends Record<string, unknown>>(records: readonly T[], key: string, order: "asc" | "desc" = "asc"): T[] {
  const direction = order === "desc" ? -1 : 1;
  return [...records].sort((first, second) => {
    const isFirstMissing = isMissing(first[key]);
    const isSecondMissing = isMissing(second[key]);
    // Records without the key go after those with it, in both orders.
    if (isFirstMissing || isSecondMissing) {
      return Number(isFirstMissing) - Number(isSecondMissing);
    }
    return direction * compareValues(first[key], second[key]);
  });
}

/** A record's schema: its schema_id when the category has it, else the category's first schema. */
function schemaOf(record: Record<string, unknown>, schemas: readonly { id: string }[]): string {
  return schemas.find((schema) => schema.id === record.schema_id)?.id ?? schemas[0].id;
}

/** How many records a source shows: its limit, at most the app's list size. */
function listLimit(source: RecordSource, limits: AppLimits): number {
  return typeof source.limit === "number" && source.limit > 0 ? Math.min(source.limit, limits.listItems) : limits.listItems;
}

/**
 * The records a source shows in the app: its schema's (a record without a known
 * schema_id follows the category's first schema), sorted, and at most the app's
 * list size.
 */
export function previewRecords<T extends Record<string, unknown>>(records: readonly T[], source: RecordSource | undefined, scope: ListScope): T[] {
  if (!source) {
    return [];
  }
  const { schemas, limits = APP_POLICY.limits } = scope;
  const ofSchema = source.schema && schemas.length > 0 ? records.filter((record) => schemaOf(record, schemas) === source.schema) : [...records];
  const sorted = source.sort ? sortByField(ofSchema, source.sort, source.order) : ofSchema;
  return sorted.slice(0, listLimit(source, limits));
}
