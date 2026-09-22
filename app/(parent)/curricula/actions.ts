"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import { importCurriculumForActor, previewCurriculumYaml, publishCurriculumVersion } from "@/lib/curriculum/service";
import { toActionError } from "@/lib/actions/result";

export type StudioPreview = { units: number; objectives: number; warnings: string[]; name: string; version: string; subject: string };
export type StudioState =
  | null
  | { ok: false; error: string; issues?: string[]; preview?: undefined }
  | { ok: true; message?: string; preview?: StudioPreview };

const yamlField = z.string().min(1, "Paste a curriculum in YAML.").max(400_000);

export async function previewCurriculumAction(_prev: StudioState, formData: FormData): Promise<StudioState> {
  await requireActor();
  try {
    const yaml = yamlField.parse(formData.get("yaml"));
    const outcome = previewCurriculumYaml(yaml);
    if (!outcome.ok) return { ok: false, error: "The curriculum is not valid yet.", issues: outcome.errors };
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
