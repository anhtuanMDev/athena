import { Link } from "react-router";
import type { ReactNode } from "react";
import { Edit2 } from "lucide-react";
import { EmptyState } from "~/components/ui/EmptyState";

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => ReactNode;
  sortable?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  baseUrl: string;
  idKey?: string;
  emptyMessage?: string;
}

export function DataTable<T extends object>({
  columns,
  data,
  baseUrl,
  idKey = "id",
  emptyMessage = "No items found.",
}: DataTableProps<T>) {
  if (data.length === 0) {
    return (
      <EmptyState 
        title="No Items Found" 
        description={emptyMessage} 
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200/50 dark:border-gray-800/50 bg-white/30 dark:bg-gray-900/30 backdrop-blur-sm shadow-sm">
      <table className="min-w-full divide-y divide-gray-200/50 dark:divide-gray-800/50">
        <thead className="bg-gray-50/50 dark:bg-gray-800/50">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-widest dark:text-gray-400">
                {col.header}
              </th>
            ))}
            <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-widest dark:text-gray-400">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-800 bg-white dark:bg-gray-900">
          {data.map((item) => {
            const typedItem = item as Record<string, unknown>;
            const id = typedItem[idKey] as string;
            return (
              <tr key={id} className="group hover:bg-gray-50 dark:hover:bg-gray-800/50">
                {columns.map((col) => (
                  <td key={col.key} className="whitespace-nowrap px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                    {col.render ? col.render(item) : String(typedItem[col.key] ?? "")}
                  </td>
                ))}
                <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                  <div className="flex items-center justify-end gap-2 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <Link 
                      to={`${baseUrl}/${id}`} 
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:text-orange-400 dark:hover:text-orange-300 dark:hover:bg-orange-500/10 transition-all"
                    >
                      <Edit2 className="w-4 h-4" />
                      <span>Edit</span>
                    </Link>
                    <Link 
                      to={`${baseUrl}/${id}/delete`} 
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-500/10 transition-all"
                    >
                      <span>Delete</span>
                    </Link>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
