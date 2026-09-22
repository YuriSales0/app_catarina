import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { signOut } from "@/lib/auth/config";
import { copy } from "@/lib/copy/en";

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  await requireActor();
  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/dashboard" className="font-semibold tracking-tight">
            {copy.appName}
          </Link>
          <nav aria-label="Main" className="flex items-center gap-4 text-sm">
            <Link href="/dashboard" className="hover:underline">
              {copy.nav.dashboard}
            </Link>
            <Link href="/students" className="hover:underline">
              {copy.nav.students}
            </Link>
            <Link href="/curricula" className="hover:underline">
              {copy.nav.curricula}
            </Link>
            <form action={doSignOut}>
              <button type="submit" className="text-muted hover:underline">
                {copy.nav.signOut}
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {children}
      </main>
      <footer className="border-t border-border px-4 py-4 text-center text-xs text-muted">{copy.tagline}</footer>
    </div>
  );
}
