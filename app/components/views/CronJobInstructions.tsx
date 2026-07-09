import { useState } from "react";
import { ChevronDown, ChevronUp, BookOpen, Zap, GitMerge, Database } from "lucide-react";

interface InstructionSection {
  id: string;
  icon: React.ReactNode;
  color: string;
  title: string;
  subtitle: string;
  rules: { label: string; description: string }[];
  examples?: string[];
}

const SECTIONS: InstructionSection[] = [
  {
    id: "api-response",
    icon: <BookOpen className="w-4 h-4" />,
    color: "blue",
    title: "API Response Definition",
    subtitle: "Define how the API responds — its JSON structure and expected fields.",
    rules: [
      {
        label: "Dot-path notation",
        description:
          'Map each schema field to its JSON path in the API response using dot notation. E.g. "data.hero.stats.health" drills into { data: { hero: { stats: { health: 200 } } } }.',
      },
      {
        label: "Array indexing",
        description:
          'Use bracket notation for arrays: "results[0].value" picks the first element. "items[].name" (no index) will map over every element and collect the "name" field as a list.',
      },
      {
        label: "Root-level fields",
        description:
          'If the field is at the top level of the response, use the key directly: "health", "name", "patch_version".',
      },
      {
        label: "Null / missing fields",
        description:
          "If a field is absent in the API response, the worker will skip it and leave the schema field empty. No error is thrown — design your mappings defensively.",
      },
    ],
    examples: [
      '"data.attributes.health" → { data: { attributes: { health: 250 } } }',
      '"heroes[0].name" → { heroes: [{ name: "Tracer" }] }',
      '"patch" → { patch: "2026.06", ... }',
    ],
  },
  {
    id: "api-params",
    icon: <Zap className="w-4 h-4" />,
    color: "orange",
    title: "API Params / Payload",
    subtitle:
      "Define parameters or payload the worker sends with the request (enum values, timestamps, required params, or chained calls).",
    rules: [
      {
        label: "Static query params",
        description:
          'Append static params directly to the endpoint URL: "https://api.example.com/heroes?game=overwatch&format=json". These are sent on every run unchanged.',
      },
      {
        label: "Dynamic time injection",
        description:
          'Use the special token {{now}} in the URL or payload to inject the current ISO timestamp at execution time: "https://api.example.com/patches?since={{now}}".',
      },
      {
        label: "Enum values",
        description:
          "When an API requires a specific enum string (e.g. region=EU, tier=platinum), hard-code it in the URL or note it in the field mapping value as a constant prefixed with `=`: e.g. mapping value `=EU` will write the literal string \"EU\" to that field without reading from the response.",
      },
      {
        label: "Chained API calls",
        description:
          "If you need data from a second API to build the payload for this one, create a separate cron job for the first call and set its destination schema as the source for this job's endpoint URL param.",
      },
    ],
    examples: [
      '"https://api.example.com/heroes?game=overwatch" — static param',
      '"https://api.example.com/news?after={{now}}" — dynamic timestamp',
      'Mapping value "=EU" — injects literal constant "EU" for a field',
    ],
  },
  {
    id: "data-handling",
    icon: <GitMerge className="w-4 h-4" />,
    color: "purple",
    title: "Data Handling",
    subtitle:
      "How the worker processes the API response — converting types, extracting values, filtering, and transforming before writing.",
    rules: [
      {
        label: "Type coercion",
        description:
          'The worker automatically coerces values to the type declared in the target schema: a "number" field will convert "200" → 200, a "boolean" will convert "true" → true. Mismatches that cannot be coerced are logged as warnings and skipped.',
      },
      {
        label: "List extraction",
        description:
          'For "list" type fields, the mapped path can point to an array (e.g. "data.tags") and the worker will store it as-is. If it points to a string, the worker splits on commas automatically.',
      },
      {
        label: "Filtering responses",
        description:
          "If the API returns a collection and you only need one record, use an index in the path (e.g. \"results[0]\") or configure the endpoint URL to request a specific ID directly.",
      },
      {
        label: "Computed / derived fields",
        description:
          'Prefix a mapping value with "calc:" to write a simple expression: "calc:response.attack * 2" will multiply the extracted value by 2. Only basic arithmetic (+, -, *, /) is supported.',
      },
      {
        label: "Response size limit",
        description:
          "The worker enforces a 5 MB response body limit. APIs returning large payloads should be filtered server-side via query params before the worker fetches them.",
      },
    ],
    examples: [
      '"data.stats.hp" with schema type "number" → auto-converts "250" to 250',
      '"data.roles" pointing to ["tank","damage"] → stored as list',
      '"calc:data.base_damage * 1.5" → computes derived value',
    ],
  },
  {
    id: "destination",
    icon: <Database className="w-4 h-4" />,
    color: "green",
    title: "Final Result Destination",
    subtitle:
      "Select the target schema to define where and how the processed data is written, or chain into another cron job.",
    rules: [
      {
        label: "Target Schema (required)",
        description:
          "The selected schema determines the entity type and field structure that will be written to GitHub. Every field in the schema must have either a mapping path or an acceptable empty/default value.",
      },
      {
        label: "New record vs. update",
        description:
          "If the API returns a unique ID field mapped to the schema's \"id\" key, the worker will update an existing record with that ID. If no matching file exists, it creates a new one. Missing \"id\" mapping always creates a new record.",
      },
      {
        label: "Chaining cron jobs",
        description:
          "Set this job's destination schema to the same category that a downstream cron job reads from. The downstream job will then operate on the freshly written data on its next run.",
      },
      {
        label: "Partial writes",
        description:
          "Only mapped fields are written. Unmapped schema fields are left at their existing values (for updates) or set to their default (for new records). You do not need to map every field.",
      },
    ],
    examples: [
      'Schema "Hero (hero)" → writes to data/<game>/heroes/<id>.json',
      'Mapped "id" = "data.hero_id" → updates existing hero file if found',
      "No mapped \"id\" → always creates a new record with a generated ID",
    ],
  },
];

const colorMap: Record<string, { bg: string; border: string; icon: string; badge: string; example: string }> = {
  blue:   { bg: "bg-blue-50 dark:bg-blue-900/20",   border: "border-blue-200 dark:border-blue-800/50",   icon: "text-blue-600 dark:text-blue-400",   badge: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",   example: "bg-blue-50/50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-800/30 text-blue-700 dark:text-blue-300" },
  orange: { bg: "bg-orange-50 dark:bg-orange-900/20", border: "border-orange-200 dark:border-orange-800/50", icon: "text-orange-600 dark:text-orange-400", badge: "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300", example: "bg-orange-50/50 dark:bg-orange-900/10 border-orange-100 dark:border-orange-800/30 text-orange-700 dark:text-orange-300" },
  purple: { bg: "bg-purple-50 dark:bg-purple-900/20", border: "border-purple-200 dark:border-purple-800/50", icon: "text-purple-600 dark:text-purple-400", badge: "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300", example: "bg-purple-50/50 dark:bg-purple-900/10 border-purple-100 dark:border-purple-800/30 text-purple-700 dark:text-purple-300" },
  green:  { bg: "bg-emerald-50 dark:bg-emerald-900/20", border: "border-emerald-200 dark:border-emerald-800/50", icon: "text-emerald-600 dark:text-emerald-400", badge: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300", example: "bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-800/30 text-emerald-700 dark:text-emerald-300" },
};

function InstructionCard({ section }: { section: InstructionSection }) {
  const [open, setOpen] = useState(false);
  const c = colorMap[section.color];

  return (
    <div className={`rounded-xl border ${c.border} ${c.bg} overflow-hidden transition-all`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-3">
          <span className={`${c.icon} shrink-0`}>{section.icon}</span>
          <div>
            <span className="text-sm font-bold text-gray-900 dark:text-white">{section.title}</span>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{section.subtitle}</p>
          </div>
        </div>
        <span className={`${c.icon} shrink-0 ml-4`}>
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </span>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-current/10">
          {/* Rules */}
          <div className="space-y-3 pt-4">
            {section.rules.map((rule) => (
              <div key={rule.label} className="flex gap-3">
                <span className={`mt-0.5 shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${c.badge}`}>
                  Rule
                </span>
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{rule.label}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{rule.description}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Examples */}
          {section.examples && section.examples.length > 0 && (
            <div className={`rounded-lg border ${c.example.split(" ").slice(2).join(" ")} bg-transparent p-3 space-y-1.5`}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Examples</p>
              {section.examples.map((ex, i) => (
                <p key={i} className={`text-xs font-mono ${c.example.split(" ").slice(2).join(" ")}`}>
                  {ex}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function CronJobInstructions() {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-800">
        <BookOpen className="w-5 h-5 text-orange-500 shrink-0" />
        <div>
          <span className="text-sm font-bold text-gray-900 dark:text-white">
            Configuration Guide
          </span>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Rules and examples for API response, params, data handling, and destination. Click a section to expand.
          </p>
        </div>
      </div>
      <div className="px-6 pb-6 space-y-3 pt-4">
        {SECTIONS.map((section) => (
          <InstructionCard key={section.id} section={section} />
        ))}
      </div>
    </div>
  );
}
