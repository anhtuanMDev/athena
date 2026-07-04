import { Link } from "react-router";
import type { ReactNode } from "react";
import { Edit2 } from "lucide-react";

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

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  baseUrl,
  idKey = "id",
  emptyMessage = "No items found.",
}: DataTableProps<T>) {
  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 bg-white/30 dark:bg-gray-900/30 backdrop-blur-sm rounded-xl border border-gray-200/50 dark:border-gray-800/50">
        <p className="text-gray-500 dark:text-gray-400">{emptyMessage}</p>
      </div>
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
        <tbody className="divide-y divide-gray-200/50 dark:divide-gray-800/50">
          {data.map((item) => {
            const id = item[idKey] as string;
            return (
              <tr key={id} className="hover:bg-white/50 dark:hover:bg-gray-800/50 transition-colors group">
                {columns.map((col) => (
                  <td key={col.key} className="whitespace-nowrap px-6 py-4 text-sm text-gray-700 dark:text-gray-300 font-medium">
                    {col.render ? col.render(item) : String(item[col.key] ?? "")}
                  </td>
                ))}
                <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                  <Link 
                    to={`${baseUrl}/${id}`} 
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:text-orange-400 dark:hover:text-orange-300 dark:hover:bg-orange-500/10 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                  >
                    <Edit2 className="w-4 h-4" />
                    <span>Edit</span>
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
