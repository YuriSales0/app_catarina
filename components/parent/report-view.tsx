import Link from "next/link";
import type { LessonReport } from "@/schemas/lesson-report";
import { StatusBadge, StatTile } from "@/components/ui";
import { ResultBar } from "@/components/parent/charts";
import { ACTIVITY, CONFIDENCE } from "@/lib/copy/pt";

const SOURCE: Record<string, string> = { RULE_ENGINE: "regra do sistema", AI_PROVIDER: "IA", HUMAN: "adulto" };
const PACING: Record<string, string> = { SLOW_DOWN: "Ir mais devagar", HOLD: "Manter o ritmo", ADVANCE: "Pode avançar" };

/** Three sections, three epistemic statuses, never collapsed into one note. */
export function ReportView({ report, objectives, studentId, subjectId }: { report: LessonReport; objectives: Array<{ id: string; title: string }>; studentId: string; subjectId: string }) {
  const title = (id: string) => objectives.find((o) => o.id === id)?.title ?? id;
  const o = report.observed;
  const i = report.inferred;
  const r = report.recommended;
  const res = o.evidence_summary.by_result;
  const assessed = res.CORRECT + res.PARTIALLY_CORRECT + res.INCORRECT;
  const g = o.evidence_summary.by_grader;
  const stageChanges = o.state_transitions.filter((t) => t.from_status !== t.to_status).length;

  return (
    <div className="space-y-6">
      <section aria-label="Resumo" className="card space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile value={o.actual_duration_minutes !== null && o.actual_duration_minutes !== undefined ? `${o.actual_duration_minutes} min` : "—"} label="Duração" tone="sky" />
          <StatTile value={o.evidence_summary.total} label="Tentativas" tone="lavender" />
          <StatTile value={assessed ? `${Math.round((res.CORRECT / assessed) * 100)}%` : "—"} label="Acertos" tone="mint" hint="Acertos entre as tentativas avaliadas" />
          <StatTile value={stageChanges} label={stageChanges === 1 ? "Mudança de estágio" : "Mudanças de estágio"} tone="sun" />
        </div>
        {assessed ? <ResultBar correct={res.CORRECT} partial={res.PARTIALLY_CORRECT} incorrect={res.INCORRECT} /> : null}
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card space-y-4">
          <div>
            <h2 className="font-display text-lg font-semibold">O que aconteceu</h2>
            <p className="text-xs text-muted">Calculado a partir das tentativas. Nenhum modelo escreve esta parte.</p>
          </div>
          <p className="text-sm">
            {o.evidence_summary.total} tentativas · {res.CORRECT} certas · {res.PARTIALLY_CORRECT} quase · {res.INCORRECT} ainda não
          </p>
          <p className="text-xs text-muted">
            Quem corrigiu: adulto {g.HUMAN} · sistema {g.SYSTEM} · IA {g.AI_PROVIDER}
          </p>
          <div>
            <h3 className="eyebrow mb-1.5">Objetivos trabalhados</h3>
            <ul className="space-y-1 text-sm">
              {o.objectives_attempted.map((a) => (
                <li key={a.objective_id}>
                  <Link href={`/students/${studentId}/subjects/${subjectId}/objectives/${a.objective_id}`} className="font-bold hover:text-primary">
                    {a.title}
                  </Link>
                  : {a.correct} de {a.attempts} certas{a.partially_correct ? `, ${a.partially_correct} quase` : ""}
                </li>
              ))}
            </ul>
          </div>
          {o.state_transitions.length ? (
            <div>
              <h3 className="eyebrow mb-1.5">Mudanças no progresso</h3>
              <ul className="space-y-2 text-sm">
                {o.state_transitions.map((t) => (
                  <li key={t.transition_id} className="flex flex-wrap items-center gap-1.5">
                    <span className="font-bold">{title(t.objective_id)}:</span>{" "}
                    {t.from_status === t.to_status ? (
                      <>
                        <StatusBadge status={t.to_status} short />
                        <span className="text-xs text-muted">
                          {CONFIDENCE[t.from_confidence]} → {CONFIDENCE[t.to_confidence]}
                        </span>
                      </>
                    ) : (
                      <>
                        <StatusBadge status={t.from_status} short /> → <StatusBadge status={t.to_status} short />
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {o.errors_observed.length ? (
            <div>
              <h3 className="eyebrow mb-1.5">Erros observados</h3>
              <ul className="space-y-1 text-sm">
                {o.errors_observed.map((e) => (
                  <li key={e.error_tag}>
                    {e.human_label} × {e.count}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {o.teacher_notes.length ? (
            <div>
              <h3 className="eyebrow mb-1.5">Anotações</h3>
              <ul className="space-y-1 text-sm">
                {o.teacher_notes.map((n) => (
                  <li key={n.event_id} className="rounded-xl bg-surface-2 px-3 py-2">
                    {n.text}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {o.activities_completed.length ? (
            <p className="text-xs text-muted">Atividades: {o.activities_completed.map((a) => `${ACTIVITY[a.activity_type].adult}${a.completed ? "" : " (incompleta)"}`).join(" · ")}</p>
          ) : null}
        </section>

        <section className="card space-y-4">
          <div>
            <h2 className="font-display text-lg font-semibold">O que isso pode indicar</h2>
            <p className="text-xs text-muted">Interpretações. Cada uma diz de onde vem e em quais tentativas se baseia. Elas nunca mudam o progresso.</p>
          </div>
          {i.statements.length === 0 && i.recurring_errors.length === 0 && i.successful_patterns.length === 0 && i.failed_patterns.length === 0 ? (
            <p className="text-sm text-muted">Ainda não há o que interpretar nesta aula.</p>
          ) : null}
          <ul className="space-y-2 text-sm">
            {i.statements.map((st, idx) => (
              <li key={idx}>
                {st.statement}{" "}
                <span className="text-xs text-muted">
                  ({SOURCE[st.source] ?? st.source}, {CONFIDENCE[st.confidence]}, {st.basis_evidence_ids.length} tentativas)
                </span>
              </li>
            ))}
          </ul>
          {i.recurring_errors.length ? (
            <ul className="space-y-1 text-sm">
              {i.recurring_errors.map((e) => (
                <li key={e.error_tag}>
                  <strong>{e.human_label}</strong>: {e.occurrences_this_lesson} nesta aula, {e.occurrences_last_30_days} em 30 dias{e.is_recurring ? " · se repete" : ""}
                </li>
              ))}
            </ul>
          ) : null}
          {i.successful_patterns.length ? (
            <ul className="space-y-1 rounded-2xl bg-mint p-3 text-sm text-mint-ink">
              {i.successful_patterns.map((p) => (
                <li key={p}>✓ {p}</li>
              ))}
            </ul>
          ) : null}
          {i.failed_patterns.length ? (
            <ul className="space-y-1 rounded-2xl bg-peach p-3 text-sm text-peach-ink">
              {i.failed_patterns.map((p) => (
                <li key={p}>↺ {p}</li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="card space-y-4">
          <div>
            <h2 className="font-display text-lg font-semibold">Próximos passos</h2>
            <p className="text-xs text-muted">Sugestões. Nada aqui é aplicado sozinho; o planejador decide a próxima aula de novo.</p>
          </div>
          {r.recommended_review.length ? (
            <ul className="space-y-1 text-sm">
              {r.recommended_review.map((x) => (
                <li key={x.objective_id}>
                  <strong>Revisar {title(x.objective_id)}:</strong> {x.reason}
                </li>
              ))}
            </ul>
          ) : null}
          {r.pacing ? (
            <p className="text-sm">
              <strong>{PACING[r.pacing.suggestion] ?? r.pacing.suggestion}:</strong> {r.pacing.reason}
            </p>
          ) : null}
          {r.parent_actions.length ? (
            <ul className="space-y-2 text-sm">
              {r.parent_actions.map((a) => (
                <li key={a.action} className="rounded-2xl bg-sky p-3 text-sky-ink">
                  <strong>Para a família:</strong> {a.action} <span className="block text-xs opacity-80">{a.reason}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {!r.recommended_review.length && !r.pacing && !r.parent_actions.length ? <p className="text-sm text-muted">Nenhuma sugestão nesta aula.</p> : null}
        </section>
      </div>
    </div>
  );
}
