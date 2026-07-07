import { DataTableSkeleton } from "~/components/DataTableSkeleton";

interface EntityListSkeletonProps {
  columns: number;
  rows: number;
}

export function EntityListSkeleton({ columns, rows }: EntityListSkeletonProps) {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-gray-200 dark:bg-gray-800 rounded" />
          <div className="h-4 w-64 bg-gray-200 dark:bg-gray-800 rounded" />
        </div>
        <div className="h-10 w-32 bg-gray-200 dark:bg-gray-800 rounded" />
      </div>

      <DataTableSkeleton columns={columns} rows={rows} />
    </div>
  );
}
