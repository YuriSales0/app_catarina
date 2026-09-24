import { ActionForm } from "@/components/forms/action-form";
import { Field } from "@/components/ui";
import { recordEvidenceAction } from "@/app/(parent)/lessons/actions";
import { EVIDENCE_RESULTS } from "@/lib/db/enums";
import { RESULT, EVIDENCE_TYPE } from "@/lib/copy/pt";

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
    <ActionForm action={recordEvidenceAction} submitLabel="Registrar tentativa" variant="secondary" className={compact ? "space-y-2" : "space-y-3"}>
      <input type="hidden" name="studentId" value={studentId} />
      {lessonId ? <input type="hidden" name="lessonId" value={lessonId} /> : null}
      {activityId ? <input type="hidden" name="activityId" value={activityId} /> : null}
      {objectives.length === 1 ? (
        <input type="hidden" name="objectiveId" value={objectives[0].id} />
      ) : (
        <Field label="Objetivo">
          <select name="objectiveId" className="input" defaultValue={defaultObjectiveId ?? objectives[0]?.id} required>
            {objectives.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="O que foi pedido">
        <input name="prompt" className="input" required maxLength={2000} placeholder="Ex.: Diga: I have a cat" />
      </Field>
      <Field label="O que a criança disse ou fez">
        <input name="studentResponse" className="input" maxLength={4000} placeholder="I have cat" />
      </Field>
      <fieldset>
        <legend className="mb-1.5 block text-sm font-bold">Resultado</legend>
        <div className="flex flex-wrap gap-2 text-sm">
          {EVIDENCE_RESULTS.map((r) => (
            <label key={r} className="choice flex items-center gap-2 rounded-full px-3 py-1.5">
              <input type="radio" name="result" value={r} required defaultChecked={r === "CORRECT"} className="accent-primary" /> {RESULT[r]}
            </label>
          ))}
        </div>
      </fieldset>
      {tags.length ? (
        <fieldset>
          <legend className="mb-1.5 block text-sm font-bold">Erros percebidos (opcional)</legend>
          <div className="flex flex-wrap gap-2 text-xs">
            {tags.map((t) => (
              <label key={t} className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1" title={vocabulary[t]}>
                <input type="checkbox" name="errorTags" value={t} /> {vocabulary[t] ?? t}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Correção dada (opcional)">
          <input name="correction" className="input" maxLength={2000} />
        </Field>
        {allowType ? (
          <Field label="Tipo">
            <select name="evidenceType" className="input" defaultValue="PRACTICE">
              {(["PRACTICE", "ASSESSMENT", "OBSERVATION", "PARENT_REPORT"] as const).map((k) => (
                <option key={k} value={k}>
                  {EVIDENCE_TYPE[k]}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
      </div>
      {!lessonId ? (
        <Field label="Quando aconteceu" hint="Deixe vazio para agora.">
          <input name="occurredAt" type="datetime-local" className="input" />
        </Field>
      ) : null}
    </ActionForm>
  );
}
