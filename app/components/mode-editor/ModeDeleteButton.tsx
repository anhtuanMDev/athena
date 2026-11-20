import { Trash2 } from "lucide-react";
import { useNavigate } from "react-router";

import { Button } from "~/components/ui/button";

interface ModeDeleteButtonProps {
  game: string;
  id: string;
  isSubmitting: boolean;
}

/** The way to the delete page, which checks what uses the mode and removes its pictures too. */
export function ModeDeleteButton({ game, id, isSubmitting }: ModeDeleteButtonProps) {
  const navigate = useNavigate();
  return (
    <div className="pt-8 mt-8 border-t border-border flex justify-end">
      <Button type="button" variant="destructive" disabled={isSubmitting} onClick={() => { void navigate(`/${game}/modes/${id}/delete`); }} className="bg-red-600 hover:bg-red-700 shadow-lg">
        <Trash2 className="w-4 h-4 mr-2" />
        Delete Mode
      </Button>
    </div>
  );
}
