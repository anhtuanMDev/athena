import { Link, useParams } from "react-router";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { listDirectory } from "~/lib/github";
import { useData } from "~/lib/use-data";
import { type CronJob } from "~/schemas/cron";
import { Clock } from "lucide-react";
import { LoadErrorState } from "~/components/ui/LoadErrorState";

export default function CronJobsList() {
  const { game } = useParams();

  const { data, loading, error } = useData(async () => {
    try {
      const crons = await listDirectory<CronJob>(game!, "cron_jobs", true);
      const syncs = await listDirectory<any>(game!, "syncs", true).catch(() => []);
      
      const syncMap: Record<string, any> = {};
      syncs.forEach(s => {
        if (s && s.id) syncMap[s.id] = s;
      });

      return crons.map(job => ({ ...job, _sync: syncMap[job.id] }));
    } catch (e) {
      return [];
    }
  }, [game], "CronJobsList-12");

  if (loading)
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
          <div className="h-10 w-32 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-6 w-32 bg-gray-200 dark:bg-gray-800 rounded" />
              </CardHeader>
              <CardContent>
                <div className="h-4 w-24 bg-gray-200 dark:bg-gray-800 rounded mb-2" />
                <div className="h-4 w-48 bg-gray-200 dark:bg-gray-800 rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );

  if (error)
    return (
      <LoadErrorState
        title="Failed to Load Cron Jobs"
        error={error}
        onBack={() => window.history.back()}
      />
    );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white capitalize flex items-center gap-2">
          <Clock className="w-6 h-6 text-orange-500" />
          Cron Jobs - {game}
        </h1>
        <Link to={`/${game}/cron/new`}>
          <Button>Create Cron Job</Button>
        </Link>
      </div>

      {!data || data.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mx-auto w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
              <Clock className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              No Cron Jobs Found
            </h3>
            <p className="text-sm text-gray-500 mt-2 mb-4">
              Create your first automated task to sync data automatically from
              an API endpoint.
            </p>
            <Link to={`/${game}/cron/new`}>
              <Button>Create Cron Job</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {data.map((job) => (
            <Card key={job.id} className={!job.active ? "opacity-60" : ""}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {job.name}
                  </h2>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${job.active ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"}`}
                  >
                    {job.active ? "Active" : "Inactive"}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <div
                  className="text-sm text-gray-500 mb-2 truncate"
                  title={job.api_endpoint}
                >
                  <strong>API:</strong> {job.api_endpoint}
                </div>
                <p className="text-sm text-gray-500 mb-2">
                  <strong>Schema:</strong> {job.schema_id}
                </p>
                <p className="text-sm text-gray-500 mb-4 capitalize">
                  <strong>Schedule:</strong> {job.schedule}
                </p>

                {job._sync && (
                  <div className="mb-4 text-xs p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800">
                    {job._sync.last_sync && (
                      <p className="text-green-700 dark:text-green-400">
                        <strong>Last Sync:</strong> {new Date(job._sync.last_sync).toLocaleString()}
                      </p>
                    )}
                    {job._sync.last_error && (
                      <p className="text-red-700 dark:text-red-400 mt-1">
                        <strong>Last Error:</strong> {job._sync.last_error} <br/>
                        <span className="opacity-75 text-[10px] mt-0.5 inline-block">
                          {new Date(job._sync.last_sync_attempt).toLocaleString()}
                        </span>
                      </p>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  <Link
                    to={`/${game}/cron/${job.id}`}
                    className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 font-medium"
                  >
                    Edit Cron Job
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
