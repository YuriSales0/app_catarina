import Link from "next/link";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireActor } from "@/lib/auth/session";
import { requireStudentAccess } from "@/lib/authorization/access";
import { or404 } from "@/lib/actions/page";
import { getSnapshot, listSnapshots } from "@/lib/snapshots/generate";
import { getStudent } from "@/lib/students/service";
import { PageHeader, Section, StatusBadge, formatDateTime, DemoBadge } from "@/components/ui";
import { NotFoundError } from "@/lib/authorization/errors";
import { SKILL, REASON } from "@/lib/copy/pt";

export const metadata = { title: "Retrato" };

const TRIGGER: Record<string, string> = { LESSON_COMPLETED: "fim de aula", MANUAL: "tirado por um adulto", SCHEDULED: "agendado", PRE_MIGRATION: "antes de mudar de nível" };
const TREND: Record<string, string> = { IMPROVING: "melhorando", STABLE: "estável", DECLINING: "caindo", INSUFFICIENT_DATA: "poucos dados", PERSISTENT: "persistente", WORSENING: "piorando" };

async function resolveSnapshotStudent(snapshotId: string) {
  const { db } = await import("@/lib/db/client");
  const { learningSnapshots } = await import("@/lib/db/schema");
  const row = await db().query.learningSnapshots.findFirst({ where: eq(learningSnapshots.id, snapshotId), columns: { studentId: true } });
  if (!row) throw new NotFoundError();
  return row.studentId;
}

export default async function SnapshotPage(props: { params: Promise<{ snapshotId: string }> }) {
  const { snapshotId } = await props.params;
  const actor = await requireActor();
  const { student, payload, generatedFrom, row, previous } = await or404(async () => {
    z.string().uuid().parse(snapshotId);
    const studentId = await resolveSnapshotStudent(snapshotId);
    const access = await requireStudentAccess(actor, studentId, "VIEW");
    const [student, snap, all] = await Promise.all([getStudent(access), getSnapshot(access, snapshotId), listSnapshots(access)]);
    const previous = all.find((x) => x.snapshotVersion < snap.row.snapshotVersion) ?? null;
    return { student, ...snap, previous };
  });
  return (
    <>
      <PageHeader
        eyebrow="Retrato do progresso"
        title={`${student.name} · retrato #${payload.snapshot_version}`}
        crumbs={[
          { href: `/students/${student.id}`, label: student.name },
          { href: `/students/${student.id}/snapshots`, label: "Retratos" },
        ]}
        subtitle={
          <>
            {formatDateTime(row.createdAt, student.timezone)} · {TRIGGER[generatedFrom.trigger] ?? generatedFrom.trigger} · {generatedFrom.evidence_count} tentativas · regras {generatedFrom.rule_version}, planejador {generatedFrom.engine_version} · hash {row.contentHash.slice(0, 16)}{" "}
            <DemoBadge show={student.isDemo} />
          </>
        }
        actions={
          previous ? (
            <Link href={`/snapshots/${previous.id}`} className="btn btn-secondary">
              ← Retrato anterior (#{previous.snapshotVersion})
            </Link>
          ) : null
        }
      />
      <p className="mb-6 text-xs text-muted">
        Observado: {payload.epistemic_key.observed.length} seções · Interpretado: {payload.epistemic_key.inferred.length} · Sugerido: {payload.epistemic_key.recommended.length}. O próprio documento diz o que é o quê, para continuar honesto quando exportado.
      </p>
      <div className="space-y-6">
        {payload.subjects.map((sub) => (
          <Section key={sub.subject.id} title={`${sub.subject.name} · ${sub.curriculum.name} v${sub.curriculum.version}`}>
            <p className="text-sm">
              <span className="eyebrow">observado</span> · {sub.progress.objectives_total} objetivos: {sub.progress.by_status.MASTERED} dominados, {sub.progress.by_status.PROFICIENT} já consegue, {sub.progress.by_status.DEVELOPING} ganhando confiança, {sub.progress.by_status.PRACTISING} praticando, {sub.progress.by_status.INTRODUCED} conheceu, {sub.progress.by_status.NOT_STARTED} a começar · {sub.progress.units_completed}/{sub.progress.units_total} unidades completas
            </p>
            <p className="text-sm">
              Últimos 30 dias: {sub.recent_evidence_summary.total_attempts} tentativas em {sub.recent_evidence_summary.distinct_objectives} objetivos ({sub.recent_evidence_summary.by_result.CORRECT} certas) · corrigidas por adulto {sub.recent_evidence_summary.by_grader.HUMAN}, sistema {sub.recent_evidence_summary.by_grader.SYSTEM}, IA {sub.recent_evidence_summary.by_grader.AI_PROVIDER}
            </p>
            {sub.current_objectives.length ? (
              <div>
                <h3 className="eyebrow mb-1">Objetivos em foco</h3>
                <ul className="text-sm">
                  {sub.current_objectives.map((o) => (
                    <li key={o.objective_id}>
                      {o.title} <StatusBadge status={o.status} short /> <span className="text-xs text-muted">{o.assessed_attempts} tentativas{o.success_rate_recent !== null ? `, ${Math.round(o.success_rate_recent * 100)}% recentes` : ""}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {sub.skill_states.length ? (
              <div>
                <h3 className="eyebrow mb-1">Habilidades (30 dias)</h3>
                <ul className="text-sm">
                  {sub.skill_states.map((k) => (
                    <li key={k.skill_id}>
                      {SKILL[k.name.toLowerCase()] ?? k.name}: {k.attempts_30d} tentativas{k.success_rate_30d !== null ? `, ${Math.round(k.success_rate_30d * 100)}%` : ""} · <span className="text-xs text-muted">tendência (interpretada): {TREND[k.trend] ?? k.trend}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {sub.recurring_difficulties.length ? (
              <div>
                <h3 className="eyebrow mb-1">Dificuldades que se repetem · interpretado</h3>
                <ul className="text-sm">
                  {sub.recurring_difficulties.map((d) => (
                    <li key={d.error_tag}>
                      {d.human_label}: {d.occurrences_30d} em 30 dias, {TREND[d.trend] ?? d.trend}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {sub.review_priorities.length ? (
              <div>
                <h3 className="eyebrow mb-1">Revisões pendentes</h3>
                <ul className="text-sm">
                  {sub.review_priorities.map((r) => (
                    <li key={r.objective_id}>
                      {r.title}: {r.days_overdue} dias de atraso
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {sub.recommended_next_objectives.length ? (
              <p className="text-sm">
                <span className="eyebrow">sugerido</span> · próximos: {sub.recommended_next_objectives.map((r) => `${r.title} (${REASON[r.reason] ?? r.reason.toLowerCase().replace(/_/g, " ")})`).join("; ")}
              </p>
            ) : null}
            {sub.recent_lessons.length ? (
              <div>
                <h3 className="eyebrow mb-1">Aulas recentes</h3>
                <ul className="text-sm">
                  {sub.recent_lessons.map((l) => (
                    <li key={l.lesson_id}>
                      <Link href={`/lessons/${l.lesson_id}`} className="hover:underline">
                        Aula {l.lesson_number}
                      </Link>
                      : {l.primary_objective.title}, {l.attempts} tentativas{l.success_rate !== null ? `, ${Math.round(l.success_rate * 100)}%` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Section>
        ))}
        {payload.subjects.length === 0 ? <p className="text-sm text-muted">Nenhuma trilha com currículo no momento deste retrato.</p> : null}
      </div>
    </>
  );
}
