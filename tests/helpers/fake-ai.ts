import type { AIProvider, Result, ProviderMeta, ResponseItem } from "@/lib/ai/provider";
import type { ContextPack } from "@/schemas/context-pack";
import type { ActivityProposal, EvaluationProposal, ExplanationProposal, ReportNarrativeProposal, CurriculumDraftRequest, CurriculumDraftProposal } from "@/schemas/ai-proposals";

/** A scriptable provider for tests: each method returns whatever the test queued. */
export class FakeAIProvider implements AIProvider {
  readonly id = "fake";
  calls: Array<{ method: string; pack?: ContextPack; input?: unknown }> = [];
  private queue: Record<string, Array<(pack?: ContextPack, input?: unknown) => Result<unknown>>> = {};

  private meta(packId: string | null): ProviderMeta {
    return { provider: "fake", model: "fake-1", promptVersion: "test", latencyMs: 1, packId };
  }
  on(method: string, fn: (pack?: ContextPack, input?: unknown) => unknown) {
    (this.queue[method] ??= []).push((pack, input) => ({ ok: true, value: fn(pack, input), meta: this.meta(pack?.pack_id ?? null) }));
    return this;
  }
  fail(method: string, kind: "TIMEOUT" | "INVALID_OUTPUT" | "UPSTREAM" | "REFUSED" | "RATE_LIMITED" | "NOT_CONFIGURED") {
    (this.queue[method] ??= []).push((pack) => ({ ok: false, error: { kind, message: kind }, meta: this.meta(pack?.pack_id ?? null) }));
    return this;
  }
  private next<T>(method: string, pack?: ContextPack, input?: unknown): Result<T> {
    this.calls.push({ method, pack, input });
    const fn = this.queue[method]?.shift();
    if (!fn) return { ok: false, error: { kind: "NOT_CONFIGURED", message: `no scripted response for ${method}` }, meta: this.meta(pack?.pack_id ?? null) };
    return fn(pack, input) as Result<T>;
  }
  async generateLessonActivity(pack: ContextPack, activity: unknown): Promise<Result<ActivityProposal>> {
    return this.next("generateLessonActivity", pack, activity);
  }
  async evaluateResponse(pack: ContextPack, item: ResponseItem): Promise<Result<EvaluationProposal>> {
    return this.next("evaluateResponse", pack, item);
  }
  async generateExplanation(pack: ContextPack, request: unknown): Promise<Result<ExplanationProposal>> {
    return this.next("generateExplanation", pack, request);
  }
  async generateLessonReport(pack: ContextPack, observed: unknown): Promise<Result<ReportNarrativeProposal>> {
    return this.next("generateLessonReport", pack, observed);
  }
  async generateCurriculumDraft(request: CurriculumDraftRequest): Promise<Result<CurriculumDraftProposal>> {
    return this.next("generateCurriculumDraft", undefined, request);
  }
}
