import { Card, CardContent, CardHeader } from "~/components/ui/card";

// What a game's views show while their data loads. The game route
// (_admin.$game.tsx) loads each view's code only when it's opened and shows
// the view's own placeholder meanwhile, so a page looks the same from the
// click until its data is in. Each view and the route use the one here.

export { EntityListSkeleton } from "~/components/views/EntityListSkeleton";

/** The size of each list's placeholder (EntityListSkeleton): its columns and rows. */
export const LIST_SKELETONS = {
  heroes: { columns: 6, rows: 8 },
  maps: { columns: 4, rows: 8 },
  modes: { columns: 3, rows: 6 },
  enums: { columns: 3, rows: 5 },
} as const;

/** A record's form whose first row holds two fields (heroes, modes). */
export function SplitFormSkeleton() {
  return (
    <div className="w-full space-y-6 animate-pulse motion-reduce:animate-none">
      <div className="h-10 w-48 bg-border rounded-lg"></div>
      <div className="space-y-4 bg-surface p-6 rounded-xl border border-border">
        <div className="grid grid-cols-2 gap-4">
          <div className="h-12 bg-border rounded-lg"></div>
          <div className="h-12 bg-border rounded-lg"></div>
        </div>
        <div className="h-12 bg-border rounded-lg"></div>
        <div className="h-40 bg-border rounded-lg mt-8"></div>
      </div>
    </div>
  );
}

/** A record's form of single fields (maps). */
export function FieldsFormSkeleton() {
  return (
    <div className="w-full space-y-6 animate-pulse motion-reduce:animate-none">
      <div className="h-10 w-48 bg-border rounded-lg"></div>
      <div className="space-y-4 bg-surface p-6 rounded-xl border border-border">
        <div className="h-12 bg-border rounded-lg"></div>
        <div className="h-12 bg-border rounded-lg"></div>
        <div className="h-12 bg-border rounded-lg"></div>
      </div>
    </div>
  );
}

/** An enum's form: its name, then its options. */
export function EnumFormSkeleton() {
  return (
    <div className="w-full space-y-6 animate-pulse motion-reduce:animate-none">
      <div className="h-10 w-48 bg-border rounded-lg"></div>
      <div className="space-y-4 bg-surface p-6 rounded-xl border border-border">
        <div className="h-12 bg-border rounded-lg"></div>
        <div className="h-40 bg-border rounded-lg"></div>
      </div>
    </div>
  );
}

/** A page of two panels (a schema, a cron job). */
export function PanelsSkeleton() {
  return (
    <div className="w-full py-8 space-y-6 animate-pulse motion-reduce:animate-none">
      <div className="h-10 w-64 bg-border rounded-lg"></div>
      <div className="h-32 bg-border rounded-xl"></div>
      <div className="h-64 bg-border rounded-xl"></div>
    </div>
  );
}

/** A page of one tall panel (a record of another category, an import's draft). */
export function TallPanelSkeleton() {
  return (
    <div className="w-full py-8 space-y-6 animate-pulse motion-reduce:animate-none">
      <div className="h-10 w-64 bg-border rounded-lg"></div>
      <div className="h-96 bg-border rounded-xl"></div>
    </div>
  );
}

/** A grid of cards under a title and a button (schemas, cron jobs). */
export function CardGridSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-48 bg-border rounded animate-pulse motion-reduce:animate-none" />
        <div className="h-10 w-32 bg-border rounded animate-pulse motion-reduce:animate-none" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse motion-reduce:animate-none">
            <CardHeader>
              <div className="h-6 w-32 bg-border rounded" />
            </CardHeader>
            <CardContent>
              <div className="h-4 w-24 bg-border rounded mb-2" />
              <div className="h-4 w-48 bg-border rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/** The records of a category without a form of its own (news, patches, items). */
export function RecordListSkeleton() {
  return (
    <div className="space-y-4 animate-pulse motion-reduce:animate-none">
      <div className="h-8 w-48 bg-border rounded" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-20 bg-border rounded-xl" />
      ))}
    </div>
  );
}

/** A screen's editor: its blocks beside the phone preview. */
export function ScreenEditSkeleton() {
  return (
    <div className="w-full space-y-6 py-8" aria-busy="true">
      <div className="h-4 w-28 rounded bg-border" />
      <div className="h-9 w-80 max-w-full animate-pulse rounded-lg bg-border motion-reduce:animate-none" />
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_375px]">
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-border motion-reduce:animate-none" />
          ))}
        </div>
        <div className="hidden h-[640px] animate-pulse rounded-2xl bg-border motion-reduce:animate-none xl:block" />
      </div>
    </div>
  );
}

/** The app's screens. */
export function ScreensListSkeleton() {
  return (
    <div className="space-y-4 py-8" aria-busy="true">
      <div className="h-9 w-64 animate-pulse rounded-lg bg-border motion-reduce:animate-none" />
      <div className="h-40 animate-pulse rounded-xl bg-border motion-reduce:animate-none" />
    </div>
  );
}

/** A deletion's confirmation. */
export function DeleteSkeleton() {
  return (
    <div className="max-w-md mx-auto py-12 animate-pulse motion-reduce:animate-none">
      <div className="h-64 bg-border rounded-xl"></div>
    </div>
  );
}

/** The raw JSON editor's placeholder. */
export function RawEditSkeleton() {
  return <div>Loading…</div>;
}
