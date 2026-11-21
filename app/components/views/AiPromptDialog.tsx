import { ClipboardPaste, Download, Sparkles } from "lucide-react";

import { Button } from "~/components/ui/button";

interface AiPromptDialogProps {
  prompt: string;
  onClose: () => void;
  onDownload: () => void;
  onCopy: () => void;
}

/** "Get AI Prompt"'s dialog: the prompt to give an AI, to copy or download. */
export function AiPromptDialog({ prompt, onClose, onDownload, onCopy }: AiPromptDialogProps) {
  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-surface rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="p-6 border-b border-border flex justify-between items-center">
          <h3 className="text-lg font-bold text-ink flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-500" /> AI Prompt Instructions
          </h3>
        </div>
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          <p className="text-sm text-ink-muted mb-4">
            Use the following prompt to instruct an AI (like ChatGPT or Claude) to generate data for you. You can copy the text or download it as a file.
          </p>
          <textarea aria-label="AI prompt" readOnly value={prompt} className="w-full h-64 rounded-lg border-border-strong bg-surface-raised p-4 text-xs font-mono text-ink focus:outline-none resize-none" />
        </div>
        <div className="p-6 border-t border-border flex justify-end gap-3 bg-surface-raised">
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button type="button" variant="outline" onClick={onDownload} className="flex items-center gap-2">
            <Download className="w-4 h-4" /> Download .md
          </Button>
          <Button type="button" onClick={onCopy} className="flex items-center gap-2">
            <ClipboardPaste className="w-4 h-4" /> Copy to Clipboard
          </Button>
        </div>
      </div>
    </div>
  );
}
