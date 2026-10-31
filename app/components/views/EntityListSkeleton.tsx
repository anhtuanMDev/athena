import { DataTableSkeleton } from "~/components/DataTableSkeleton";

interface EntityListSkeletonProps {
  columns: number;
  rows: number;
}

export function EntityListSkeleton({ columns, rows }: EntityListSkeletonProps) {
  return (
    <div className="space-y-8 animate-pulse motion-reduce:animate-none">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-border rounded" />
          <div className="h-4 w-64 bg-border rounded" />
        </div>
        <div className="h-10 w-32 bg-border rounded" />
      </div>

      <DataTableSkeleton columns={columns} rows={rows} />
    </div>
  );
}
