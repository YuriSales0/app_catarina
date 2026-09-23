import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { requireStudentAccess } from "@/lib/authorization/access";
import { or404 } from "@/lib/actions/page";
import { getStudent, listGuardians, listEnrolments } from "@/lib/students/service";
import { listSubjects, listPublishedVersionsForSubject } from "@/lib/curriculum/service";
import { PageHeader, DemoBadge, DemoNotice, Field, Section, ageYears, formatDate } from "@/components/ui";
import { ActionForm } from "@/components/forms/action-form";
import { updateStudentAction, addGuardianAction, revokeGuardianAction, enrolAction, deleteStudentAction } from "../actions";
import { GUARDIAN_ROLES } from "@/lib/db/enums";

export default async function StudentPage(props: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await props.params;
  const actor = await requireActor();
  const access = await or404(() => requireStudentAccess(actor, studentId, "VIEW"));
  const [student, guardians, enrolments, subjects] = await Promise.all([
    getStudent(access),
    listGuardians(access),
    listEnrolments(access),
    listSubjects(),
  ]);
  const versionsBySubject = new Map<string, Awaited<ReturnType<typeof listPublishedVersionsForSubject>>>();
  for (const sub of subjects) versionsBySubject.set(sub.id, await listPublishedVersionsForSubject(actor, sub.id));
  const canEdit = access.role === "OWNER" || access.role === "GUARDIAN";
  const isOwner = access.role === "OWNER";
  const age = ageYears(student.dateOfBirth);

  return (
    <>
      <PageHeader
        title={student.name}
        crumbs={[{ href: "/students", label: "Students" }]}
        subtitle={
          <>
            {age !== null ? `Age ${age}` : "Age not set"} · timezone {student.timezone} <DemoBadge show={student.isDemo} />
          </>
        }
      />
      <DemoNotice show={student.isDemo} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          title="Subjects"
          aside={
            <Link href={`/students/${student.id}/snapshots`} className="text-sm underline">
              Snapshots
            </Link>
          }
        >
          {enrolments.length === 0 ? <p className="text-sm text-muted">Not enrolled in any subject yet.</p> : null}
          <ul className="space-y-2">
            {enrolments.map((e) => (
              <li key={e.id} className="rounded-md border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/students/${student.id}/subjects/${e.subjectId}`} className="font-medium hover:underline">
                    {e.subjectName}
                  </Link>
                  <span className="text-xs text-muted">{e.active ? "active" : "paused"}</span>
                </div>
                <p className="text-sm text-muted">
                  {e.curriculumName ? (
                    <>
                      {e.curriculumName} v{e.curriculumVersion} <DemoBadge show={Boolean(e.curriculumIsDemo)} />
                    </>
                  ) : (
                    "No curriculum chosen"
                  )}
                  {" · "}taught in {e.instructionLanguage}
                  {e.targetLanguage ? `, target ${e.targetLanguage}` : ""} · {e.plannedLessonMinutes} min lessons
                </p>
              </li>
            ))}
          </ul>
          {canEdit ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-sm font-medium">Enrol in a subject or change curriculum</summary>
              <div className="mt-3">
                <ActionForm action={enrolAction} submitLabel="Save enrolment" variant="secondary">
                  <input type="hidden" name="studentId" value={student.id} />
                  <Field label="Subject">
                    <select name="subjectId" className="input" required defaultValue="">
                      <option value="" disabled>
                        Choose a subject
                      </option>
                      {subjects.map((sub) => (
                        <option key={sub.id} value={sub.id}>
                          {sub.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Published curriculum" hint="The list shows every published curriculum; pick one for the subject chosen above.">
                    <select name="curriculumVersionId" className="input" required defaultValue="">
                      <option value="" disabled>
                        Choose a curriculum
                      </option>
                      {subjects.flatMap((sub) =>
                        (versionsBySubject.get(sub.id) ?? []).map((v) => (
                          <option key={v.versionId} value={v.versionId}>
                            {sub.name}: {v.curriculumName} v{v.version}
                            {v.isDemo ? " (DEMO)" : ""}
                          </option>
                        )),
                      )}
                    </select>
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Instruction language">
                      <input name="instructionLanguage" className="input" defaultValue="pt-BR" />
                    </Field>
                    <Field label="Target language" hint="Language subjects only, e.g. en.">
                      <input name="targetLanguage" className="input" placeholder="en" />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Lesson length (minutes)">
                      <input name="plannedLessonMinutes" type="number" min={5} max={90} defaultValue={20} className="input" />
                    </Field>
                    <Field label="Target level" hint="Optional, e.g. Pre A1.">
                      <input name="targetLevel" className="input" />
                    </Field>
                  </div>
                  <Field label="Goal" hint="Optional, in your own words.">
                    <input name="goal" className="input" maxLength={500} />
                  </Field>
                </ActionForm>
              </div>
            </details>
          ) : null}
        </Section>

        <Section title="Profile">
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted">Date of birth</dt>
            <dd>{formatDate(student.dateOfBirth)}</dd>
            <dt className="text-muted">School year</dt>
            <dd>{student.schoolYear ?? "—"}</dd>
            <dt className="text-muted">Education system</dt>
            <dd>{student.educationSystem ?? "—"}</dd>
            <dt className="text-muted">Record created</dt>
            <dd>{formatDate(student.createdAt)}</dd>
          </dl>
          {canEdit ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-sm font-medium">Edit profile</summary>
              <div className="mt-3">
                <ActionForm action={updateStudentAction} submitLabel="Save" variant="secondary">
                  <input type="hidden" name="studentId" value={student.id} />
                  <Field label="Given name">
                    <input name="name" defaultValue={student.name} className="input" required maxLength={60} />
                  </Field>
                  <Field label="Date of birth">
                    <input name="dateOfBirth" type="date" defaultValue={student.dateOfBirth ?? ""} className="input" />
                  </Field>
                  <Field label="School year">
                    <input name="schoolYear" defaultValue={student.schoolYear ?? ""} className="input" />
                  </Field>
                  <Field label="Education system">
                    <input name="educationSystem" defaultValue={student.educationSystem ?? ""} className="input" />
                  </Field>
                  <Field label="Timezone">
                    <input name="timezone" defaultValue={student.timezone} className="input" />
                  </Field>
                </ActionForm>
              </div>
            </details>
          ) : null}
        </Section>

        <Section title="Guardians">
          <ul className="space-y-2 text-sm">
            {guardians.map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                <span>
                  {g.name ?? g.email} <span className="text-muted">({g.email})</span> · {g.role.toLowerCase()}
                </span>
                {isOwner && g.role !== "OWNER" ? (
                  <form action={revokeGuardianAction}>
                    <input type="hidden" name="studentId" value={student.id} />
                    <input type="hidden" name="guardianRowId" value={g.id} />
                    <button type="submit" className="btn btn-danger px-2 py-1 text-xs">
                      Revoke
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
          {isOwner ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-sm font-medium">Give another adult access</summary>
              <div className="mt-3">
                <ActionForm action={addGuardianAction} submitLabel="Grant access" variant="secondary">
                  <input type="hidden" name="studentId" value={student.id} />
                  <Field label="Their email" hint="They must have signed in to Learning OS at least once.">
                    <input name="email" type="email" required className="input" />
                  </Field>
                  <Field label="Role">
                    <select name="role" className="input" defaultValue="GUARDIAN">
                      {GUARDIAN_ROLES.filter((r) => r !== "OWNER").map((r) => (
                        <option key={r} value={r}>
                          {r.toLowerCase()}
                        </option>
                      ))}
                    </select>
                  </Field>
                </ActionForm>
              </div>
            </details>
          ) : null}
        </Section>

        {isOwner ? (
          <Section title="Data">
            <p className="text-sm text-muted">Export every record about this child, or remove the profile. Removal hides the child immediately; records are purged after a grace period.</p>
            <div className="flex flex-wrap gap-2">
              <Link href={`/students/${student.id}/export`} className="btn btn-secondary">
                Export data (JSON)
              </Link>
              <form action={deleteStudentAction}>
                <input type="hidden" name="studentId" value={student.id} />
                <button type="submit" className="btn btn-danger">
                  Remove student
                </button>
              </form>
            </div>
          </Section>
        ) : null}
      </div>
    </>
  );
}
