import { Button } from "~/components/ui/button";
import { EmptyState } from "~/components/ui/EmptyState";
import { LoadErrorState } from "~/components/ui/LoadErrorState";
import { EnumFormSkeleton } from "~/components/views/ViewSkeletons";

import { EnumCard } from "./EnumCard";
import { EnumForm } from "./EnumForm";
import { useEnumData } from "./hooks/useEnumData";

interface EnumEditPageProps {
  game: string;
  id: string;
}

const goBack = () => {
  window.history.back();
};

/** Edit: loading, why the enum couldn't load or isn't there, or its form. */
export function EnumEditPage({ game, id }: EnumEditPageProps) {
  const { data, loading: isLoading, error } = useEnumData(game, id);
  if (isLoading) {
    return <EnumFormSkeleton />;
  }
  if (error !== null) {
    return <LoadErrorState title="Failed to Load Enum" error={error} onBack={goBack} />;
  }
  if (!data) {
    return (
      <div className="w-full py-12">
        <EmptyState title="Enum Not Found" description="The enum you are trying to edit could not be found or has been deleted." action={<Button variant="outline" onClick={goBack}>Go Back</Button>} />
      </div>
    );
  }
  return (
    <EnumCard title={`Edit Enum - ${data.content.name}`} onBack={goBack}>
      <EnumForm key={data.sha} game={game} stored={{ id, content: data.content, sha: data.sha }} />
    </EnumCard>
  );
}
