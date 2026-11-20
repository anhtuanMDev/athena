import { useNavigate } from "react-router";

import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader } from "~/components/ui/card";

import type { ReactNode } from "react";

interface RecordFormCardProps {
  game: string;
  title: ReactNode;
  children: ReactNode;
}

/** A built-in editor's card: its title, the way to the schemas, and the form. */
export function RecordFormCard({ game, title, children }: RecordFormCardProps) {
  const navigate = useNavigate();
  return (
    <div className="w-full py-8">
      <Card>
        <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4">
          <h1 className="text-2xl font-bold text-ink capitalize tracking-tight">{title}</h1>
          <Button variant="outline" size="small" onClick={() => { void navigate(`/${game}/schemas`); }} className="w-full md:w-auto">
            Edit Schema
          </Button>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}
