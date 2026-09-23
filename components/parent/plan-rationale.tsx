import Link from "next/link";
import type { NextLessonPlan } from "@/schemas/lesson-plan";
import { Section } from "@/components/ui";

/** "Why this objective?" rendered from the engine's rationale object, never from a narrative. */
export function PlanRationale({ plan, studentId, subjectId }: { plan: NextLessonPlan; studentId: string; subjectId: string }) {
  const r = plan.rationale;
  const objectiveLink = (id: string, label: string) => (
    <Link href={`/students/${studentId}/subjects/${subjectId}/objectives/${id}`} className="underline">
      {label}
    </Link>
  );
  return (
    <>
      <Section title="Why this objective">
        {plan.source === "MANUAL" ? <p className="text-sm">Chosen by hand.</p> : null}
        <ul className="space-y-1 text-sm">
          {r.selected_because.map((reason, i) => (
            <li key={i}>{describe(reason, plan, objectiveLink)}</li>
          ))}
        </ul>
        {r.prerequisites_satisfied.length ? (
          <p className="text-sm text-muted">Prerequisites met: {r.prerequisites_satisfied.map((p) => `${p.objective_code} (${p.status.toLowerCase().replace("_", " ")})`).join(", ")}</p>
        ) : (
          <p className="text-sm text-muted">No prerequisites.</p>
        )}
        {r.score_breakdown.length ? (
          <details className="text-xs text-muted">
            <summary className="cursor-pointer">Score breakdown ({r.policy_version})</summary>
            <ul className="mt-1">
              {r.score_breakdown.map((b) => (
                <li key={b.component}>
                  {b.component.replace(/_/g, " ")}: {b.value > 0 ? "+" : ""}
                  {Math.round(b.value * 10) / 10}
                </li>
              ))}
              <li className="font-medium">total: {Math.round(r.score_breakdown.reduce((a, b) => a + b.value, 0) * 10) / 10}</li>
            </ul>
          </details>
        ) : null}
      </Section>
      {r.alternatives_rejected.length ? (
        <Section title={`Alternatives considered · ${r.alternatives_rejected.length}`}>
          <ul className="max-h-72 space-y-1 overflow-auto text-xs">
            {r.alternatives_rejected.map((a) => (
              <li key={a.objective_code}>
                <span className="font-mono">{a.objective_code}</span>: {a.reason.toLowerCase().replace("_", " ")}
                {a.blocking?.length ? ` (needs ${a.blocking.join(", ")})` : ""}
                {a.score !== undefined ? ` · score ${a.score}` : ""}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </>
  );
}

function describe(reason: NextLessonPlan["rationale"]["selected_because"][number], plan: NextLessonPlan, link: (id: string, label: string) => React.ReactNode) {
  const primary = plan.primary_objective;
  switch (reason.kind) {
    case "MANUAL_SELECTION":
      return "Selected by a parent or teacher.";
    case "NEXT_IN_SEQUENCE":
      return `It is the next objective in the curriculum order (unit ${reason.unit}, position ${reason.position}) whose prerequisites are met.`;
    case "DEVELOPING_CONTINUATION":
      return (
        <>
          It is developing and needs more demonstrated fluency: {reason.evidence_ids.length} recent attempts decided that status. {primary ? link(primary.id, "See the evidence.") : null}
        </>
      );
    case "PRACTISING_CONTINUATION":
      return <>It is still being practised, with {reason.evidence_ids.length} attempts so far. {primary ? link(primary.id, "See the evidence.") : null}</>;
    case "INTRODUCED_CONTINUATION":
      return "It has been introduced but not yet practised enough to assess.";
    case "REVIEW_DUE":
      return `A review is due: ${reason.days_overdue} days overdue${reason.last_success_at ? `, last success ${new Date(reason.last_success_at).toLocaleDateString("en-GB")}` : ""}.`;
    case "RETENTION_CHECK":
      return `It has been proficient since ${new Date(reason.proficient_since).toLocaleDateString("en-GB")}; a successful check now counts towards mastery.`;
    case "RECURRING_ERROR":
      return `The error "${reason.error_tag}" has recurred ${reason.occurrences} times across ${reason.lesson_ids.length} lessons.`;
  }
}
