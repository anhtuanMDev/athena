import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader } from "~/components/ui/card";

import type { ReactNode } from "react";

interface EnumCardProps {
  title: string;
  /** Edit's Back button. */
  onBack?: () => void;
  children: ReactNode;
}

/** The enum page's card: its title (and Edit's Back button) over the form. */
export function EnumCard({ title, onBack, children }: EnumCardProps) {
  return (
    <div className="w-full py-8">
      <Card>
        {onBack ? (
          <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4">
            <h1 className="text-2xl font-bold text-ink capitalize tracking-tight">{title}</h1>
            <Button variant="outline" size="small" onClick={onBack}>
              Back
            </Button>
          </CardHeader>
        ) : (
          <CardHeader>
            <h1 className="text-2xl font-bold text-ink capitalize">{title}</h1>
          </CardHeader>
        )}
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}
