"use client";

import { useActionState, useState } from "react";
import { previewCurriculumAction, importCurriculumAction, generateDraftAction, type StudioState } from "@/app/(parent)/curricula/actions";

export function StudioForm({ template, aiEnabled }: { template: string; aiEnabled: boolean }) {
  const [yaml, setYaml] = useState(template);
  const [previewState, previewAction, previewing] = useActionState<StudioState, FormData>(previewCurriculumAction, null);
  const [importState, importAction, importing] = useActionState<StudioState, FormData>(importCurriculumAction, null);
  const [draftState, draftAction, drafting] = useActionState<StudioState, FormData>(generateDraftAction, null);
  const state = importState ?? draftState ?? previewState;
  // When a new draft arrives, load it into the editor once (state derived from props pattern).
  const [appliedDraft, setAppliedDraft] = useState<string | null>(null);
  if (draftState && draftState.ok && draftState.yaml && draftState.yaml !== appliedDraft) {
    setAppliedDraft(draftState.yaml);
    setYaml(draftState.yaml);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
      <form className="space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block font-bold">YAML do currículo</span>
          <textarea
            name="yaml"
            value={yaml}
            onChange={(e) => setYaml(e.target.value)}
            rows={28}
            spellCheck={false}
            className="input font-mono text-xs"
            aria-describedby="yaml-help"
          />
        </label>
        <p id="yaml-help" className="text-xs text-muted">
          Keys such as EN.U1.HAVE are permanent identities: renaming a title later keeps the child&apos;s history attached.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" formAction={previewAction} disabled={previewing} className="btn btn-secondary">
            {previewing ? "Validando…" : "Validar"}
          </button>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="publish" /> Publicar agora
          </label>
          <button type="submit" formAction={importAction} disabled={importing} className="btn btn-primary">
            {importing ? "Salvando…" : "Salvar currículo"}
          </button>
        </div>
      </form>
      <aside className="space-y-3">
        <form action={draftAction} className="card space-y-2">
          <p className="text-sm font-bold">Gerar um rascunho com IA</p>
          <p className="text-xs text-muted">{aiEnabled ? "O rascunho aparece no editor e passa pelas mesmas verificações de um arquivo colado. Você revisa antes de publicar." : "Nenhum provedor de IA configurado (AI_PROVIDER=null). Cole ou escreva o YAML."}</p>
          <input name="subject" className="input" placeholder="Matéria (slug), ex.: science" required maxLength={60} />
          <textarea name="goal" className="input" rows={3} placeholder="O que a criança deve aprender? Ex.: o sistema solar para 9 anos, em português" required maxLength={2000} />
          <div className="grid grid-cols-3 gap-2">
            <input name="age_years" type="number" min={2} max={120} className="input" placeholder="Age" />
            <input name="instruction_language" className="input" defaultValue="pt-BR" placeholder="Idioma das instruções" />
            <input name="target_language" className="input" placeholder="Idioma-alvo (ex.: en)" />
          </div>
          <input name="units_wanted" type="number" min={1} max={12} defaultValue={4} className="input" aria-label="Quantidade de unidades" />
          <button type="submit" disabled={!aiEnabled || drafting} className="btn btn-secondary">
            {drafting ? "Gerando…" : "Gerar rascunho"}
          </button>
          {draftState && draftState.ok && draftState.notes ? <p className="text-xs text-muted">Assumptions: {draftState.notes}</p> : null}
        </form>
        {state && !state.ok ? (
          <div role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm">
            <p className="font-medium">{state.error}</p>
            {state.issues?.length ? (
              <ul className="mt-2 list-disc pl-5 text-xs">
                {state.issues.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        {state && state.ok && "preview" in state && state.preview ? (
          <div role="status" className="rounded-md border border-success/40 bg-success/10 p-3 text-sm">
            <p className="font-bold">Válido.</p>
            <p>
              {state.preview.name} v{state.preview.version} for {state.preview.subject}: {state.preview.units} units, {state.preview.objectives} objectives.
            </p>
            {state.preview.warnings.length ? (
              <ul className="mt-2 list-disc pl-5 text-xs">
                {state.preview.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        <div className="card text-sm text-muted">
          <p className="font-bold text-foreground">O que as verificações garantem</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Toda habilidade e todo tipo de erro usados por um objetivo estão declarados.</li>
            <li>Pré-requisitos apontam só para a mesma unidade ou uma anterior.</li>
            <li>Não há ciclos de pré-requisitos.</li>
            <li>No máximo 12 objetivos por unidade.</li>
            <li>Versões publicadas não mudam. Edições viram uma nova versão, e o histórico da criança acompanha cada chave.</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
