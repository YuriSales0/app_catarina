import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { signOut } from "@/lib/auth/config";
import { copy } from "@/lib/copy/pt";
import { Logo } from "@/components/brand/lumi";
import { NavLinks } from "@/components/shell/nav-links";

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  await requireActor();
  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/" });
  }
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-surface focus:px-4 focus:py-2">
        Pular para o conteúdo
      </a>
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3">
          <Link href="/dashboard" className="shrink-0 rounded-full" aria-label={`${copy.appName}, início`}>
            <Logo />
          </Link>
          <nav aria-label="Principal" className="-mx-1 flex-1 overflow-x-auto px-1">
            <NavLinks
              items={[
                { href: "/dashboard", label: copy.nav.dashboard, match: ["/dashboard", "/lessons", "/snapshots"] },
                { href: "/students", label: copy.nav.students, match: ["/students"] },
                { href: "/curricula", label: copy.nav.curricula, match: ["/curricula"] },
              ]}
            />
          </nav>
          <Link href="/criancas" className="btn btn-soft hidden sm:inline-flex">
            <span aria-hidden>🦉</span> {copy.nav.kids}
          </Link>
          <form action={doSignOut}>
            <button type="submit" className="btn btn-ghost btn-sm">
              {copy.nav.signOut}
            </button>
          </form>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:py-10">
        {children}
      </main>
      <footer className="px-4 py-6 text-center text-xs text-muted">
        {copy.appName} · {copy.tagline}
      </footer>
    </div>
  );
}
