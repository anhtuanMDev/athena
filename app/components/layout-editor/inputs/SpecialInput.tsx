import { ownEntry } from "../utils/own-entry";
import { linkFields } from "../utils/prop-values";

import { ActionInput } from "./ActionInput";
import { FieldKeyInput } from "./FieldKeyInput";
import { InfoRowsInput } from "./InfoRowsInput";
import { ShortcutsInput } from "./ShortcutsInput";
import { SourceInput } from "./SourceInput";

import type { PropContext, PropField } from "../types";
import type { ReactNode } from "react";

interface SpecialInputProps {
  prop: PropField;
  context: PropContext;
}

/** The input of a prop that chooses its own: a source, an action, tiles, info rows, or a filter's field. */
export function SpecialInput({ prop, context }: SpecialInputProps) {
  const { ids, value, onChange } = prop;
  const { screenIds, appScreens } = context;
  const controls: Partial<Record<string, () => ReactNode>> = {
    source: () => <SourceInput id={ids.input} value={value} onChange={onChange} schemas={context.schemas} limits={context.limits} />,
    action: () => <ActionInput id={ids.input} value={value} onChange={onChange} targets={{ screenIds, appScreens, linkFields: linkFields(context) }} describedBy={ids.describedBy} />,
    // A tile isn't an entry of a list, so only the screen's data can give it a link.
    shortcuts: () => <ShortcutsInput id={ids.input} value={value} onChange={onChange} targets={{ screenIds, appScreens, linkFields: linkFields({ ...context, itemFields: null }) }} icons={context.icons} max={context.limits.smallList} />,
    info_rows: () => <InfoRowsInput id={ids.input} value={value} onChange={onChange} dataFields={context.dataFields} icons={context.icons} max={context.limits.smallList} />,
  };
  const control = ownEntry(controls, prop.spec.type) ?? (() => <FieldKeyInput prop={prop} fields={context.chipFields ?? context.dataFields} />);
  return <>{control()}</>;
}
