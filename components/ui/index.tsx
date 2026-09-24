import Link from "next/link";
import type { ObjectiveStatus, ConfidenceLevel } from "@/lib/db/enums";
import { copy, STATUS, TONE, CONFIDENCE, type Tone } from "@/lib/copy/pt";
import { Lumi } from "@/components/brand/lumi";

export function PageHeader({
  title,
  subtitle,
  actions,
  crumbs,
  eyebrow,
  leading,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  crumbs?: Array<{ href: string; label: string }>;
  eyebrow?: string;
  leading?: React.ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex items-center gap-4">
        {leading}
        <div>
          {crumbs?.length ? (
            <nav aria-label="Caminho" className="mb-1.5 flex flex-wrap items-center gap-1 text-xs font-semibold text-muted">
              {crumbs.map((c, i) => (
                <span key={c.href} className="flex items-center gap-1">
                  {i > 0 ? <span aria-hidden>›</span> : null}
                  <Link href={c.href} className="rounded hover:text-primary">
                    {c.label}
                  </Link>
                </span>
              ))}
            </nav>
          ) : null}
          {eyebrow ? <p className="eyebrow mb-1">{eyebrow}</p> : null}
          <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
          {subtitle ? <div className="mt-1.5 text-sm text-muted">{subtitle}</div> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function DemoBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="badge border-sun-ink/30 bg-sun text-sun-ink" title={copy.demoNotice}>
      {copy.demoBadge}
    </span>
  );
}

export function DemoNotice({ show }: { show: boolean }) {
  if (!show) return null;
  return <p className="mb-6 rounded-2xl bg-sun px-4 py-3 text-sm text-sun-ink">{copy.demoNotice}</p>;
}

export function ToneChip({ tone, children, className = "" }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return <span className={`badge border-transparent ${TONE[tone].bg} ${TONE[tone].ink} ${className}`}>{children}</span>;
}

export function StatusBadge({ status, short = false }: { status: ObjectiveStatus; short?: boolean }) {
  const s = STATUS[status];
  return (
    <ToneChip tone={s.tone}>
      <span aria-hidden>{s.emoji}</span>
      {short ? s.short : s.label}
    </ToneChip>
  );
}

export function ConfidenceBadge({ level }: { level: ConfidenceLevel }) {
  return <span className="badge text-muted">{CONFIDENCE[level]}</span>;
}

export function EmptyState({ title, children, mascot = true }: { title: string; children?: React.ReactNode; mascot?: boolean }) {
  return (
    <div className="card flex flex-col items-center gap-3 py-10 text-center">
      {mascot ? <Lumi size={84} mood="think" /> : null}
      <p className="font-display text-xl font-semibold">{title}</p>
      {children ? <div className="max-w-md text-sm text-muted">{children}</div> : null}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block font-bold">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function Section({ title, children, aside, className = "" }: { title: string; children: React.ReactNode; aside?: React.ReactNode; className?: string }) {
  return (
    <section className={`card space-y-4 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** A simple progress ring: a share of the whole, with its label in the middle. */
export function ProgressRing({ value, total, size = 76, label }: { value: number; total: number; size?: number; label?: string }) {
  const pct = total > 0 ? Math.min(1, value / total) : 0;
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 76 76" width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx="38" cy="38" r={r} fill="none" strokeWidth="8" className="stroke-primary-soft" />
        {pct > 0 ? <circle cx="38" cy="38" r={r} fill="none" strokeWidth="8" strokeLinecap="round" className="stroke-primary" strokeDasharray={`${pct * c} ${c}`} /> : null}
      </svg>
      <span className="absolute text-center leading-tight">
        <span className="block font-display text-lg font-semibold">{Math.round(pct * 100)}%</span>
        {label ? <span className="block text-[10px] font-bold text-muted uppercase">{label}</span> : null}
      </span>
    </div>
  );
}

export function StatTile({ value, label, tone = "neutral", hint }: { value: React.ReactNode; label: string; tone?: Tone; hint?: string }) {
  return (
    <div className={`rounded-2xl px-4 py-3 ${TONE[tone].bg}`} title={hint}>
      <p className={`font-display text-2xl font-semibold ${tone === "neutral" ? "" : TONE[tone].ink}`}>{value}</p>
      <p className="text-xs font-bold text-muted">{label}</p>
    </div>
  );
}

/** Technical detail kept one click away rather than removed. */
export function Details({ summary, children, className = "" }: { summary: string; children: React.ReactNode; className?: string }) {
  return (
    <details className={`group rounded-2xl border border-border/80 bg-surface-2/60 px-4 py-3 text-sm ${className}`}>
      <summary className="cursor-pointer list-none font-bold text-muted marker:content-none group-open:mb-3">
        <span aria-hidden className="mr-1 inline-block transition group-open:rotate-90">›</span> {summary}
      </summary>
      {children}
    </details>
  );
}

const DATE = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" });

export function formatDate(d: Date | string | null | undefined, tz?: string) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d.length === 10 ? `${d}T12:00:00Z` : d) : d;
  return tz ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeZone: tz }).format(date) : DATE.format(date);
}

export function formatDateTime(d: Date | string | null | undefined, tz?: string) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short", timeZone: tz }).format(date);
}

export function formatRelativeDay(d: Date | string | null | undefined, now = new Date()) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  const days = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (days <= 0) return "hoje";
  if (days === 1) return "ontem";
  if (days < 7) return `há ${days} dias`;
  return formatDate(date);
}

export { ageYears } from "@/lib/students/age";
