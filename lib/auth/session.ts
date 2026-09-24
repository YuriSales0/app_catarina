import "server-only";
import { redirect } from "next/navigation";
import { auth } from "./config";
import { asUserId, type UserId } from "@/types/ids";
import { getRequestId } from "@/lib/logging/request-id";

/** Who is acting. Carries the immutable users.id and a request id, nothing else. */
export type Actor = {
  readonly userId: UserId;
  readonly requestId: string;
};

export async function getActor(): Promise<Actor | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return { userId: asUserId(session.user.id), requestId: await getRequestId() };
}

/** Server-component helper: redirects to /login when unauthenticated. */
export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/login");
  return actor;
}

/** First name for greetings, from the session. Never used for identity. */
export async function getDisplayName(): Promise<string | null> {
  const session = await auth();
  const name = session?.user?.name?.trim() || session?.user?.email?.split("@")[0] || null;
  return name ? name.split(/\s+/)[0] : null;
}
