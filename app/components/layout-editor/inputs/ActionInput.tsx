import { inputClass } from "~/components/ui/input-classes";
import { appScreenLabel } from "~/lib/screen-model";

import { actionChoice, actionFor, asAction, boundUrlOf, screenChoice } from "../utils/prop-values";

import { BoundLinkSelect } from "./BoundLinkSelect";
import { LinkInput } from "./LinkInput";

import type { ActionTargets } from "../types";

interface ActionInputProps {
  id: string;
  value: unknown;
  onChange: (value: unknown) => void;
  targets: ActionTargets;
  /** The control's name when no <label> points at `id` (a tile's action). */
  label?: string;
  describedBy?: string;
}

/** What tapping does: open a screen of this game or of the app, a link, or a link read from the record. */
export function ActionInput({ id, value, onChange, targets, label, describedBy }: ActionInputProps) {
  const { screenIds, appScreens, linkFields } = targets;
  const action = asAction(value);
  const boundUrl = boundUrlOf(action);
  const choice = actionChoice(action);
  return (
    <div className="space-y-2">
      <select id={id} aria-label={label} aria-describedby={describedBy} value={choice} onChange={(e) => onChange(actionFor(e.target.value, linkFields))} className={inputClass}>
        <option value="">Nothing</option>
        {action.screen && !screenIds.includes(action.screen) && !appScreens.includes(action.screen) && <option value={screenChoice(action.screen)}>{action.screen} (missing)</option>}
        {screenIds.map((screen) => (
          <option key={screen} value={screenChoice(screen)}>Open screen: {screen}</option>
        ))}
        {appScreens.map((screen) => (
          <option key={screen} value={screenChoice(screen)}>Open: {appScreenLabel(screen)}</option>
        ))}
        <option value="url">Open a link…</option>
        {(boundUrl !== undefined || linkFields.length > 0) && <option value="field">Open a link from the record…</option>}
      </select>
      {boundUrl && <BoundLinkSelect url={boundUrl} linkFields={linkFields} onChange={onChange} />}
      {choice === "url" && <LinkInput url={action.url ?? ""} onChange={onChange} />}
    </div>
  );
}
