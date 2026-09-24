"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/actions/result";
import { copy } from "@/lib/copy/pt";

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  submitLabel: string;
  className?: string;
  variant?: "primary" | "secondary" | "danger" | "soft";
  size?: "sm" | "lg";
};

/** A form bound to a server action, rendering validation errors inline. */
export function ActionForm({ action, children, submitLabel, className, variant = "primary", size }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className={className ?? "space-y-3"}>
      {children}
      {state && !state.ok ? (
        <div role="alert" className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm">
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
        <p role="status" className="rounded-2xl bg-mint px-4 py-3 text-sm text-mint-ink">
          {state.message}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={`btn btn-${variant}${size ? ` btn-${size}` : ""}`}>
        {pending ? copy.working : submitLabel}
      </button>
    </form>
  );
}
