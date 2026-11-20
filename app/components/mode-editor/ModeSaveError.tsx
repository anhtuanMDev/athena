interface ModeSaveErrorProps {
  /** Why the last save failed or was refused, if it was. */
  message: string | null;
}

/** The banner over the form saying why the mode wasn't saved. */
export function ModeSaveError({ message }: ModeSaveErrorProps) {
  if (message === null) {
    return null;
  }
  return <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-200">{message}</div>;
}
