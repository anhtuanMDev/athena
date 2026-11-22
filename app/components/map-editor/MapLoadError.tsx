import { LoadErrorState } from "~/components/ui/LoadErrorState";

import type { MapStage } from "./types";

interface MapLoadErrorProps {
  stage: MapStage;
  error: unknown;
}

const goBack = () => {
  window.history.back();
};

/** Why a map's page couldn't load: New's schemas, or Edit's map. */
export function MapLoadError({ stage, error }: MapLoadErrorProps) {
  if (stage === "edit") {
    return <LoadErrorState title="Failed to Load Map" error={error} onBack={goBack} />;
  }
  return (
    <div className="w-full p-6 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 rounded-xl">
      <h3 className="font-bold text-lg mb-2">Failed to load schema</h3>
      <p>{String(error)}</p>
    </div>
  );
}
