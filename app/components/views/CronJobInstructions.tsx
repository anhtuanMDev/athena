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
    id: "source",
    icon: <BookOpen className="w-4 h-4" />,
    color: "blue",
    title: "Source",
    subtitle: "Where the data comes from, and which part of it is one item.",
    rules: [
      {
        label: "Web page (HTML)",
        description:
          'For sites without an API, such as patch notes. The item selector is a CSS selector; every element it matches becomes one draft (".PatchNotes-patch").',
      },
      {
        label: "API (JSON)",
        description:
          'The items path is a dot path to an array ("data.items"); each element becomes one draft. Leave it empty when the response itself is the array, or a single item.',
      },
      {
        label: "Fetch limits",
        description:
          "Public HTTPS addresses only, no redirects (use the final address), 10 seconds and 5 MB at most. Put static query parameters in the URL.",
      },
    ],
    examples: [
      '"https://overwatch.blizzard.com/en-us/news/patch-notes/" + ".PatchNotes-patch"',
      '"https://api.example.com/heroes?game=overwatch" + "data.heroes"',
    ],
  },
  {
    id: "mapping",
    icon: <Zap className="w-4 h-4" />,
    color: "orange",
    title: "Field Mapping",
    subtitle: "Where each schema field comes from, relative to one item.",
    rules: [
      {
        label: "HTML",
        description:
          'A CSS selector reads the text of what it matches inside the item; "a@href" reads an attribute instead; "." is the item itself and "@id" its own attribute. Lists collect every match; other fields take the first.',
      },
      {
        label: "JSON",
        description:
          'A dot path reads a value ("stats.health"); "tags[0]" picks one element, and arrays along the path are read element by element.',
      },
      {
        label: "Constants and transforms",
        description:
          '"=Live" writes that text. Pipe a value through "| date" (to YYYY-MM-DD), "| slug", "| number" (the first number in the text), "| lower" or "| upper".',
      },
      {
        label: "Lists of objects",
        description:
          'Give "each" a selector or path for the entries, then map each sub-field relative to one entry ("ul li" with Description ".").',
      },
    ],
    examples: [
      '".PatchNotes-date | date" → "2026-10-20"',
      '".anchor@id" → "patch-2026-10-20"',
      '"=Live" → "Live"',
    ],
  },
  {
    id: "types",
    icon: <GitMerge className="w-4 h-4" />,
    color: "purple",
    title: "Types",
    subtitle: "How values are fitted to the schema, and what gets flagged.",
    rules: [
      {
        label: "Options",
        description:
          'Enum and list fields accept their options in any case or spacing ("hotfix" → "Hotfix"); anything else is flagged and left empty.',
      },
      {
        label: "Numbers and yes/no",
        description:
          'Numbers must read as numbers ("250"); yes/no fields take true/false, yes/no or 1/0. Abilities and weapons aren\'t imported; fill them in during review.',
      },
      {
        label: "Flags, not failures",
        description:
          "A bad rule or value is flagged on its draft (missing required fields too) instead of failing the run, so the reviewer sees what to fix.",
      },
    ],
  },
  {
    id: "review",
    icon: <Database className="w-4 h-4" />,
    color: "green",
    title: "Review and Publishing",
    subtitle: "Imports are drafts; nothing reaches the app until someone publishes it.",
    rules: [
      {
        label: "Record id",
        description:
          'The field picked under "Record id comes from" becomes the id, as a slug. Items whose id is already published, waiting for review or dismissed are skipped, so runs never overwrite anything.',
      },
      {
        label: "Drafts",
        description:
          "Each run adds at most the set number of drafts, in one commit. Review opens the draft in the schema's form; Publish writes it to the category's folder, Dismiss drops it for good.",
      },
      {
        label: "Schedules",
        description:
          "Hourly, daily and weekly jobs run on the cron worker; Run now runs a saved job at once. Preview shows what a run would find, without saving anything.",
      },
    ],
    examples: [
      'Schema "Patch (patch)" → publishes data/<game>/patches/<id>.json',
      "Drafts wait in data/<game>/imports/<job>/<id>.json",
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
    <div className={`rounded-xl border ${c.border} ${c.bg} overflow-hidden transition-colors`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-3">
          <span className={`${c.icon} shrink-0`}>{section.icon}</span>
          <div>
            <span className="text-sm font-bold text-ink">{section.title}</span>
            <p className="text-xs text-ink-muted mt-0.5 leading-snug">{section.subtitle}</p>
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
                <span className={`mt-0.5 shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${c.badge}`}>
                  Rule
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink">{rule.label}</p>
                  <p className="text-xs text-ink-muted mt-0.5 leading-relaxed">{rule.description}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Examples */}
          {section.examples && section.examples.length > 0 && (
            <div className={`rounded-lg border ${c.example.split(" ").slice(2).join(" ")} bg-transparent p-3 space-y-1.5`}>
              <p className="text-xs font-bold uppercase tracking-widest text-ink-muted mb-2">Examples</p>
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
    <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
        <BookOpen className="w-5 h-5 text-orange-500 shrink-0" />
        <div>
          <span className="text-sm font-bold text-ink">
            Configuration Guide
          </span>
          <p className="text-xs text-ink-muted mt-0.5">
            How sources, mappings, types and review work. Click a section to expand.
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
