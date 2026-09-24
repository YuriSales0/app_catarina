"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import { importCurriculumForActor, previewCurriculumYaml, publishCurriculumVersion } from "@/lib/curriculum/service";
import { generateCurriculumDraft } from "@/lib/curriculum/ai-draft";
import { getAIProvider } from "@/lib/ai";
import { toActionError } from "@/lib/actions/result";

export type StudioPreview = { units: number; objectives: number; warnings: string[]; name: string; version: string; subject: string };
export type StudioState =
  | null
  | { ok: false; error: string; issues?: string[]; preview?: undefined; yaml?: undefined }
  | { ok: true; message?: string; preview?: StudioPreview; yaml?: string; notes?: string | null };

const draftRequest = z.object({
  subject: z.string().trim().min(1).max(60),
  goal: z.string().trim().min(1).max(2000),
  age_years: z.coerce.number().int().min(2).max(120).nullable().default(null),
  instruction_language: z.string().trim().min(2).max(12).default("pt-BR"),
  target_language: z.string().trim().min(2).max(12).nullable().default(null),
  units_wanted: z.coerce.number().int().min(1).max(12).default(4),
});

export async function generateDraftAction(_prev: StudioState, formData: FormData): Promise<StudioState> {
  const actor = await requireActor();
  try {
    const raw = Object.fromEntries([...formData.entries()].filter(([k]) => !k.startsWith("$")).map(([k, v]) => [k, v === "" ? null : v]));
    const request = draftRequest.parse({ ...raw, age_years: raw.age_years ?? null, target_language: raw.target_language ?? null });
    const provider = await getAIProvider();
    const outcome = await generateCurriculumDraft(actor, provider, { ...request, source_material: null });
    if (!outcome.ok) return { ok: false, error: outcome.error, issues: outcome.issues };
    const v = outcome.validation;
    return {
      ok: true,
      yaml: outcome.yaml,
      notes: outcome.notes,
      message: v.ok ? "Rascunho gerado e válido. Revise cada objetivo antes de publicar." : "Rascunho gerado, mas ainda inválido; corrija os pontos abaixo.",
      preview: v.ok ? { units: v.value.units.length, objectives: v.value.objectives.length, warnings: v.value.warnings, name: v.value.file.name, version: v.value.file.version, subject: v.value.file.subject } : undefined,
      ...(v.ok ? {} : { issues: v.errors }),
    } as StudioState;
  } catch (err) {
    return toActionError(err) as StudioState;
  }
}

const yamlField = z.string().min(1, "Paste a curriculum in YAML.").max(400_000);

export async function previewCurriculumAction(_prev: StudioState, formData: FormData): Promise<StudioState> {
  await requireActor();
  try {
    const yaml = yamlField.parse(formData.get("yaml"));
    const outcome = previewCurriculumYaml(yaml);
    if (!outcome.ok) return { ok: false, error: "O currículo ainda não é válido.", issues: outcome.errors };
    const { file, units, objectives, warnings } = outcome.value;
    return { ok: true, preview: { units: units.length, objectives: objectives.length, warnings, name: file.name, version: file.version, subject: file.subject } };
  } catch (err) {
    return toActionError(err) as StudioState;
  }
}

export async function importCurriculumAction(_prev: StudioState, formData: FormData): Promise<StudioState> {
  const actor = await requireActor();
  let versionId: string;
  try {
    const yaml = yamlField.parse(formData.get("yaml"));
    const publish = formData.get("publish") === "on";
    const result = await importCurriculumForActor(actor, { yaml, publish });
    versionId = result.curriculumVersionId;
  } catch (err) {
    return toActionError(err) as StudioState;
  }
  revalidatePath("/curricula");
  redirect(`/curricula/${versionId}`);
}

export async function publishVersionAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const versionId = z.string().uuid().parse(formData.get("versionId"));
  await publishCurriculumVersion(actor, versionId);
  revalidatePath(`/curricula/${versionId}`);
  revalidatePath("/curricula");
}
