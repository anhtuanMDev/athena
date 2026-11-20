import { Upload } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";

import { EditorModal } from "./EditorModal";

interface ImportSchemaModalProps {
  onClose: () => void;
  /** A JSON file picked or dropped; the dialog closes. */
  onFile: (file: File) => Promise<void>;
  /** Pasted JSON; true when it was imported, and the dialog closes. */
  onPaste: (text: string) => boolean;
}

/** "Import AI Schema": a schema's fields from a JSON file, or pasted. */
export function ImportSchemaModal({ onClose, onFile, onPaste }: ImportSchemaModalProps) {
  const [pasted, setPasted] = useState("");
  const title = (
    <>
      <Upload className="w-5 h-5 text-blue-500" /> Import Schema
    </>
  );
  const footer = (
    <>
      <Button type="button" variant="ghost" onClick={onClose}>
        Cancel
      </Button>
      <Button type="button" disabled={pasted.trim() === ""} onClick={() => { if (onPaste(pasted)) { setPasted(""); onClose(); } }}>
        Import Pasted Schema
      </Button>
    </>
  );
  return (
    <EditorModal title={title} size="large" footer={footer}>
      <div className="p-6 overflow-y-auto max-h-[60vh] space-y-6">
        <div>
          <label className="block text-sm font-bold text-ink mb-2">Option 1: Upload JSON File</label>
          <div className="relative border-2 border-dashed border-border-strong rounded-xl p-8 text-center hover:bg-surface-raised transition-colors">
            <input type="file" accept=".json" onChange={(event) => { const file = event.target.files?.[0]; if (file) { void onFile(file); } onClose(); }} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
            <Upload className="w-8 h-8 text-ink-muted mx-auto mb-2" />
            <p className="text-sm text-ink-muted">Click or drag and drop your generated JSON file here</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs font-medium text-ink-muted uppercase">OR</span>
          <div className="flex-1 h-px bg-border" />
        </div>
        <div>
          <label className="block text-sm font-bold text-ink mb-2">Option 2: Paste JSON Directly</label>
          <textarea aria-label="Option 2: Paste JSON Directly" value={pasted} onChange={(event) => { setPasted(event.target.value); }} placeholder="Paste your JSON schema here..." rows={6} className="w-full rounded-lg border-border-strong bg-surface-raised px-4 py-3 text-sm font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:text-gray-200 transition-colors" />
        </div>
      </div>
    </EditorModal>
  );
}
