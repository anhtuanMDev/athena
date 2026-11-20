import { LoadErrorState } from "~/components/ui/LoadErrorState";

interface ModeLoadErrorProps {
  stage: "new" | "edit";
  error: unknown;
}

const goBack = () => {
  window.history.back();
};

/** Why a mode's page couldn't load: New's schemas, or Edit's mode. */
export function ModeLoadError({ stage, error }: ModeLoadErrorProps) {
  if (stage === "edit") {
    return <LoadErrorState title="Failed to Load Mode" error={error} onBack={goBack} />;
  }
  return (
    <div className="w-full p-6 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 rounded-xl">
      <h3 className="font-bold text-lg mb-2">Failed to load schema</h3>
      <p>{error instanceof Error ? error.toString() : JSON.stringify(error)}</p>
    </div>
  );
}
