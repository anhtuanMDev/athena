import { Download, Sparkles, Upload } from "lucide-react";
import React, { useState } from "react";
import { createPortal } from "react-dom";

import { useToast } from "~/components/ToastProvider";
import { Button } from "~/components/ui/button";
import { importedMessage, promptFileName } from "~/lib/ai-data";

import { AiPromptDialog } from "./AiPromptDialog";

import type { ZodType } from "zod";

export function AIPromptModalWrapper({ aiPromptMarkdown, entity }: { aiPromptMarkdown: string; entity: string }) {
  const [showPromptModal, setShowPromptModal] = useState(false);
  const { success: toastSuccess } = useToast();

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(aiPromptMarkdown);
    toastSuccess("Copied to clipboard!");
  };

  const handleDownloadPrompt = () => {
    const blob = new Blob([aiPromptMarkdown], { type: "text/markdown" });
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = promptFileName(entity);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="small"
        onClick={() => setShowPromptModal(true)}
        className="text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-800/50"
      >
        <Sparkles className="w-4 h-4 mr-2" />
        Get AI Prompt
      </Button>
      {showPromptModal &&
        typeof document !== "undefined" &&
        createPortal(
          <AiPromptDialog prompt={aiPromptMarkdown} onClose={() => { setShowPromptModal(false); }} onDownload={handleDownloadPrompt} onCopy={handleCopyPrompt} />,
          document.body,
        )}
    </>
  );
}

export function ImportDataModalWrapper({
  formatImportedJson,
  onImportSuccess,
  dynamicZodSchema,
  entity,
}: {
  formatImportedJson: (json: Record<string, unknown>) => Record<string, unknown>;
  onImportSuccess: (data: Record<string, unknown>) => void;
  dynamicZodSchema: ZodType;
  /** What's imported ("hero", "mode"), for the toast. */
  entity: string;
}) {
  const [showImportModal, setShowImportModal] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [pastedJson, setPastedJson] = useState("");
  const { success: toastSuccess } = useToast();

  /** Checks an AI's answer as the form takes it, and imports it; or says why not. Whether it was imported. */
  const importJson = (json: unknown, source: "file" | "pasted text"): boolean => {
    if (typeof json !== "object" || json === null) {
      setImportError("JSON must be an object, not a primitive or array.");
      return false;
    }
    const parsed = dynamicZodSchema.safeParse(formatImportedJson(json as Record<string, unknown>));
    if (!parsed.success) {
      const errorMessage = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n");
      setImportError(`Validation failed:\n${errorMessage}`);
      return false;
    }
    onImportSuccess(parsed.data as Record<string, unknown>);
    toastSuccess(importedMessage(entity, source));
    setShowImportModal(false);
    setImportError(null);
    return true;
  };

  const handleImportPastedJson = () => {
    try {
      if (importJson(JSON.parse(pastedJson), "pasted text")) {
        setPastedJson("");
      }
    } catch (e) {
      setImportError("Invalid JSON: could not parse the pasted text.");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        importJson(JSON.parse(event.target?.result as string), "file");
      } catch (err) {
        setImportError("Invalid JSON file: could not parse the file contents.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="small"
        onClick={() => {
          setImportError(null);
          setShowImportModal(true);
        }}
        className="text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-800/50"
      >
        <Download className="w-4 h-4 mr-2" />
        Import AI Data
      </Button>
      {showImportModal &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-surface rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col">
              <div className="p-6 border-b border-border">
                <h3 className="text-lg font-bold text-ink flex items-center gap-2">
                  <Upload className="w-5 h-5 text-blue-500" /> Import AI Data
                </h3>
              </div>
              <div className="p-6 overflow-y-auto max-h-[60vh] space-y-6">
                {importError && (
                  <div className="rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 p-4">
                    <p className="text-sm font-semibold text-red-700 dark:text-red-400 mb-1">Import Error</p>
                    <pre className="text-xs text-red-600 dark:text-red-300 whitespace-pre-wrap font-mono">{importError}</pre>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-bold text-ink mb-2">Option 1: Upload JSON File</label>
                  <div className="relative border-2 border-dashed border-border-strong rounded-xl p-8 text-center hover:bg-surface-raised transition-colors">
                    <input type="file" accept=".json" onChange={(e) => { setImportError(null); handleFileUpload(e); }} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                    <Upload className="w-8 h-8 text-ink-muted mx-auto mb-2" />
                    <p className="text-sm text-ink-muted">Click or drag and drop your generated JSON file here</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex-1 h-px bg-border"></div>
                  <span className="text-xs font-medium text-ink-muted uppercase">OR</span>
                  <div className="flex-1 h-px bg-border"></div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-ink mb-2">Option 2: Paste JSON Directly</label>
                  <textarea aria-label="Option 2: Paste JSON Directly" value={pastedJson} onChange={(e) => { setPastedJson(e.target.value); if (importError) setImportError(null); }} placeholder="Paste your JSON data here..." rows={6} className="w-full rounded-lg border-border-strong bg-surface-raised px-4 py-3 text-sm font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:text-gray-200 transition-colors" />
                </div>
              </div>
              <div className="p-6 border-t border-border flex justify-end gap-3 bg-surface-raised">
                <Button type="button" variant="ghost" onClick={() => { setShowImportModal(false); setImportError(null); }}>Cancel</Button>
                <Button type="button" variant="default" onClick={handleImportPastedJson}>Import Pasted Data</Button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
