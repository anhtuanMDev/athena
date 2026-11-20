import { Check, Copy, Download, FileJson, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";

import { useToast } from "~/components/ToastProvider";
import { Button } from "~/components/ui/button";

import { COPIED_MS, TOOL_AI_CLASS, TOOL_EXPORT_CLASS, TOOL_GROUP_CLASS } from "./constants";
import { downloadFile } from "./utils/downloadFile";

interface SchemaToolbarProps {
  onPrompt: () => void;
  onImport: () => void;
  onClear: () => void;
  /** Clear All Fields needs two fields or more. */
  canClear: boolean;
  /** The schema as Export gives it, and its file's name. */
  exported: () => { json: unknown; fileName: string };
}

/** The tools above the fields: the AI prompt and import, Export, and Clear All Fields. */
export function SchemaToolbar({ onPrompt, onImport, onClear, canClear, exported }: SchemaToolbarProps) {
  const { error: toastError } = useToast();
  const [isCopied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(exported().json, null, 2));
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, COPIED_MS);
    } catch (error) {
      toastError(error instanceof Error ? error.message : "Couldn't copy the schema.");
    }
  };
  const download = () => {
    const { json, fileName } = exported();
    downloadFile(document, JSON.stringify(json, null, 2), { fileName, type: "application/json" });
  };
  return (
    <div className="flex flex-wrap gap-2 items-center p-3 bg-surface-raised border border-border rounded-xl justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`${TOOL_GROUP_CLASS} pr-2 border-r border-border mr-1`}>
          <Sparkles className="w-3.5 h-3.5" /> AI
        </span>
        <Button type="button" variant="outline" size="small" onClick={onPrompt} className={TOOL_AI_CLASS}>
          <Sparkles className="w-4 h-4 mr-1.5" /> Get AI Prompt
        </Button>
        <Button type="button" variant="outline" size="small" onClick={onImport} className={TOOL_AI_CLASS}>
          <Download className="w-4 h-4 mr-1.5" /> Import AI Schema
        </Button>
        <span className={`${TOOL_GROUP_CLASS} px-2 border-l border-border ml-1`}>
          <FileJson className="w-3.5 h-3.5" /> Export
        </span>
        <Button type="button" variant="outline" size="small" onClick={() => void copy()} className={TOOL_EXPORT_CLASS}>
          {isCopied ? <Check className="w-4 h-4 mr-1.5 text-emerald-500" /> : <Copy className="w-4 h-4 mr-1.5" />}
          {isCopied ? "Copied!" : "Copy JSON"}
        </Button>
        <Button type="button" variant="outline" size="small" onClick={download} className={TOOL_EXPORT_CLASS}>
          <Download className="w-4 h-4 mr-1.5" /> Download .json
        </Button>
      </div>
      <Button type="button" variant="outline" size="small" disabled={!canClear} onClick={onClear} className="ml-auto text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/60 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40">
        <Trash2 className="w-4 h-4 mr-1.5" /> Clear All Fields
      </Button>
    </div>
  );
}
