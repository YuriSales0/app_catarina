import { requireActor } from "@/lib/auth/session";

/**
 * The child surface. No navigation, no analytics, no ids, large type. A
 * signed-in guardian opens it and sits with the child; the child never has an
 * account in the MVP.
 */
export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  await requireActor();
  return <div className="flex min-h-screen flex-col items-center justify-center bg-accent px-4 py-8 text-foreground">{children}</div>;
}
