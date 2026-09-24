import { requireActor } from "@/lib/auth/session";

/**
 * The child surface. No navigation, no analytics, no ids, large type. A
 * signed-in guardian opens it and sits with the child; the child never has an
 * account in the MVP.
 */
export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  await requireActor();
  return (
    <div className="relative flex min-h-screen flex-col items-center overflow-hidden bg-gradient-to-b from-lavender via-background to-sky px-4 py-6 text-foreground">
      <div aria-hidden className="pointer-events-none absolute -top-20 -left-20 h-72 w-72 rounded-full bg-peach/60 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -right-24 bottom-10 h-80 w-80 rounded-full bg-mint/70 blur-3xl" />
      <div className="relative flex w-full flex-1 flex-col items-center">{children}</div>
    </div>
  );
}
