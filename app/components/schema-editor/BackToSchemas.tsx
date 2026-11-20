import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router";

interface BackToSchemasProps {
  game: string;
}

/** The link back to the game's schemas, above a schema page's title. */
export function BackToSchemas({ game }: BackToSchemasProps) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => {
        void navigate(`/${game}/schemas`);
      }}
      className="flex items-center text-sm font-medium text-ink-muted hover:text-ink transition-colors mb-2"
    >
      <ArrowLeft className="w-4 h-4 mr-1" /> Back to Schemas
    </button>
  );
}
