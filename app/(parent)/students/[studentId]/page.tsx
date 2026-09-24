import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { requireStudentAccess } from "@/lib/authorization/access";
import { or404 } from "@/lib/actions/page";
import { getStudent, listGuardians, listEnrolments, getAiProcessingConsent } from "@/lib/students/service";
import { listSubjects, listPublishedVersionsForSubject } from "@/lib/curriculum/service";
import { PageHeader, DemoBadge, DemoNotice, Field, Section, Details, ageYears, formatDate } from "@/components/ui";
import { ActionForm } from "@/components/forms/action-form";
import { AvatarPicker, LevelPicker, MinutesPicker } from "@/components/forms/pickers";
import { Avatar, avatarOf } from "@/components/brand/avatar";
import { describeLevel, suggestedLevelKey } from "@/lib/curriculum/levels";
import { TONE, ROLE } from "@/lib/copy/pt";
import { updateStudentAction, addGuardianAction, revokeGuardianAction, enrolAction, deleteStudentAction, setAiConsentAction } from "../actions";
import { GUARDIAN_ROLES } from "@/lib/db/enums";

export default async function StudentPage(props: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await props.params;
  const actor = await requireActor();
  const access = await or404(() => requireStudentAccess(actor, studentId, "VIEW"));
  const [student, guardians, enrolments, subjects, aiConsent] = await Promise.all([
    getStudent(access),
    listGuardians(access),
    listEnrolments(access),
    listSubjects(),
    getAiProcessingConsent(access),
  ]);
  const versions = (await Promise.all(subjects.map(async (sub) => (await listPublishedVersionsForSubject(actor, sub.id)).map((v) => ({ ...v, subjectName: sub.name }))))).flat();
  const canEdit = access.role === "OWNER" || access.role === "GUARDIAN";
  const isOwner = access.role === "OWNER";
  const age = ageYears(student.dateOfBirth);
  const avatar = avatarOf(student);

  return (
    <>
      <PageHeader
        leading={<Avatar choice={avatar} size="lg" />}
        title={student.name}
        crumbs={[{ href: "/students", label: "Crianças" }]}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {age !== null ? `${age} anos` : "Idade não informada"} · fuso {student.timezone} <DemoBadge show={student.isDemo} />
          </span>
        }
      />
      <DemoNotice show={student.isDemo} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          title="Trilhas"
          aside={
            <Link href={`/students/${student.id}/snapshots`} className="btn btn-ghost btn-sm">
              📸 Retratos
            </Link>
          }
        >
          {enrolments.length === 0 ? <p className="text-sm text-muted">Nenhuma trilha ainda. Escolha um nível abaixo.</p> : null}
          <ul className="space-y-3">
            {enrolments.map((e) => {
              const level = e.curriculumName ? describeLevel(e.curriculumName) : null;
              return (
                <li key={e.id}>
                  <Link href={`/students/${student.id}/subjects/${e.subjectId}`} className="flex items-center gap-4 rounded-2xl bg-surface-2 p-4 transition hover:bg-primary-soft">
                    <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl ${level ? TONE[level.tone].bg : "bg-surface"}`} aria-hidden>
                      {level?.emoji ?? "📘"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2 font-bold">
                        {e.subjectName}
                        {level ? <span className="text-muted">· {level.title}</span> : null}
                        {level?.cefr ? <span className={`badge border-transparent ${TONE[level.tone].bg} ${TONE[level.tone].ink}`}>{level.cefr}</span> : null}
                        <DemoBadge show={Boolean(e.curriculumIsDemo)} />
                      </span>
                      <span className="block text-xs text-muted">
                        {e.curriculumName ?? "Nível não escolhido"} · aulas de {e.plannedLessonMinutes} min{e.active ? "" : " · pausada"}
                      </span>
                    </span>
                    <span aria-hidden className="text-muted">
                      ›
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {canEdit ? (
            <Details summary={enrolments.length ? "Mudar de nível ou começar outra trilha" : "Escolher nível"}>
              <ActionForm action={enrolAction} submitLabel="Salvar trilha" variant="primary" className="space-y-5">
                <input type="hidden" name="studentId" value={student.id} />
                <LevelPicker
                  options={versions.map((v) => ({ versionId: v.versionId, curriculumName: v.curriculumName, version: v.version, isDemo: v.isDemo }))}
                  suggested={suggestedLevelKey(age)}
                  current={enrolments[0]?.curriculumVersionId ?? null}
                />
                <MinutesPicker value={enrolments[0]?.plannedLessonMinutes ?? 20} />
                <Field label="Objetivo da família" hint="Opcional, com suas palavras.">
                  <input name="goal" className="input" maxLength={500} defaultValue={enrolments[0]?.goal ?? ""} />
                </Field>
                <p className="text-xs text-muted">Ao mudar de nível, guardamos um retrato do progresso antes da troca.</p>
              </ActionForm>
            </Details>
          ) : null}
        </Section>

        <Section title="Perfil">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted">Nascimento</dt>
            <dd>{formatDate(student.dateOfBirth)}</dd>
            <dt className="text-muted">Ano escolar</dt>
            <dd>{student.schoolYear ?? "—"}</dd>
            <dt className="text-muted">Sistema de ensino</dt>
            <dd>{student.educationSystem ?? "—"}</dd>
            <dt className="text-muted">Cadastro</dt>
            <dd>{formatDate(student.createdAt)}</dd>
          </dl>
          {canEdit ? (
            <Details summary="Editar perfil e avatar">
              <ActionForm action={updateStudentAction} submitLabel="Salvar" variant="primary" className="space-y-4">
                <input type="hidden" name="studentId" value={student.id} />
                <Field label="Primeiro nome">
                  <input name="name" defaultValue={student.name} className="input" required maxLength={60} />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Data de nascimento">
                    <input name="dateOfBirth" type="date" defaultValue={student.dateOfBirth ?? ""} className="input" />
                  </Field>
                  <Field label="Ano escolar">
                    <input name="schoolYear" defaultValue={student.schoolYear ?? ""} className="input" placeholder="Ex.: 2º ano" />
                  </Field>
                  <Field label="Sistema de ensino">
                    <input name="educationSystem" defaultValue={student.educationSystem ?? ""} className="input" />
                  </Field>
                  <Field label="Fuso horário">
                    <input name="timezone" defaultValue={student.timezone} className="input" />
                  </Field>
                </div>
                <AvatarPicker value={avatar} />
              </ActionForm>
            </Details>
          ) : null}
        </Section>

        <Section title="Adultos com acesso">
          <ul className="space-y-2 text-sm">
            {guardians.map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-2 rounded-2xl bg-surface-2 px-4 py-2.5">
                <span className="min-w-0">
                  <span className="font-bold">{g.name ?? g.email}</span> <span className="text-muted">({g.email})</span>
                  <span className="block text-xs text-muted">{ROLE[g.role]}</span>
                </span>
                {isOwner && g.role !== "OWNER" ? (
                  <form action={revokeGuardianAction}>
                    <input type="hidden" name="studentId" value={student.id} />
                    <input type="hidden" name="guardianRowId" value={g.id} />
                    <button type="submit" className="btn btn-danger btn-sm">
                      Remover acesso
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
          {isOwner ? (
            <Details summary="Dar acesso a outro adulto">
              <ActionForm action={addGuardianAction} submitLabel="Dar acesso" variant="primary">
                <input type="hidden" name="studentId" value={student.id} />
                <Field label="E-mail da pessoa" hint="Ela precisa ter entrado no Learning OS pelo menos uma vez.">
                  <input name="email" type="email" required className="input" />
                </Field>
                <Field label="Papel">
                  <select name="role" className="input" defaultValue="GUARDIAN">
                    {GUARDIAN_ROLES.filter((r) => r !== "OWNER").map((r) => (
                      <option key={r} value={r}>
                        {ROLE[r]}
                      </option>
                    ))}
                  </select>
                </Field>
              </ActionForm>
            </Details>
          ) : null}
        </Section>

        {isOwner ? (
          <Section title="IA nas aulas" aside={<span className={`badge border-transparent ${aiConsent ? "bg-mint text-mint-ink" : "bg-surface-2 text-muted"}`}>{aiConsent ? "ligada" : "desligada"}</span>}>
            <p className="text-sm text-muted">
              Com a IA ligada, um provedor de IA pode receber o primeiro nome, a idade, o objetivo da aula e as tentativas recentes de {student.name} para preparar atividades e corrigir respostas abertas. Ela nunca decide o que foi aprendido nem muda o progresso.
            </p>
            <form action={setAiConsentAction}>
              <input type="hidden" name="studentId" value={student.id} />
              <input type="hidden" name="enabled" value={aiConsent ? "false" : "true"} />
              <button type="submit" className={`btn ${aiConsent ? "btn-secondary" : "btn-primary"}`}>
                {aiConsent ? "Desligar a IA" : "Ligar a IA"}
              </button>
            </form>
          </Section>
        ) : null}
        {isOwner ? (
          <Section title="Dados">
            <p className="text-sm text-muted">Exporte tudo o que existe sobre {student.name}, ou remova o perfil. A remoção esconde a criança na hora; os registros são apagados depois de um período de carência.</p>
            <div className="flex flex-wrap gap-2">
              <Link href={`/students/${student.id}/export`} className="btn btn-secondary">
                Exportar dados (JSON)
              </Link>
            </div>
            <Details summary="Remover criança">
              <p className="mb-3 text-sm">Tem certeza? {student.name} deixa de aparecer para todos os adultos.</p>
              <form action={deleteStudentAction}>
                <input type="hidden" name="studentId" value={student.id} />
                <button type="submit" className="btn btn-danger">
                  Sim, remover {student.name}
                </button>
              </form>
            </Details>
          </Section>
        ) : null}
      </div>
    </>
  );
}
