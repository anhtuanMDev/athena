import { useNavigate } from "react-router";

import { Button } from "~/components/ui/button";

interface MapDeleteButtonProps {
  game: string;
  id: string;
  isSubmitting: boolean;
}

/** The way to the delete page, which checks what uses the map and removes its pictures too. */
export function MapDeleteButton({ game, id, isSubmitting }: MapDeleteButtonProps) {
  const navigate = useNavigate();
  return (
    <div className="mt-8 pt-6 border-t border-border">
      <Button
        type="button"
        onClick={() => {
          void navigate(`/${game}/maps/${id}/delete`);
        }}
        variant="destructive"
        disabled={isSubmitting}
        className="w-full sm:w-auto bg-red-600 hover:bg-red-700 shadow-lg"
      >
        Delete Map
      </Button>
    </div>
  );
}
