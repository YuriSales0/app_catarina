import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { AIProvider } from "@/lib/ai/provider";
import type { Actor } from "@/lib/auth/session";
import { curriculumDraftRequestSchema, type CurriculumDraftRequest } from "@/schemas/ai-proposals";
import { parseCurriculumYaml } from "./parse";
import { writeAudit } from "@/lib/audit/write";
import { db } from "@/lib/db/client";
import type { DbOrTx } from "@/lib/db/create-db";
import { metric } from "@/lib/logging/logger";

export type DraftOutcome =
  | { ok: true; yaml: string; notes: string | null; validation: ReturnType<typeof parseCurriculumYaml> }
  | { ok: false; error: string; issues?: string[] };

/**
 * "Generate with AI" for the Curriculum Studio (decision D15). The provider
 * returns YAML; it is normalized (source AI_GENERATED, provenance recorded)
 * and then validated by the same checks as a hand-written file. Nothing is
 * imported here: the draft goes to the review screen.
 */
export async function generateCurriculumDraft(actor: Actor, provider: AIProvider, input: CurriculumDraftRequest, dbh: DbOrTx = db()): Promise<DraftOutcome> {
  const request = curriculumDraftRequestSchema.parse(input);
  const result = await provider.generateCurriculumDraft(request);
  await writeAudit(dbh, {
    actorUserId: actor.userId,
    actorType: "USER",
    action: "curriculum.ai_draft",
    resourceType: "curriculum_draft",
    result: "ALLOWED",
    requestId: actor.requestId,
    metadata: { provider: result.meta.provider, model: result.meta.model, ok: result.ok, error: result.ok ? null : result.error.kind },
  });
  if (!result.ok) {
    metric(result.error.kind === "INVALID_OUTPUT" ? "ai_proposal_rejected" : "ai_provider_error", { kind: result.error.kind, provider: result.meta.provider });
    return { ok: false, error: `The AI provider could not produce a draft (${result.error.kind.toLowerCase().replace("_", " ")}): ${result.error.message}`, issues: result.error.issues };
  }
  metric("ai_proposal_received", { kind: "curriculum_draft", provider: result.meta.provider });
  let doc: unknown;
  try {
    doc = parseYaml(result.value.yaml, { strict: true });
  } catch (err) {
    return { ok: false, error: "The draft is not valid YAML.", issues: [(err as Error).message] };
  }
  if (!doc || typeof doc !== "object") return { ok: false, error: "The draft is not a YAML mapping." };
  const normalized = {
    ...(doc as Record<string, unknown>),
    source: "AI_GENERATED",
    visibility: "PRIVATE",
    is_demo: false,
    provenance: {
      ...((doc as { provenance?: Record<string, unknown> }).provenance ?? {}),
      origin: "ai_draft",
      provider: result.meta.provider,
      model: result.meta.model ?? "",
      promptVersion: result.meta.promptVersion ?? "",
      requested_goal: request.goal.slice(0, 200),
    },
  };
  const yaml = stringifyYaml(normalized, { lineWidth: 0 });
  return { ok: true, yaml, notes: result.value.notes, validation: parseCurriculumYaml(yaml) };
}
