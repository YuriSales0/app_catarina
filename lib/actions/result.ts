import { ZodError } from "zod";
import { NotFoundError, ValidationError, ConflictError } from "@/lib/authorization/errors";
import { log } from "@/lib/logging/logger";

/** Shape returned by every server action used with useActionState. */
export type ActionState = { ok: true; message?: string } | { ok: false; error: string; issues?: string[] } | null;

export function toActionError(err: unknown): ActionState {
  if (err instanceof ZodError) {
    return { ok: false, error: "Confira os campos do formulário.", issues: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  }
  if (err instanceof ValidationError) return { ok: false, error: err.message, issues: err.issues };
  if (err instanceof ConflictError) return { ok: false, error: err.message };
  if (err instanceof NotFoundError) return { ok: false, error: "Não encontrado." };
  // Next.js redirect() and notFound() throw; let them propagate.
  if (err && typeof err === "object" && "digest" in err) throw err;
  log.error("action.unhandled", { error: (err as Error)?.message });
  return { ok: false, error: "Algo deu errado. Tente de novo." };
}

/** Reads form fields into a plain object, dropping empty strings to undefined. */
export function formToObject(formData: FormData): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of formData.entries()) {
    // Next.js appends its own $ACTION_* bookkeeping fields to server-action form data.
    if (k.startsWith("$")) continue;
    if (typeof v === "string") out[k] = v === "" ? undefined : v;
  }
  return out;
}
