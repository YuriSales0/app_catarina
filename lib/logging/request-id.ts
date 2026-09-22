import { headers } from "next/headers";
import { newId } from "@/lib/ids";

/** A request id carried into every log line for the current server request. */
export async function getRequestId(): Promise<string> {
  try {
    const h = await headers();
    return h.get("x-request-id") ?? newId();
  } catch {
    return newId();
  }
}
