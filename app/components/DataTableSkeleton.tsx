export function DataTableSkeleton({ columns = 4, rows = 5 }: { columns?: number, rows?: number }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border bg-surface backdrop-blur-sm animate-pulse motion-reduce:animate-none">
      <table className="min-w-full divide-y divide-border">
        <thead className="bg-gray-50/50 dark:bg-gray-800/50">
          <tr>
            {Array.from({ length: columns }).map((_, i) => (
              <th key={i} className="px-4 py-4">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24"></div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <tr key={rowIndex}>
              {Array.from({ length: columns }).map((_, colIndex) => (
                <td key={colIndex} className="px-4 py-4">
                  <div className={`h-4 bg-gray-200 dark:bg-gray-700 rounded ${colIndex === 0 ? 'w-32' : colIndex === columns - 1 ? 'w-16 ml-auto' : 'w-24'}`}></div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
