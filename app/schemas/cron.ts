import { z } from "zod";
import { SchemaCategorySchema } from "./dynamic-schema";

export const CronJobSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, "ID must be kebab-case"),
  name: z.string().min(1),
  schema_id: z.string().min(1, "Must select a schema"),
  category: SchemaCategorySchema,
  // NOTE: This Zod refine check is purely for UX to catch obvious configuration errors early.
  // The authoritative security boundary for SSRF protection (DNS rebinding, local IPs, etc.) 
  // is enforced by the isSafeUrl() function inside the workers/cron implementation.
  api_endpoint: z.string().url("Must be a valid URL").refine((val) => {
    try {
      const url = new URL(val);
      return url.protocol === "https:";
    } catch {
      return false;
    }
  }, "Must be a valid HTTPS URL"),
  schedule: z.enum(["hourly", "daily", "weekly", "manual"]).default("manual"),
  active: z.boolean().default(true),
  // Maps schema field keys (e.g. "max_health") to API JSON paths (e.g. "stats.hp")
  field_mappings: z.record(z.string(), z.string()).default({}),
  notify_on_success: z.object({
    topic: z.string().default("all_users"),
    title: z.string(),
    body: z.string(),
    data: z.record(z.string(), z.string()).optional()
  }).optional()
});

export type CronJob = z.infer<typeof CronJobSchema>;
