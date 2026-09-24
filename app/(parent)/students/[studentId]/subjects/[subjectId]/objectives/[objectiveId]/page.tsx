import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { requireStudentAccess } from "@/lib/authorization/access";
import { or404 } from "@/lib/actions/page";
import { getStudent } from "@/lib/students/service";
import { explainObjectiveState } from "@/lib/learning/progress";
import { PageHeader, Section, StatusBadge, ConfidenceBadge, ToneChip, Details, formatDateTime, Field } from "@/components/ui";
import { ActionForm } from "@/components/forms/action-form";
import { correctEvidenceAction } from "@/app/(parent)/lessons/actions";
import { roleAllows } from "@/lib/authorization/permissions";
import { CURRENT_STATE_POLICY } from "@/lib/learning/state-policy";
import { RESULT, EVIDENCE_TYPE, STATUS } from "@/lib/copy/pt";
import { EVIDENCE_RESULTS } from "@/lib/db/enums";

const GRADER: Record<string, string> = { HUMAN: "adulto", SYSTEM: "sistema", AI_PROVIDER: "IA" };

/** "Why is this objective marked X?" answered from the ledger, not from a narrative. */
export default async function ObjectiveExplanationPage(props: { params: Promise<{ studentId: string; subjectId: string; objectiveId: string }> }) {
  const { studentId, subjectId, objectiveId } = await props.params;
  const actor = await requireActor();
  const data = await or404(async () => {
    const access = await requireStudentAccess(actor, studentId, "VIEW");
    const [student, x] = await Promise.all([getStudent(access), explainObjectiveState(access, objectiveId)]);
    return { access, student, x };
  });
  const { access, student, x } = data;
  const canRecord = roleAllows(access.role, "RECORD_EVIDENCE");
  const lessonNumber = (id: string | null) => x.lessons.find((l) => l.id === id)?.lessonNumber;
  const decided = new Set(x.state?.decidedByEvidenceIds ?? []);
  const p = CURRENT_STATE_POLICY;
  const status = x.state?.status ?? "NOT_STARTED";

  return (
    <>
      <PageHeader
        eyebrow="Objetivo"
        title={x.objective.title}
        crumbs={[
          { href: `/students/${student.id}`, label: student.name },
          { href: `/students/${student.id}/subjects/${subjectId}`, label: "Trilha" },
          { href: `/students/${student.id}/subjects/${subjectId}/progress`, label: "Desenvolvimento" },
        ]}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs">{x.objective.code}</span> <StatusBadge status={status} /> <ConfidenceBadge level={x.state?.confidence ?? "LOW"} />
          </span>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[2fr_3fr]">
        <div className="space-y-6">
          <Section title="Por que este estágio?">
            {x.state ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-muted">Tentativas avaliadas</dt>
                <dd>{x.state.assessedAttempts}</dd>
                <dt className="text-muted">Acerto recente</dt>
                <dd>
                  {x.state.successRateRecent ? `${Math.round(Number(x.state.successRateRecent) * 100)}%` : "—"} (últimas {p.recentWindow})
                </dd>
                <dt className="text-muted">Aulas diferentes</dt>
                <dd>{x.state.distinctLessonCount}</dd>
                <dt className="text-muted">Corrigido por adulto ou sistema</dt>
                <dd>{x.state.hasHumanOrSystemGradedEvidence ? "sim" : "não (só IA; limite em “já consegue”)"}</dd>
                <dt className="text-muted">Já consegue desde</dt>
                <dd>{formatDateTime(x.state.proficientSince, student.timezone)}</dd>
                <dt className="text-muted">Última avaliação</dt>
                <dd>{formatDateTime(x.state.lastAssessedAt, student.timezone)}</dd>
                <dt className="text-muted">Regra</dt>
                <dd>{x.state.ruleVersion}</dd>
              </dl>
            ) : (
              <p className="text-sm text-muted">Nenhuma tentativa ainda. Por isso o estágio é &ldquo;{STATUS.NOT_STARTED.label}&rdquo;.</p>
            )}
            <Details summary={`Como os estágios são decididos (${p.version})`}>
              <p className="text-xs text-muted">
                &ldquo;{STATUS.DEVELOPING.label}&rdquo; pede {p.developingMinAttempts} tentativas com {p.developingMinRate * 100}% de acerto. &ldquo;{STATUS.PROFICIENT.label}&rdquo; pede {p.proficientMinAttempts} tentativas com {p.proficientMinRate * 100}% em {p.proficientMinLessons} aulas. &ldquo;{STATUS.MASTERED.label}&rdquo; pede
                uma conferência {p.masteryRetentionDays} dias depois e um desafio corrigido por adulto ou pelo sistema.
              </p>
            </Details>
          </Section>
          <Section title={`Histórico de estágios · ${x.transitions.length}`}>
            <ol className="space-y-2 text-sm">
              {x.transitions.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted">{formatDateTime(t.createdAt, student.timezone)}</span>
                  <StatusBadge status={t.fromStatus} short /> → <StatusBadge status={t.toStatus} short />
                  <span className="text-xs text-muted">
                    {t.decidedByEvidenceIds.length} tentativas · {t.ruleVersion}
                  </span>
                </li>
              ))}
              {x.transitions.length === 0 ? <li className="text-muted">Nenhuma mudança ainda.</li> : null}
            </ol>
          </Section>
        </div>
        <Section title={`Tentativas · ${x.evidence.length}`}>
          <p className="-mt-2 text-xs text-muted">As marcadas com ● decidiram o estágio atual. Correções e retratações entram como novas linhas e nunca apagam a original.</p>
          <ul className="space-y-2 text-sm">
            {x.evidence.map((e) => (
              <li key={e.id} className={`rounded-2xl px-4 py-3 ${decided.has(e.id) ? "bg-primary-soft" : "bg-surface-2"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex flex-wrap items-center gap-2">
                    {decided.has(e.id) ? <span aria-label="decidiu o estágio">●</span> : null}
                    <ToneChip tone={e.result === "CORRECT" ? "mint" : e.result === "PARTIALLY_CORRECT" ? "sun" : e.result === "INCORRECT" ? "peach" : "neutral"}>{RESULT[e.result]}</ToneChip>
                    <span className="text-xs text-muted">
                      {EVIDENCE_TYPE[e.evidenceType]} · corrigido por {GRADER[e.gradedBy] ?? e.gradedBy}
                      {e.supersedesEvidenceId ? " · substitui uma linha anterior" : ""}
                    </span>
                  </span>
                  <span className="text-xs text-muted">
                    {lessonNumber(e.lessonId) ? `Aula ${lessonNumber(e.lessonId)} · ` : ""}
                    {formatDateTime(e.occurredAt, student.timezone)}
                  </span>
                </div>
                <p className="mt-1">
                  {e.prompt}
                  {e.studentResponse ? <span className="text-muted"> → &ldquo;{e.studentResponse}&rdquo;</span> : null}
                  {e.errorTags.length ? <span className="text-muted"> · {e.errorTags.join(", ")}</span> : null}
                </p>
                {canRecord && e.evidenceType !== "CORRECTION" && e.evidenceType !== "RETRACTION" ? (
                  <details className="mt-1 text-xs">
                    <summary className="cursor-pointer text-muted">Esta linha está errada</summary>
                    <ActionForm action={correctEvidenceAction} submitLabel="Registrar correção" variant="secondary" size="sm" className="mt-2 space-y-2">
                      <input type="hidden" name="studentId" value={student.id} />
                      <input type="hidden" name="evidenceId" value={e.id} />
                      <input type="hidden" name="returnTo" value={`/students/${student.id}/subjects/${subjectId}/objectives/${objectiveId}`} />
                      <Field label="O que fazer">
                        <select name="mode" className="input" defaultValue="CORRECTION">
                          <option value="CORRECTION">Corrigir o resultado</option>
                          <option value="RETRACTION">Desconsiderar a tentativa</option>
                        </select>
                      </Field>
                      <Field label="Resultado correto (para correções)">
                        <select name="result" className="input" defaultValue={e.result}>
                          {EVIDENCE_RESULTS.map((r) => (
                            <option key={r} value={r}>
                              {RESULT[r]}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Motivo">
                        <input name="reason" className="input" required maxLength={500} />
                      </Field>
                    </ActionForm>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
          <Link href={`/students/${student.id}/subjects/${subjectId}`} className="btn btn-ghost btn-sm">
            ← Voltar para a trilha
          </Link>
        </Section>
      </div>
    </>
  );
}
