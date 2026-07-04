import { useState, useRef } from "react";
import { Upload, X } from "lucide-react";

interface ImageUploadFieldProps {
  label: string;
  onFileSelect: (file: { name: string; base64: string } | null) => void;
  defaultPreview?: string;
  className?: string;
}

export function ImageUploadField({ label, onFileSelect, defaultPreview, className = "" }: ImageUploadFieldProps) {
  const [preview, setPreview] = useState<string | null>(defaultPreview || null);
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
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 tracking-wide">{label}</label>
      <div className="flex items-center gap-4">
        {preview ? (
          <div className="relative w-20 h-20 rounded-xl overflow-hidden shadow-sm border border-gray-200 dark:border-gray-700 group">
            <img src={preview} alt="Preview" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={handleClear}
              className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex items-center justify-center w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700 hover:border-orange-500 hover:bg-orange-50 dark:hover:border-orange-400 dark:hover:bg-orange-500/10 transition-all text-gray-400 hover:text-orange-500"
          >
            <Upload className="w-6 h-6" />
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
          {!preview && <p className="text-xs text-gray-500 dark:text-gray-400">PNG, JPG or WEBP (Max 2MB)</p>}
        </div>
      </div>
    </div>
  );
}
