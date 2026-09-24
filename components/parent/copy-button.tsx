"use client";

import { useState } from "react";

/** Copies a block of text to the clipboard, with a fallback of selecting it for a manual copy. */
export function CopyButton({ targetId, label = "Copiar roteiro" }: { targetId: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const el = document.getElementById(targetId) as HTMLTextAreaElement | null;
    if (!el) return;
    try {
      await navigator.clipboard.writeText(el.value);
    } catch {
      el.select();
      document.execCommand?.("copy");
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  };
  return (
    <button type="button" onClick={copy} className="btn btn-primary">
      {copied ? "Copiado ✓" : label}
    </button>
  );
}
