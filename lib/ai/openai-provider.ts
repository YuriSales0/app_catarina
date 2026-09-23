import type { AIProvider, Result } from "./provider";
import type { ContextPack } from "@/schemas/context-pack";
import type { ActivityProposal, EvaluationProposal, ExplanationProposal, ReportNarrativeProposal, CurriculumDraftRequest, CurriculumDraftProposal } from "@/schemas/ai-proposals";

/** Placeholder until Phase 12 wires the adapter. Present so the factory compiles. */
export class OpenAIProvider implements AIProvider {
  readonly id = "openai";
  constructor(_config: { apiKey: string; baseUrl: string; model: string }) {
    void _config;
  }
  private pending<T>(packId: string | null): Result<T> {
    return { ok: false, error: { kind: "NOT_CONFIGURED", message: "OpenAI adapter arrives in Phase 12." }, meta: { provider: this.id, model: null, promptVersion: null, latencyMs: 0, packId } };
  }
  async generateLessonActivity(pack: ContextPack): Promise<Result<ActivityProposal>> {
    return this.pending(pack.pack_id);
  }
  async evaluateResponse(pack: ContextPack): Promise<Result<EvaluationProposal>> {
    return this.pending(pack.pack_id);
  }
  async generateExplanation(pack: ContextPack): Promise<Result<ExplanationProposal>> {
    return this.pending(pack.pack_id);
  }
  async generateLessonReport(pack: ContextPack): Promise<Result<ReportNarrativeProposal>> {
    return this.pending(pack.pack_id);
  }
  async generateCurriculumDraft(_r: CurriculumDraftRequest): Promise<Result<CurriculumDraftProposal>> {
    void _r;
    return this.pending(null);
  }
}
