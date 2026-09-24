"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Top navigation with the current section highlighted. */
export function NavLinks({ items }: { items: Array<{ href: string; label: string; match: string[] }> }) {
  const pathname = usePathname();
  return (
    <ul className="flex items-center gap-1">
      {items.map((it) => {
        const active = it.match.some((m) => pathname === m || pathname.startsWith(`${m}/`));
        return (
          <li key={it.href}>
            <Link
              href={it.href}
              aria-current={active ? "page" : undefined}
              className={`rounded-full px-3.5 py-2 text-sm font-bold whitespace-nowrap transition ${active ? "bg-primary-soft text-primary-strong" : "text-muted hover:bg-surface-2 hover:text-foreground"}`}
            >
              {it.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
