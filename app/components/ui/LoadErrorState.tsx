import { AlertTriangle } from "lucide-react";
import { Button } from "~/components/ui/button";

interface LoadErrorStateProps {
  title?: string;
  description?: string;
  error?: Error | unknown;
  onBack?: () => void;
  backLabel?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export function LoadErrorState({
  title = "Failed to Load Data",
  description = "We couldn't retrieve the requested information. The file might have been moved, deleted, or there's a temporary network issue.",
  error,
  onBack,
  backLabel = "Go Back",
  onRetry = () => window.location.reload(),
  retryLabel = "Try Again",
}: LoadErrorStateProps) {
  return (
    <div className="w-full py-16 flex items-center justify-center">
      <div className="max-w-md w-full bg-white dark:bg-gray-900 border border-red-100 dark:border-red-900/30 shadow-2xl rounded-3xl p-8 text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1.5 bg-linear-to-r from-red-500 to-orange-500" />
        <div className="w-20 h-20 bg-red-50 dark:bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-10 h-10 text-red-500 dark:text-red-400" />
        </div>
        <h3 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight mb-3">
          {title}
        </h3>
        <p className="text-gray-500 dark:text-gray-400 mb-8 leading-relaxed">
          {description}
          {!!error && (
            <>
              <br />
              <br />
              <span className="inline-block bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 px-3 py-1.5 rounded-lg text-sm font-mono border border-red-100 dark:border-red-500/20 break-all">
                {error instanceof Error ? error.message : String(error) || "Unknown error"}
              </span>
            </>
          )}
        </p>
        <div className="flex items-center justify-center gap-4">
          {onBack && (
            <Button
              variant="outline"
              onClick={onBack}
              className="px-6 py-2.5 rounded-xl border-gray-200 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800"
            >
              {backLabel}
            </Button>
          )}
          {onRetry && (
            <Button
              onClick={onRetry}
              className="px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/20"
            >
              {retryLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
