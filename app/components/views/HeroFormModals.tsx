import React, { useState } from "react";
import { createPortal } from "react-dom";
import { ClipboardPaste, Download, Sparkles, Upload } from "lucide-react";
import { Button } from "~/components/ui/button";
import { useToast } from "~/components/ToastProvider";

export function AIPromptModalWrapper({ aiPromptMarkdown }: { aiPromptMarkdown: string }) {
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
    a.download = "athena_hero_data_prompt.md";
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
          <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col">
              <div className="p-6 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-blue-500" /> AI Prompt Instructions
                </h3>
              </div>
              <div className="p-6 overflow-y-auto max-h-[60vh]">
                <p className="text-sm text-gray-500 mb-4">
                  Use the following prompt to instruct an AI (like ChatGPT or Claude) to generate data for you. You can copy the text or download it as a file.
                </p>
                <textarea
                  readOnly
                  value={aiPromptMarkdown}
                  className="w-full h-64 rounded-lg border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 text-xs font-mono text-gray-700 dark:text-gray-300 focus:outline-none resize-none"
                />
              </div>
              <div className="p-6 border-t border-gray-200 dark:border-gray-800 flex justify-end gap-3 bg-gray-50 dark:bg-gray-900/50">
                <Button type="button" variant="ghost" onClick={() => setShowPromptModal(false)}>
                  Close
                </Button>
                <Button type="button" variant="outline" onClick={handleDownloadPrompt} className="flex items-center gap-2">
                  <Download className="w-4 h-4" /> Download .md
                </Button>
                <Button type="button" onClick={handleCopyPrompt} className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2">
                  <ClipboardPaste className="w-4 h-4" /> Copy to Clipboard
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

export function ImportDataModalWrapper({
  formatImportedJson,
  onImportSuccess,
  dynamicZodSchema,
}: {
  formatImportedJson: (json: any) => any;
  onImportSuccess: (data: any) => void;
  dynamicZodSchema: any;
}) {
  const [showImportModal, setShowImportModal] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [pastedJson, setPastedJson] = useState("");
  const { success: toastSuccess } = useToast();

  const handleImportPastedJson = () => {
    try {
      const json = JSON.parse(pastedJson);
      if (typeof json === "object" && json !== null) {
        const formatted = formatImportedJson(json);
        const parsed = dynamicZodSchema.safeParse(formatted);
        
        if (!parsed.success) {
          const errorMessage = parsed.error.issues
            .map((issue: any) => `${issue.path.join(".")}: ${issue.message}`)
            .join("\n");
          setImportError(`Validation failed:\n${errorMessage}`);
          return;
        }

        onImportSuccess(parsed.data);
        toastSuccess("Imported hero data from pasted text!");
        setShowImportModal(false);
        setImportError(null);
        setPastedJson("");
      } else {
        setImportError("JSON must be an object, not a primitive or array.");
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
        const json = JSON.parse(event.target?.result as string);
        if (typeof json === "object" && json !== null) {
          const formatted = formatImportedJson(json);
          const parsed = dynamicZodSchema.safeParse(formatted);

          if (!parsed.success) {
            const errorMessage = parsed.error.issues
              .map((issue: any) => `${issue.path.join(".")}: ${issue.message}`)
              .join("\n");
            setImportError(`Validation failed:\n${errorMessage}`);
            return;
          }

          onImportSuccess(parsed.data);
          toastSuccess("Imported hero data from file!");
          setShowImportModal(false);
          setImportError(null);
        } else {
          setImportError("JSON must be an object, not a primitive or array.");
        }
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
            <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col">
              <div className="p-6 border-b border-gray-200 dark:border-gray-800">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
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
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Option 1: Upload JSON File</label>
                  <div className="relative border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-8 text-center hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <input type="file" accept=".json" onChange={(e) => { setImportError(null); handleFileUpload(e); }} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                    <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600 dark:text-gray-400">Click or drag and drop your generated JSON file here</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800"></div>
                  <span className="text-xs font-medium text-gray-500 uppercase">OR</span>
                  <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800"></div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Option 2: Paste JSON Directly</label>
                  <textarea value={pastedJson} onChange={(e) => { setPastedJson(e.target.value); if (importError) setImportError(null); }} placeholder="Paste your JSON data here..." rows={6} className="w-full rounded-lg border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-3 text-sm font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:text-gray-200 transition-colors" />
                </div>
              </div>
              <div className="p-6 border-t border-gray-200 dark:border-gray-800 flex justify-end gap-3 bg-gray-50 dark:bg-gray-900/50">
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
