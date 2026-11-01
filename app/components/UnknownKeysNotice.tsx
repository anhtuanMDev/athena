import { Link } from "react-router";

/**
 * Why a form that checks records strictly (maps, modes, news, patches, items)
 * won't save one: it has keys the schema doesn't list. Saving through the form
 * would delete them, so it refuses; this says which keys, and where they can
 * be removed by hand.
 */
export function UnknownKeysNotice({ keys, rawEditor, className = "" }: { keys: string[]; rawEditor: string; className?: string }) {
  if (keys.length === 0) return null;
  const them = keys.length === 1 ? "it" : "them";
  return (
    <div role="alert" className={`rounded-xl bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-200 border border-amber-200 dark:border-amber-800/50 ${className}`}>
      <p className="font-bold">This form can&apos;t save this record.</p>
      <p className="mt-1">
        It has {keys.length === 1 ? "a field" : "fields"} the schema doesn&apos;t list:{" "}
        {keys.map((key, i) => (
          <span key={key}>
            {i > 0 && ", "}
            <code>{key}</code>
          </span>
        ))}
        . Saving here would delete {them}. Remove {them} in the{" "}
        <Link to={rawEditor} className="underline hover:text-ink">
          raw JSON editor
        </Link>
        , or add {them} to the schema, then edit the record here.
      </p>
    </div>
  );
}
