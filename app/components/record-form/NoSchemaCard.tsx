import { useNavigate } from "react-router";

import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";

interface NoSchemaCardProps {
  game: string;
  /** "Modes", "Heroes". */
  plural: string;
  /** What the page was for: "adding" or "editing". */
  doing: string;
}

/** A built-in editor's page when its category has no schema yet: the way to make one. */
export function NoSchemaCard({ game, plural, doing }: NoSchemaCardProps) {
  const navigate = useNavigate();
  return (
    <div className="w-full py-8">
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <h3 className="text-lg font-semibold text-ink">No Schema Configured</h3>
          <p className="text-sm text-ink-muted mt-2 mb-4">
            You must create a schema for {plural} before {doing} entries.
          </p>
          <Button onClick={() => { void navigate(`/${game}/schemas/new`); }}>Create Schema</Button>
        </CardContent>
      </Card>
    </div>
  );
}
