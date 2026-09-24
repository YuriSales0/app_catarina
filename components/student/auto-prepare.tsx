"use client";

import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Lumi } from "@/components/brand/lumi";

function Waiting() {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center" aria-live="polite">
      <Lumi size={96} mood="think" className="animate-float" />
      <p className="font-display text-2xl font-semibold">{pending ? "O Lumi está preparando a atividade…" : "Preparando…"}</p>
      <span className="flex gap-1.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-3 w-3 animate-bounce rounded-full bg-primary" style={{ animationDelay: `${i * 150}ms` }} />
        ))}
      </span>
      <noscript>
        <button type="submit" className="kid-btn bg-primary text-primary-foreground">
          Preparar atividade
        </button>
      </noscript>
    </div>
  );
}

/**
 * Submits its form once, on mount: the child never presses "generate". The
 * server records a rejected proposal on failure, so a failed attempt does not
 * loop; the page falls back to the curriculum's own prompts.
 */
export function AutoPrepare({ action, lessonId }: { action: (formData: FormData) => Promise<void>; lessonId: string }) {
  const ref = useRef<HTMLFormElement>(null);
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    ref.current?.requestSubmit();
  }, []);
  return (
    <form ref={ref} action={action}>
      <input type="hidden" name="lessonId" value={lessonId} />
      <Waiting />
    </form>
  );
}
