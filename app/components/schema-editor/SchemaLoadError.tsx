import { useNavigate } from "react-router";

import { Button } from "~/components/ui/button";
import { EmptyState } from "~/components/ui/EmptyState";
import { LoadErrorState } from "~/components/ui/LoadErrorState";

interface SchemaLoadErrorProps {
  game: string;
  error: unknown;
}

/** Edit's page when its schema can't be opened: gone, or not read. */
export function SchemaLoadError({ game, error }: SchemaLoadErrorProps) {
  const navigate = useNavigate();
  if (String(error).includes("not found")) {
    return (
      <div className="w-full py-12">
        <EmptyState
          title="Schema Not Found"
          description="The schema you are trying to edit could not be found or has been deleted."
          action={
            <Button variant="outline" onClick={() => { window.history.back(); }}>
              Go Back
            </Button>
          }
        />
      </div>
    );
  }
  return <LoadErrorState title="Failed to Load Schema" error={error} onBack={() => { void navigate(`/${game}/schemas`); }} />;
}
