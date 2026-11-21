import { inputBaseClass } from "~/components/ui/input-classes";
import { recordLabel } from "~/lib/screen-starters";

import { optionKey } from "./utils/screen-text";

interface PreviewControlsProps {
  isDetail: boolean;
  /** A detail screen's records, and the one the preview shows. */
  sample: { records: Record<string, unknown>[]; index: number; onIndex: (index: number) => void };
  /** The screen's tabs, and the one the preview shows. */
  tabs: { list: string[]; active: string | undefined; onTab: (tab: string) => void };
}

/** The preview's title, and which record and tab it shows. */
export function PreviewControls({ isDetail, sample, tabs }: PreviewControlsProps) {
  const { records } = sample;
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 id="preview-heading" className="text-sm font-semibold text-ink">
        Preview
      </h2>
      {isDetail && records.length > 1 && (
        <div className="flex items-center gap-2 text-xs text-ink-muted">
          <label htmlFor="preview-record">Record</label>
          <select id="preview-record" value={Math.min(sample.index, records.length - 1)} onChange={(e) => sample.onIndex(Number(e.target.value))} className={`${inputBaseClass} w-auto max-w-44 py-1 text-xs`}>
            {records.map((record, i) => (
              <option key={optionKey(record, i)} value={i}>
                {recordLabel(record)}
              </option>
            ))}
          </select>
        </div>
      )}
      {tabs.list.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-ink-muted">
          <label htmlFor="preview-tab">Tab</label>
          <select id="preview-tab" value={tabs.active} onChange={(e) => tabs.onTab(e.target.value)} className={`${inputBaseClass} w-auto py-1 text-xs`}>
            {tabs.list.map((tab) => (
              <option key={tab}>{tab}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
