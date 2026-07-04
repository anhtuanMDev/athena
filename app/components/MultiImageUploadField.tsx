import { useState, useRef } from "react";
import { Upload, X, Plus } from "lucide-react";

export interface ImageEntry {
  id: string;
  key: string;
  name?: string;
  base64?: string;
  previewUrl?: string;
}

interface MultiImageUploadFieldProps {
  label: string;
  entries: ImageEntry[];
  onChange: (entries: ImageEntry[]) => void;
  defaultKey?: string;
}

export function MultiImageUploadField({ label, entries, onChange, defaultKey = "main" }: MultiImageUploadFieldProps) {
  const addEntry = () => {
    onChange([...entries, { id: Math.random().toString(36).substring(7), key: entries.length === 0 ? defaultKey : "" }]);
  };

  const updateEntry = (id: string, updates: Partial<ImageEntry>) => {
    onChange(entries.map((e) => (e.id === id ? { ...e, ...updates } : e)));
  };

  const removeEntry = (id: string) => {
    onChange(entries.filter((e) => e.id !== id));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 tracking-wide">{label}</label>
        <button
          type="button"
          onClick={addEntry}
          className="text-xs font-medium text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300 flex items-center gap-1"
        >
          <Plus className="w-3 h-3" /> Add Image
        </button>
      </div>

      {entries.length === 0 && (
        <div className="text-xs text-gray-500 italic">No images added. Click "Add Image".</div>
      )}

      <div className="space-y-3">
        {entries.map((entry) => (
          <ImageRow key={entry.id} entry={entry} onUpdate={(u) => updateEntry(entry.id, u)} onRemove={() => removeEntry(entry.id)} />
        ))}
      </div>
    </div>
  );
}

function ImageRow({ entry, onUpdate, onRemove }: { entry: ImageEntry; onUpdate: (u: Partial<ImageEntry>) => void; onRemove: () => void }) {
  const fileInput = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      const base64 = result.split(",")[1];
      onUpdate({ name: file.name, base64, previewUrl: result });
    };
    reader.readAsDataURL(file);
  };

  const handleClear = () => {
    onUpdate({ name: undefined, base64: undefined, previewUrl: undefined });
    if (fileInput.current) fileInput.current.value = "";
  };

  return (
    <div className="flex items-center gap-3 p-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-white/50 dark:bg-gray-800/50">
      <div className="flex-1">
        <input
          type="text"
          placeholder="Key (e.g. main, splash)"
          value={entry.key}
          onChange={(e) => onUpdate({ key: e.target.value })}
          className="block w-full rounded-lg border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        />
      </div>

      {entry.previewUrl ? (
        <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 group shrink-0">
          <img src={entry.previewUrl} alt="Preview" className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={handleClear}
            className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="flex items-center justify-center w-12 h-12 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-orange-500 dark:hover:border-orange-400 transition-colors text-gray-400 hover:text-orange-500 shrink-0"
        >
          <Upload className="w-4 h-4" />
        </button>
      )}
      <input type="file" accept="image/*" ref={fileInput} onChange={handleFileChange} className="hidden" />

      <button type="button" onClick={onRemove} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
