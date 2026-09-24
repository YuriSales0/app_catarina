import Link from "next/link";
import type { NextLessonPlan } from "@/schemas/lesson-plan";
import { Section, Details } from "@/components/ui";
import { STATUS } from "@/lib/copy/pt";

const REJECTED: Record<string, string> = {
  LOCKED: "bloqueado por pré-requisito",
  RECENTLY_TAUGHT: "ensinado há pouco",
  LOWER_PRIORITY: "prioridade menor",
  MASTERED: "já dominado",
  INACTIVE: "inativo",
};

/** "Why this lesson?" rendered from the engine's rationale object, never from a narrative. */
export function PlanRationale({ plan, studentId, subjectId }: { plan: NextLessonPlan; studentId: string; subjectId: string }) {
  const r = plan.rationale;
  const objectiveLink = (id: string, label: string) => (
    <Link href={`/students/${studentId}/subjects/${subjectId}/objectives/${id}`} className="font-bold text-primary underline-offset-2 hover:underline">
      {label}
    </Link>
  );
  return (
    <Section title="Por que esta aula?">
      <ul className="space-y-2 text-sm">
        {r.selected_because.map((reason, i) => (
          <li key={i} className="flex gap-2">
            <span aria-hidden>💡</span>
            <span>{describe(reason, plan, objectiveLink)}</span>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted">
        {r.prerequisites_satisfied.length
          ? `O que precisava vir antes já está firme: ${r.prerequisites_satisfied.map((p) => `${p.objective_code} (${STATUS[p.status].label.toLowerCase()})`).join(", ")}.`
          : "Este objetivo não depende de nenhum outro."}
      </p>
      {r.score_breakdown.length ? (
        <Details summary={`Pontuação do planejador (${r.policy_version})`}>
          <ul className="space-y-0.5 text-xs text-muted">
            {r.score_breakdown.map((b) => (
              <li key={b.component}>
                {b.component.replace(/_/g, " ")}: {b.value > 0 ? "+" : ""}
                {Math.round(b.value * 10) / 10}
              </li>
            ))}
            <li className="font-bold text-foreground">total: {Math.round(r.score_breakdown.reduce((a, b) => a + b.value, 0) * 10) / 10}</li>
          </ul>
        </Details>
      ) : null}
      {r.alternatives_rejected.length ? (
        <Details summary={`Outras opções consideradas (${r.alternatives_rejected.length})`}>
          <ul className="max-h-72 space-y-1 overflow-auto text-xs text-muted">
            {r.alternatives_rejected.map((a) => (
              <li key={a.objective_code}>
                <span className="font-mono">{a.objective_code}</span>: {REJECTED[a.reason] ?? a.reason.toLowerCase().replace(/_/g, " ")}
                {a.blocking?.length ? ` (precisa de ${a.blocking.join(", ")})` : ""}
                {a.score !== undefined ? ` · pontuação ${a.score}` : ""}
              </li>
            ))}
          </ul>
        </Details>
      ) : null}
    </Section>
  );
}

function describe(reason: NextLessonPlan["rationale"]["selected_because"][number], plan: NextLessonPlan, link: (id: string, label: string) => React.ReactNode) {
  const primary = plan.primary_objective;
  const date = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");
  switch (reason.kind) {
    case "MANUAL_SELECTION":
      return "Escolhido por um adulto.";
    case "NEXT_IN_SEQUENCE":
      return `É o próximo passo da trilha (unidade ${reason.unit}, posição ${reason.position}), e o que vem antes já está firme.`;
    case "DEVELOPING_CONTINUATION":
      return (
        <>
          Está ganhando confiança e precisa de mais prática para ficar firme ({reason.evidence_ids.length} tentativas recentes). {primary ? link(primary.id, "Ver as tentativas.") : null}
        </>
      );
    case "PRACTISING_CONTINUATION":
      return (
        <>
          Ainda está sendo praticado, com {reason.evidence_ids.length} tentativas até agora. {primary ? link(primary.id, "Ver as tentativas.") : null}
        </>
      );
    case "INTRODUCED_CONTINUATION":
      return "Foi apresentado, mas ainda não houve prática suficiente para avaliar.";
    case "REVIEW_DUE":
      return `Está na hora de revisar: ${reason.days_overdue} ${reason.days_overdue === 1 ? "dia" : "dias"} de atraso${reason.last_success_at ? `, último acerto em ${date(reason.last_success_at)}` : ""}.`;
    case "RETENTION_CHECK":
      return `Já consegue desde ${date(reason.proficient_since)}. Acertar agora mostra que ficou na memória e conta para "dominou".`;
    case "RECURRING_ERROR":
      return `Um mesmo erro ("${reason.error_tag}") apareceu ${reason.occurrences} vezes em ${reason.lesson_ids.length} aulas.`;
  }
}
