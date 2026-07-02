import { Link } from "react-router";
import type { ReactNode } from "react";

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

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  baseUrl,
  idKey = "id",
  emptyMessage = "No items found.",
}: DataTableProps<T>) {
  if (data.length === 0) {
    return <p className="text-sm text-gray-500 py-4">{emptyMessage}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border border-gray-200 dark:border-gray-700">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        <thead className="bg-gray-50 dark:bg-gray-800">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                {col.header}
              </th>
            ))}
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {data.map((item) => {
            const id = item[idKey] as string;
            return (
              <tr key={id} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                {columns.map((col) => (
                  <td key={col.key} className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                    {col.render ? col.render(item) : String(item[col.key] ?? "")}
                  </td>
                ))}
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                  <Link to={`${baseUrl}/${id}`} className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">
                    Edit
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
