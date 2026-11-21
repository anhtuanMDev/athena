import { enumParamText, type EnumOptionView } from "~/lib/enum-options";

import { PreviewImage } from "../PreviewImage";

import type { PicturePolicy } from "~/lib/app-pictures";

interface EnumOptionPreviewProps {
  option: EnumOptionView;
  pictures: PicturePolicy;
}

/** A single enum value as field_section shows it: its option's icon and name, description and params. */
export function EnumOptionPreview({ option, pictures }: EnumOptionPreviewProps) {
  return (
    <div className="space-y-1.5">
      <span className="inline-flex items-center gap-1.5">
        {option.icon && <PreviewImage value={option.icon} pictures={pictures} className="size-5 rounded" />}
        <span className="rounded-full bg-surface-raised px-2.5 py-0.5 text-xs font-semibold">{option.name}</span>
      </span>
      {option.description && <p className="text-xs text-ink-muted">{option.description}</p>}
      {option.params?.map((param) => (
        <div key={param.id} className="flex gap-3 text-xs">
          <span className="w-28 shrink-0 text-ink-muted">{param.label}</span>
          <span className="min-w-0 flex-1 font-medium">{enumParamText(param)}</span>
        </div>
      ))}
    </div>
  );
}
