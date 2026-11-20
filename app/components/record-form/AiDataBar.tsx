import { Sparkles } from "lucide-react";

import { AIPromptModalWrapper, ImportDataModalWrapper } from "~/components/views/HeroFormModals";

import type { ZodType } from "zod";

interface AiDataBarProps {
  /** The prompt "Get AI Prompt" gives. */
  prompt: string;
  /** An AI's answer as the form takes it, checked with `schema` before it's imported. */
  formatImported: (json: Record<string, unknown>) => Record<string, unknown>;
  schema: ZodType;
  onImported: (data: Record<string, unknown>) => void;
}

/** "AI Data Generation": the prompt for an AI, and importing its answer. */
export function AiDataBar({ prompt, formatImported, schema, onImported }: AiDataBarProps) {
  return (
    <div className="flex flex-wrap gap-3 items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50 rounded-xl mb-6">
      <div className="flex items-center gap-2 text-blue-800 dark:text-blue-300 text-sm font-medium">
        <Sparkles className="w-5 h-5 text-blue-500" />
        AI Data Generation
      </div>
      <div className="flex items-center gap-3">
        <AIPromptModalWrapper aiPromptMarkdown={prompt} />
        <ImportDataModalWrapper formatImportedJson={formatImported} onImportSuccess={onImported} dynamicZodSchema={schema} />
      </div>
    </div>
  );
}
