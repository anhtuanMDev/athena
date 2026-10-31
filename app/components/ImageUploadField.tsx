import { useState, useRef } from "react";
import { Upload, X } from "lucide-react";

interface ImageUploadFieldProps {
  label: string;
  onFileSelect: (file: { name: string; base64: string } | null) => void;
  defaultPreview?: string;
  className?: string;
}

export function ImageUploadField({ label, onFileSelect, defaultPreview, className = "" }: ImageUploadFieldProps) {
  let initialPreview = defaultPreview || null;
  if (initialPreview && initialPreview.startsWith("/assets/")) {
    initialPreview = `/api${initialPreview}`;
  }

  const [preview, setPreview] = useState<string | null>(initialPreview);
  const fileInput = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setPreview(result);
      const base64 = result.split(",")[1];
      onFileSelect({ name: file.name, base64 });
    };
    reader.readAsDataURL(file);
  };

  const handleClear = () => {
    setPreview(null);
    onFileSelect(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  return (
    <div className={className}>
      <label className="block text-sm font-medium text-ink mb-2 tracking-wide">{label}</label>
      <div className="flex items-center gap-4">
        {preview ? (
          <div className="relative w-20 h-20 rounded-xl overflow-hidden shadow-sm border border-border group">
            <img src={preview} alt={`${label} preview`} className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={handleClear}
              aria-label={`Remove ${label} image`}
              className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus flex items-center justify-center transition-opacity text-white"
            >
              <X aria-hidden="true" className="w-6 h-6" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            aria-label={`Upload ${label} image`}
            className="flex items-center justify-center w-20 h-20 rounded-xl border-2 border-dashed border-border-strong hover:border-orange-500 hover:bg-orange-50 dark:hover:border-orange-400 dark:hover:bg-orange-500/10 transition-colors text-ink-muted hover:text-orange-500"
          >
            <Upload aria-hidden="true" className="w-6 h-6" />
          </button>
        )}
        <div className="flex-1">
          <input
            type="file"
            accept="image/*"
            ref={fileInput}
            onChange={handleFileChange}
            className="hidden"
          />
          {!preview && <p className="text-xs text-ink-muted">PNG, JPG or WEBP (Max 2MB)</p>}
        </div>
      </div>
    </div>
  );
}
