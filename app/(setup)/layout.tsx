import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { Logo } from "@/components/brand/lumi";

/** A calm, navigation-free frame for first steps. */
export default async function SetupLayout({ children }: { children: React.ReactNode }) {
  await requireActor();
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute -top-32 -right-24 h-96 w-96 rounded-full bg-lavender blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-mint blur-3xl" />
      <header className="relative mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-5">
        <Logo />
        <Link href="/students" className="btn btn-ghost btn-sm">
          Pular por agora
        </Link>
      </header>
      <main className="relative mx-auto w-full max-w-3xl flex-1 px-4 pb-16">{children}</main>
    </div>
  );
}
