import { Settings2 } from "lucide-react";
import { useNavigate } from "react-router";

import { Button } from "~/components/ui/button";

import { BackToSchemas } from "./BackToSchemas";

interface NewSchemaHeaderProps {
  game: string;
  isSubmitting: boolean;
}

/** A new schema's title, with Cancel and Create Schema. */
export function NewSchemaHeader({ game, isSubmitting }: NewSchemaHeaderProps) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <BackToSchemas game={game} />
        <h1 className="text-3xl font-bold text-ink tracking-tight flex items-center gap-3">
          <Settings2 className="w-8 h-8 text-orange-500" />
          New Schema - <span className="capitalize">{game}</span>
        </h1>
      </div>
      <div className="flex items-center gap-3">
        <Button type="button" variant="ghost" onClick={() => { void navigate(`/${game}/schemas`); }}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting} className="shadow-lg px-8">
          {isSubmitting ? "Creating..." : "Create Schema"}
        </Button>
      </div>
    </div>
  );
}
