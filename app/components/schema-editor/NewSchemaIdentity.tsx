import { Card, CardContent } from "~/components/ui/card";

interface NewSchemaIdentityProps {
  name: string;
  category: string;
  categories: readonly { category: string; label: string }[];
  onName: (name: string) => void;
  onCategory: (category: string) => void;
}

const BOX_CLASS =
  "block w-full rounded-lg border-border-strong bg-surface-raised px-4 py-3 text-sm shadow-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white transition-colors";
const LABEL_CLASS = "block text-sm font-bold text-ink mb-2";

/** A new schema's name and category, which make its id. */
export function NewSchemaIdentity({ name, category, categories, onName, onCategory }: NewSchemaIdentityProps) {
  return (
    <Card className="border-orange-500/20 shadow-sm">
      <CardContent className="p-6 md:p-8 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className={LABEL_CLASS}>Schema Name</label>
            <input aria-label="Schema Name" value={name} onChange={(event) => { onName(event.target.value); }} placeholder="e.g. Base Hero Attributes" className={BOX_CLASS} required />
          </div>
          <div>
            <label className={LABEL_CLASS}>Category</label>
            <select aria-label="Category" value={category} onChange={(event) => { onCategory(event.target.value); }} className={BOX_CLASS}>
              {categories.map((entry) => (
                <option key={entry.category} value={entry.category}>
                  {entry.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
