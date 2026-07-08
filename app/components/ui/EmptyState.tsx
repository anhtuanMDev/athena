import { type ReactNode } from "react";
import { FileQuestion } from "lucide-react";

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = FileQuestion,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: React.ElementType;
}) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center bg-gray-50/50 dark:bg-gray-900/20 border-2 border-gray-200/60 dark:border-gray-800/60 border-dashed rounded-2xl animate-in fade-in duration-500 w-full max-w-2xl mx-auto">
      <div className="flex items-center justify-center w-20 h-20 mb-5 bg-linear-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 text-gray-400 dark:text-gray-500 rounded-2xl shadow-inner ring-1 ring-black/5 dark:ring-white/10 rotate-3 transition-transform hover:rotate-6">
        <Icon className="w-10 h-10" />
      </div>
      <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
        {title}
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-8 max-w-md leading-relaxed">
        {description}
      </p>
      {action && <div className="flex justify-center">{action}</div>}
    </div>
  );
}
