import Link from "next/link";

import { Button } from "@/components/ui/button";
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
    <div className="min-h-screen bg-red-600 text-white">
      <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center justify-center px-6 py-10">
        <section className="grid w-full max-w-3xl gap-5 md:grid-cols-2">
          <div className="space-y-4 md:col-span-2">
            <div className="text-4xl tracking-tight font-extrabold text-center text-white">
              prfrd
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-center">
              Your preferred way to map talent.
            </h1>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="lg"
                className="h-40 border border-black bg-white text-3xl font-semibold text-black hover:bg-white/90"
              >
                Engineer
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="center"
              className="w-[24rem] border-black bg-white text-black"
            >
              <DropdownMenuLabel className="text-[11px] uppercase tracking-[0.18em] text-black/60">
                Select engineer
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-black/15" />
              {engineers.map((engineer) => {
                const encodedEmail = encodeURIComponent(engineer.email);
                return (
                  <DropdownMenuItem
                    key={engineer.email}
                    asChild
                    className="px-3 py-3 text-sm focus:bg-red-100 focus:text-black"
                  >
                    <Link
                      href={`/engineer/${encodedEmail}`}
                      className="flex w-full items-center justify-between gap-3"
                    >
                      <span className="font-medium">{engineer.name}</span>
                      <span className="text-xs text-black/60">
                        {engineer.email}
                      </span>
                    </Link>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            asChild
            size="lg"
            className="h-40 border border-black bg-white text-3xl font-semibold text-black hover:bg-black! hover:text-white!"
          >
            <Link href="/manager">Manager</Link>
          </Button>
        </section>
      </main>
    </div>
  );
}
