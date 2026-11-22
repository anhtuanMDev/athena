interface MapSaveErrorProps {
  /** Why the last save failed or was refused, if it was. */
  message: string | null;
}

/** The banner over the form saying why the map wasn't saved. */
export function MapSaveError({ message }: MapSaveErrorProps) {
  if (message === null) {
    return null;
  }
  return <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-200 mb-4">{message}</div>;
}
