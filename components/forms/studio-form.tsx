"use client";

import { useActionState, useState } from "react";
import { previewCurriculumAction, importCurriculumAction, type StudioState } from "@/app/(parent)/curricula/actions";

export function StudioForm({ template }: { template: string }) {
  const [yaml, setYaml] = useState(template);
  const [previewState, previewAction, previewing] = useActionState<StudioState, FormData>(previewCurriculumAction, null);
  const [importState, importAction, importing] = useActionState<StudioState, FormData>(importCurriculumAction, null);
  const state = importState ?? previewState;

  return (
    <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
      <form className="space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Curriculum YAML</span>
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
            {previewing ? "Validating…" : "Validate"}
          </button>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="publish" /> Publish immediately
          </label>
          <button type="submit" formAction={importAction} disabled={importing} className="btn btn-primary">
            {importing ? "Saving…" : "Save curriculum"}
          </button>
        </div>
      </form>
      <aside className="space-y-3">
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
            <p className="font-medium">Valid.</p>
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
          <p className="font-medium text-foreground">What the checks enforce</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Every skill and error tag an objective uses is declared.</li>
            <li>Prerequisites point only to the same or an earlier unit.</li>
            <li>No prerequisite cycles.</li>
            <li>At most 12 objectives per unit.</li>
            <li>Published versions are frozen. Edits become a new version and the child&apos;s history follows each key.</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
