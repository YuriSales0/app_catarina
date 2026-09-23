import Link from "next/link";
import type { ObjectiveStatus, ConfidenceLevel } from "@/lib/db/enums";
import { copy } from "@/lib/copy/en";

export function PageHeader({ title, subtitle, actions, crumbs }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode; crumbs?: Array<{ href: string; label: string }> }) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {crumbs?.length ? (
          <nav aria-label="Breadcrumb" className="mb-1 text-xs text-muted">
            {crumbs.map((c, i) => (
              <span key={c.href}>
                {i > 0 ? " / " : ""}
                <Link href={c.href} className="hover:underline">
                  {c.label}
                </Link>
              </span>
            ))}
          </nav>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function DemoBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="badge border-warning/50 bg-warning/10 text-warning" title={copy.demoNotice}>
      {copy.demoBadge}
    </span>
  );
}

export function DemoNotice({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <p className="mb-4 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">{copy.demoNotice}</p>
  );
}

const STATUS_STYLE: Record<ObjectiveStatus, string> = {
  NOT_STARTED: "border-border text-muted",
  INTRODUCED: "border-border",
  PRACTISING: "border-warning/50 text-warning",
  DEVELOPING: "border-primary/50 text-primary",
  PROFICIENT: "border-success/50 text-success",
  MASTERED: "border-success bg-success/10 text-success",
};

export function StatusBadge({ status }: { status: ObjectiveStatus }) {
  return <span className={`badge ${STATUS_STYLE[status]}`}>{status.replace("_", " ").toLowerCase()}</span>;
}

export function ConfidenceBadge({ level }: { level: ConfidenceLevel }) {
  return <span className="badge">confidence: {level.toLowerCase()}</span>;
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="card text-center">
      <p className="font-medium">{title}</p>
      {children ? <div className="mt-2 text-sm text-muted">{children}</div> : null}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function formatDate(d: Date | string | null | undefined, tz?: string) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: tz }).format(date);
}

export function formatDateTime(d: Date | string | null | undefined, tz?: string) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: tz }).format(date);
}

export { ageYears } from "@/lib/students/age";
