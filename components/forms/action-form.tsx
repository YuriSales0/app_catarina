"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/actions/result";

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  submitLabel: string;
  className?: string;
  variant?: "primary" | "secondary" | "danger";
};

/** A form bound to a server action, rendering validation errors inline. */
export function ActionForm({ action, children, submitLabel, className, variant = "primary" }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className={className ?? "space-y-3"}>
      {children}
      {state && !state.ok ? (
        <div role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm">
          <p>{state.error}</p>
          {state.issues?.length ? (
            <ul className="mt-1 list-disc pl-5 text-xs">
              {state.issues.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {state && state.ok && state.message ? (
        <p role="status" className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm">
          {state.message}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={`btn btn-${variant}`}>
        {pending ? "Working…" : submitLabel}
      </button>
    </form>
  );
}
