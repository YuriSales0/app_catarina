import { ActionForm } from "@/components/forms/action-form";
import { Field } from "@/components/ui";
import { recordEvidenceAction } from "@/app/(parent)/lessons/actions";
import { EVIDENCE_RESULTS } from "@/lib/db/enums";

type Props = {
  studentId: string;
  lessonId?: string;
  activityId?: string;
  objectives: Array<{ id: string; title: string; errorTags: string[] }>;
  defaultObjectiveId?: string;
  vocabulary: Record<string, string>;
  allowType?: boolean;
  compact?: boolean;
};

/** One attempt, recorded honestly. Used inside a lesson and for paper practice outside one. */
export function EvidenceForm({ studentId, lessonId, activityId, objectives, defaultObjectiveId, vocabulary, allowType = true, compact = false }: Props) {
  const tagCandidates = defaultObjectiveId ? (objectives.find((o) => o.id === defaultObjectiveId)?.errorTags ?? []) : [];
  const tags = tagCandidates.length ? tagCandidates : Object.keys(vocabulary);
  return (
    <ActionForm action={recordEvidenceAction} submitLabel="Record attempt" variant="secondary" className={compact ? "space-y-2" : "space-y-3"}>
      <input type="hidden" name="studentId" value={studentId} />
      {lessonId ? <input type="hidden" name="lessonId" value={lessonId} /> : null}
      {activityId ? <input type="hidden" name="activityId" value={activityId} /> : null}
      {objectives.length === 1 ? (
        <input type="hidden" name="objectiveId" value={objectives[0].id} />
      ) : (
        <Field label="Objective">
          <select name="objectiveId" className="input" defaultValue={defaultObjectiveId ?? objectives[0]?.id} required>
            {objectives.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="What was asked">
        <input name="prompt" className="input" required maxLength={2000} placeholder="Say: I have a cat" />
      </Field>
      <Field label="What the child said or did">
        <input name="studentResponse" className="input" maxLength={4000} placeholder="I have cat" />
      </Field>
      <fieldset>
        <legend className="mb-1 block text-sm font-medium">Result</legend>
        <div className="flex flex-wrap gap-3 text-sm">
          {EVIDENCE_RESULTS.map((r) => (
            <label key={r} className="flex items-center gap-1">
              <input type="radio" name="result" value={r} required defaultChecked={r === "CORRECT"} /> {r.toLowerCase().replace("_", " ")}
            </label>
          ))}
        </div>
      </fieldset>
      {tags.length ? (
        <fieldset>
          <legend className="mb-1 block text-sm font-medium">Errors noticed (optional)</legend>
          <div className="flex flex-wrap gap-2 text-xs">
            {tags.map((t) => (
              <label key={t} className="flex items-center gap-1 rounded-md border border-border px-2 py-1" title={vocabulary[t]}>
                <input type="checkbox" name="errorTags" value={t} /> {vocabulary[t] ?? t}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Correction given (optional)">
          <input name="correction" className="input" maxLength={2000} />
        </Field>
        {allowType ? (
          <Field label="Type">
            <select name="evidenceType" className="input" defaultValue="PRACTICE">
              <option value="PRACTICE">practice</option>
              <option value="ASSESSMENT">assessment (no help given)</option>
              <option value="OBSERVATION">observation</option>
              <option value="PARENT_REPORT">parent report (outside a lesson)</option>
            </select>
          </Field>
        ) : null}
      </div>
      {!lessonId ? (
        <Field label="When it happened" hint="Leave empty for now.">
          <input name="occurredAt" type="datetime-local" className="input" />
        </Field>
      ) : null}
    </ActionForm>
  );
}
