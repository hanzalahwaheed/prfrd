import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Page() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-12">
        <header className="flex flex-col gap-3">
          <div className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Role Dashboards
          </div>
          <h1 className="text-3xl font-semibold sm:text-4xl">
            Choose your workspace
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Start with the view that matches your role. Engineers get a focused
            weekly activity snapshot. Managers get a team-wide health and risk
            overview.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          <RoleCard
            title="Engineer Dashboard"
            description="Pick an engineer to review personal activity, PR highlights, and communication trends."
            href="/engineer"
            cta="Open Engineer View"
          />
          <RoleCard
            title="Manager Dashboard"
            description="Team rollups with drill-down access to personal engineer views."
            href="/manager"
            cta="Open Manager View"
          />
        </section>
      </main>
    </div>
  );
}

type RoleCardProps = {
  title: string;
  description: string;
  href: string;
  cta: string;
};

function RoleCard({ title, description, href, cta }: RoleCardProps) {
  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3">
          {title}
          <Badge variant="secondary">New</Badge>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-none border border-dashed border-border/70 bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
          Data shown uses the latest seeded snapshots.
        </div>
      </CardContent>
      <CardFooter>
        <Button asChild>
          <Link href={href}>{cta}</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
