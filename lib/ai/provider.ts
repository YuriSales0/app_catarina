import type { ContextPack } from "@/schemas/context-pack";
import type { ActivityProposal, EvaluationProposal, ExplanationProposal, ReportNarrativeProposal, CurriculumDraftRequest, CurriculumDraftProposal } from "@/schemas/ai-proposals";

/**
 * The AI seam (decision D14). Providers return proposals, never writes, and
 * hold no database handle: this module's lint boundary forbids importing
 * lib/db or the learning engine. Failure is an ordinary value.
 */
export type ProviderError = {
  kind: "NOT_CONFIGURED" | "TIMEOUT" | "RATE_LIMITED" | "INVALID_OUTPUT" | "UPSTREAM" | "REFUSED";
  message: string;
  raw?: string;
  issues?: string[];
};

export type Result<T> = { ok: true; value: T; meta: ProviderMeta } | { ok: false; error: ProviderError; meta: ProviderMeta };
export type ProviderMeta = { provider: string; model: string | null; promptVersion: string | null; latencyMs: number; packId: string | null };

export type ResponseItem = { activity_ref: number; prompt: string; expected_response: string | null; accept_also: string[]; student_response: string; objective_ref: string };
export type ExplanationRequest = { objective_ref: string; question: string | null };

export interface AIProvider {
  readonly id: string;
  generateLessonActivity(pack: ContextPack, activity: ContextPack["lesson_plan"]["activities"][number]): Promise<Result<ActivityProposal>>;
  evaluateResponse(pack: ContextPack, item: ResponseItem): Promise<Result<EvaluationProposal>>;
  generateExplanation(pack: ContextPack, request: ExplanationRequest): Promise<Result<ExplanationProposal>>;
  generateLessonReport(pack: ContextPack, observed: unknown): Promise<Result<ReportNarrativeProposal>>;
  generateCurriculumDraft(request: CurriculumDraftRequest): Promise<Result<CurriculumDraftProposal>>;
}

const meta = (provider: string, packId: string | null): ProviderMeta => ({ provider, model: null, promptVersion: null, latencyMs: 0, packId });

/** The default. Keeps "the core works without an AI API" true by construction. */
export class NullAIProvider implements AIProvider {
  readonly id = "null";
  private notConfigured<T>(packId: string | null): Result<T> {
    return { ok: false, error: { kind: "NOT_CONFIGURED", message: "No AI provider is configured (AI_PROVIDER=null)." }, meta: meta(this.id, packId) };
  }
  async generateLessonActivity(pack: ContextPack): Promise<Result<ActivityProposal>> {
    return this.notConfigured(pack.pack_id);
  }
  async evaluateResponse(pack: ContextPack): Promise<Result<EvaluationProposal>> {
    return this.notConfigured(pack.pack_id);
  }
  async generateExplanation(pack: ContextPack): Promise<Result<ExplanationProposal>> {
    return this.notConfigured(pack.pack_id);
  }
  async generateLessonReport(pack: ContextPack): Promise<Result<ReportNarrativeProposal>> {
    return this.notConfigured(pack.pack_id);
  }
  async generateCurriculumDraft(): Promise<Result<CurriculumDraftProposal>> {
    return this.notConfigured(null);
  }
}
