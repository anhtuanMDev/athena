import { z } from "zod";
import { SchemaCategorySchema } from "./dynamic-schema";

/**
 * One object per match of `each` (a JSON path or CSS selector inside the
 * item), its sub-fields mapped by the same rules relative to that match.
 */
export const ObjectArrayRuleSchema = z.object({
  each: z.string(),
  fields: z.record(z.string(), z.string()).default({}),
});

export const FieldRuleSchema = z.union([z.string(), ObjectArrayRuleSchema]);
export type FieldRule = z.infer<typeof FieldRuleSchema>;

export const CronJobSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, "ID must be kebab-case"),
  name: z.string().min(1),
  schema_id: z.string().min(1, "Must select a schema"),
  category: SchemaCategorySchema,
  // NOTE: This Zod refine check is purely for UX to catch obvious configuration errors early.
  // The authoritative security boundary for SSRF protection (DNS rebinding, local IPs, etc.)
  // is enforced by isSafeUrl() in app/lib/importer/fetch-source.ts.
  api_endpoint: z.string().url("Must be a valid URL").refine((val) => {
    try {
      const url = new URL(val);
      return url.protocol === "https:";
    } catch {
      return false;
    }
  }, "Must be a valid HTTPS URL"),
  // How the source is read: a JSON API, or an HTML page read with CSS selectors.
  source_format: z.enum(["json", "html"]).default("json"),
  // Where the list of items is: a JSON path to an array (empty for the whole
  // response), or a CSS selector matching each item on an HTML page.
  items_path: z.string().default(""),
  // The schema field whose value becomes each record's id, as a slug.
  id_from: z.string().default(""),
  // At most this many new drafts per run, so a misconfigured job can't flood the queue.
  max_items: z.coerce.number().int().min(1).max(50).default(10),
  schedule: z.enum(["hourly", "daily", "weekly", "manual"]).default("manual"),
  active: z.boolean().default(true),
  // Maps schema field keys (e.g. "title") to rules: a JSON path, a CSS selector
  // ("h3", "a@href"), a constant ("=Live"), optionally piped through transforms
  // ("time | date"). Object-array fields take { each, fields }.
  field_mappings: z.record(z.string(), FieldRuleSchema).default({}),
  notify_on_success: z.object({
    topic: z.string().default("all_users"),
    title: z.string(),
    body: z.string(),
    data: z.record(z.string(), z.string()).optional()
  }).optional()
});

export type CronJob = z.infer<typeof CronJobSchema>;
