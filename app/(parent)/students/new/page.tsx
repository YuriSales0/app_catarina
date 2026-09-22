import { PageHeader, Field } from "@/components/ui";
import { ActionForm } from "@/components/forms/action-form";
import { createStudentAction } from "../actions";

export default function NewStudentPage() {
  return (
    <>
      <PageHeader title="Add a student" crumbs={[{ href: "/students", label: "Students" }]} subtitle="A given name is enough. Date of birth is optional and is used only to keep activities age-appropriate." />
      <div className="card max-w-lg">
        <ActionForm action={createStudentAction} submitLabel="Create student">
          <Field label="Given name">
            <input name="name" required maxLength={60} className="input" autoComplete="off" />
          </Field>
          <Field label="Date of birth" hint="Optional.">
            <input name="dateOfBirth" type="date" className="input" />
          </Field>
          <Field label="School year" hint="Optional, e.g. Year 2 or 2º ano.">
            <input name="schoolYear" className="input" maxLength={40} />
          </Field>
          <Field label="Timezone">
            <input name="timezone" className="input" defaultValue="Europe/Lisbon" />
          </Field>
        </ActionForm>
      </div>
    </>
  );
}
