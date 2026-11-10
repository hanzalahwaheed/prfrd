import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { engineerSnapshots } from "@/lib/data/dashboard";

const engineers = engineerSnapshots
  .map((snapshot) => snapshot.employee)
  .sort((a, b) => a.name.localeCompare(b.name));

export default function Page() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:80px_80px] opacity-30"
      />

      <main className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-8">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold tracking-tight">prfrd</span>
            <Badge
              variant="outline"
              className="text-[10px] uppercase tracking-[0.16em]"
            >
              Prototype
            </Badge>
          </div>
          <span className="text-xs text-muted-foreground">
            Evidence-grounded review prep
          </span>
        </header>

        <section className="flex flex-1 flex-col justify-center py-16">
          <div className="max-w-2xl space-y-5">
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              Your preferred way to map talent.
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-muted-foreground">
              <strong className="font-semibold text-foreground">
                Weekly GitHub and Slack activity
              </strong>{" "}
              becomes{" "}
              <strong className="font-semibold text-foreground">
                cited monthly and quarterly evidence
              </strong>
              . Managers get{" "}
              <strong className="font-semibold text-foreground">
                review-ready context
              </strong>
              ; engineers get a clear view of their own work.{" "}
              <strong className="font-semibold text-foreground">
                No rankings, no opaque verdicts.
              </strong>
            </p>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-2">
            <Card className="bg-card/80">
              <CardHeader>
                <CardTitle className="text-lg">Engineer view</CardTitle>
                <CardDescription>
                  Weekly activity, monthly summaries, and generated reports for
                  one person.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button className="w-full justify-between" variant="outline">
                      Choose an engineer
                      <span aria-hidden>↓</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="w-[22rem]"
                  >
                    <DropdownMenuLabel className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                      Seeded demo engineers
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {engineers.map((engineer) => {
                      const encodedEmail = encodeURIComponent(engineer.email);
                      return (
                        <DropdownMenuItem
                          key={engineer.email}
                          asChild
                          className="px-3 py-3 text-sm"
                        >
                          <Link
                            href={`/engineer/${encodedEmail}`}
                            className="flex w-full items-center justify-between gap-3"
                          >
                            <span className="font-medium">{engineer.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {engineer.email}
                            </span>
                          </Link>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardContent>
            </Card>

            <Card className="bg-card/80">
              <CardHeader>
                <CardTitle className="text-lg">Manager view</CardTitle>
                <CardDescription>
                  Team rollups, risk flags, and drill-downs backed by persisted
                  analysis.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild className="w-full justify-between">
                  <Link href="/manager">
                    Open manager workspace
                    <span aria-hidden>→</span>
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-5 text-xs text-muted-foreground">
          <span>Demo data is seeded locally. No production data is used.</span>
          <span className="font-mono">v0.1.0</span>
        </footer>
      </main>
    </div>
  );
}
