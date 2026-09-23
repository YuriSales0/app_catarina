import { notFound } from "next/navigation";
import { ZodError } from "zod";
import { isNotFound } from "@/lib/authorization/errors";

/** Runs a loader; a NotFoundError (including an authorization denial) renders the 404 page. */
export async function or404<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (err) {
    if (isNotFound(err) || err instanceof ZodError) notFound();
    throw err;
  }
}
