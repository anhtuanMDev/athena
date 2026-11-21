import { inputClass } from "~/components/ui/input-classes";
import { LINK_HOSTS, isAllowedLink } from "~/lib/screen-policy";

interface LinkInputProps {
  url: string;
  onChange: (value: unknown) => void;
}

/** A fixed link an action opens. */
export function LinkInput({ url, onChange }: LinkInputProps) {
  const isRefused = url !== "" && !isAllowedLink(url);
  return (
    <>
      <input
        aria-label="Link"
        type="url"
        placeholder="https://"
        value={url}
        aria-invalid={isRefused ? true : undefined}
        onChange={(e) => onChange({ url: e.target.value })}
        className={inputClass}
      />
      <p className={`text-xs ${isRefused ? "text-danger-ink" : "text-ink-muted"}`}>
        The app only opens https links on {LINK_HOSTS.join(", ")} (and their subdomains), after asking the player.
      </p>
    </>
  );
}
