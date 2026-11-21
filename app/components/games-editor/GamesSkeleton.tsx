import { Card, CardContent, CardHeader } from "~/components/ui/card";

import { SKELETON_CARDS } from "./constants";

const PLACEHOLDERS = Array.from({ length: SKELETON_CARDS }, (_card, index) => index + 1);

/** The games page while games.json loads. */
export function GamesSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-32 bg-border rounded animate-pulse motion-reduce:animate-none" />
        <div className="h-10 w-24 bg-border rounded animate-pulse motion-reduce:animate-none" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {PLACEHOLDERS.map((placeholder) => (
          <Card key={placeholder} className="animate-pulse motion-reduce:animate-none">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 bg-border rounded-md" />
                  <div className="h-6 w-32 bg-border rounded" />
                </div>
                <div className="h-5 w-16 bg-border rounded-full" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-4 w-48 bg-border rounded mb-2" />
              <div className="h-4 w-32 bg-border rounded" />
              <div className="mt-3 h-4 w-12 bg-border rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
