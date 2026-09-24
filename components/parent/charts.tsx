import { OBJECTIVE_STATUSES, type ObjectiveStatus } from "@/lib/db/enums";
import { STATUS } from "@/lib/copy/pt";

/*
 * Small, dependency-free charts. Stages are ordinal, so they use one hue from
 * light to dark (--ord-0..5, validated per mode). Every segment has a hover
 * label and the legend doubles as the table view: color is never the only
 * carrier of meaning.
 */

const ORD: Record<ObjectiveStatus, string> = {
  NOT_STARTED: "bg-ord-0",
  INTRODUCED: "bg-ord-1",
  PRACTISING: "bg-ord-2",
  DEVELOPING: "bg-ord-3",
  PROFICIENT: "bg-ord-4",
  MASTERED: "bg-ord-5",
};

function Segment({ share, className, label }: { share: number; className: string; label: string }) {
  if (share <= 0) return null;
  return (
    <span className={`group relative block h-full first:rounded-l-md last:rounded-r-md ${className}`} style={{ width: `${share * 100}%` }}>
      <span role="tooltip" className="pointer-events-none absolute -top-9 left-1/2 z-10 hidden -translate-x-1/2 rounded-lg bg-foreground px-2.5 py-1 text-xs font-bold whitespace-nowrap text-background shadow-soft group-hover:block">
        {label}
      </span>
    </span>
  );
}

/** How many objectives sit at each stage of the trail, as one stacked bar plus a labelled legend. */
export function StageBar({ counts, total }: { counts: Record<ObjectiveStatus, number>; total: number }) {
  const summary = OBJECTIVE_STATUSES.map((s) => `${STATUS[s].label}: ${counts[s]}`).join(", ");
  return (
    <figure className="space-y-3">
      <div role="img" aria-label={`Objetivos por estágio. ${summary}.`} className="flex h-5 w-full gap-0.5 rounded-md bg-surface-2">
        {OBJECTIVE_STATUSES.map((s) => (
          <Segment key={s} share={total ? counts[s] / total : 0} className={ORD[s]} label={`${STATUS[s].label}: ${counts[s]}`} />
        ))}
      </div>
      <figcaption>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
          {OBJECTIVE_STATUSES.map((s) => (
            <li key={s} className="flex items-center gap-2">
              <span aria-hidden className={`h-3 w-3 shrink-0 rounded ${ORD[s]}`} />
              <span className="text-muted">
                {STATUS[s].emoji} {STATUS[s].label}
              </span>
              <span className="ml-auto font-bold tabular-nums">{counts[s]}</span>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}

/** One horizontal bar per row, single series: share of objectives already secure. */
export function ShareBars({ rows }: { rows: Array<{ label: string; value: number; total: number }> }) {
  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const pct = r.total ? r.value / r.total : 0;
        return (
          <li key={r.label}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
              <span className="font-bold">{r.label}</span>
              <span className="text-xs text-muted tabular-nums">
                {r.value} de {r.total}
              </span>
            </div>
            <div className="group relative h-2.5 rounded-full bg-surface-2" role="img" aria-label={`${r.label}: ${r.value} de ${r.total}`}>
              {pct > 0 ? <span className="block h-full rounded-full bg-ord-4" style={{ width: `${Math.max(4, pct * 100)}%` }} /> : null}
              <span role="tooltip" className="pointer-events-none absolute -top-8 right-0 z-10 hidden rounded-lg bg-foreground px-2 py-0.5 text-xs font-bold text-background group-hover:block">
                {Math.round(pct * 100)}%
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Attempt results for one lesson: status colours, each with an icon, a label and a count. */
export function ResultBar({ correct, partial, incorrect }: { correct: number; partial: number; incorrect: number }) {
  const total = correct + partial + incorrect;
  const parts = [
    { key: "good", n: correct, label: "Acertou", icon: "✓", cls: "bg-st-good" },
    { key: "mid", n: partial, label: "Quase", icon: "≈", cls: "bg-st-mid" },
    { key: "low", n: incorrect, label: "Ainda não", icon: "↺", cls: "bg-st-low" },
  ];
  return (
    <figure className="space-y-2">
      <div role="img" aria-label={parts.map((p) => `${p.label}: ${p.n}`).join(", ")} className="flex h-4 w-full gap-0.5 rounded-md bg-surface-2">
        {parts.map((p) => (
          <Segment key={p.key} share={total ? p.n / total : 0} className={p.cls} label={`${p.label}: ${p.n}`} />
        ))}
      </div>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {parts.map((p) => (
          <span key={p.key} className="flex items-center gap-1.5">
            <span aria-hidden className={`inline-flex h-4 w-4 items-center justify-center rounded text-[10px] font-bold text-white ${p.cls}`}>
              {p.icon}
            </span>
            {p.label} <strong className="tabular-nums">{p.n}</strong>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
