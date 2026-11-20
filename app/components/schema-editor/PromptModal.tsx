import { ClipboardPaste, Download, Sparkles } from "lucide-react";

import { useToast } from "~/components/ToastProvider";
import { Button } from "~/components/ui/button";

import { EditorModal } from "./EditorModal";
import { downloadFile } from "./utils/downloadFile";

interface PromptModalProps {
  prompt: string;
  onClose: () => void;
}

/** "Get AI Prompt": the prompt, to copy or download as a markdown file. */
export function PromptModal({ prompt, onClose }: PromptModalProps) {
  const { success: toastSuccess, error: toastError } = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      toastSuccess("Copied to clipboard!");
    } catch (error) {
      toastError(error instanceof Error ? error.message : "Couldn't copy the prompt.");
    }
  };
  const title = (
    <>
      <Sparkles className="w-5 h-5 text-blue-500" /> AI Prompt Instructions
    </>
  );
  const footer = (
    <>
      <Button type="button" variant="ghost" onClick={onClose}>
        Close
      </Button>
      <Button type="button" variant="outline" onClick={() => { downloadFile(document, prompt, { fileName: "athena_schema_ai_prompt.md", type: "text/markdown" }); }} className="flex items-center gap-2">
        <Download className="w-4 h-4" /> Download .md
      </Button>
      <Button type="button" onClick={() => void copy()} className="flex items-center gap-2">
        <ClipboardPaste className="w-4 h-4" /> Copy to Clipboard
      </Button>
    </>
  );
  return (
    <EditorModal title={title} size="large" footer={footer}>
      <div className="p-6 overflow-y-auto max-h-[60vh]">
        <p className="text-sm text-ink-muted mb-4">
          Use the following prompt to instruct an AI (like ChatGPT or Claude) to generate a schema for you. You can copy the text or download it as a file.
        </p>
        <textarea aria-label="AI prompt" readOnly value={prompt} className="w-full h-64 rounded-lg border-border-strong bg-surface-raised p-4 text-xs font-mono text-ink focus:outline-none resize-none" />
      </div>
    </EditorModal>
  );
}
