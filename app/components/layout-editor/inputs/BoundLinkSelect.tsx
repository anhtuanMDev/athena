import { inputClass } from "~/components/ui/input-classes";
import { LINK_HOSTS } from "~/lib/screen-policy";

interface BoundLinkSelectProps {
  /** The field the link is read from, "item.<key>" or "data.<key>". */
  url: string;
  linkFields: string[];
  onChange: (value: unknown) => void;
}

/** The field an action reads its link from. */
export function BoundLinkSelect({ url, linkFields, onChange }: BoundLinkSelectProps) {
  return (
    <>
      <select aria-label="Link field" value={url} onChange={(e) => onChange({ url: e.target.value })} className={inputClass}>
        {!linkFields.includes(url) && <option value={url}>{url} (not found)</option>}
        {linkFields.map((field) => (
          <option key={field} value={field}>{field}</option>
        ))}
      </select>
      <p className="text-xs text-ink-muted">
        The app reads the link from this field and opens it only if it is https on {LINK_HOSTS.join(", ")} (or their subdomains).
      </p>
    </>
  );
}
