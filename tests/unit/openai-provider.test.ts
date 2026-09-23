import { describe, it, expect } from "vitest";
import { OpenAIProvider } from "@/lib/ai/openai-provider";
import type { ContextPack } from "@/schemas/context-pack";

const pack = {
  context_version: "context.v1",
  generated_at: new Date().toISOString(),
  pack_id: "pack_abcdef123456",
  student: { display_name: "T", age_years: 7, instruction_language: "pt-BR", target_language: "en", timezone: "Europe/Lisbon" },
  subject: { name: "English", slug: "english" },
  curriculum: { name: "C", version: "1.0.0", source: "FAMILY" },
  current_unit: { name: "U", description: "", position: 1 },
  primary_objective: { ref: "obj_1", code: "X", title: "X", description: "", difficulty: 1, skills: [], teaching_notes: { vocabulary: [], structures: [], example_prompts: [], activity_ideas: [], success_criteria: [] } },
  prerequisites: [],
  current_student_state: { status: "NOT_STARTED", confidence: "LOW", assessed_attempts: 0, success_rate_recent: null, first_seen_at: null, last_assessed_at: null },
  relevant_recent_evidence: [],
  recurring_errors: [],
  mastered_relevant_concepts: [],
  previous_lesson_summary: null,
  lesson_plan: { planned_duration_minutes: 20, activities: [{ sequence: 1, activity_type: "PRACTICE", objective_ref: "obj_1", skill_ref: null, instructions: "go", expected_evidence_count: 3, planned_minutes: 20 }] },
  pedagogical_constraints: { age_appropriate_for_years: 7, instruction_language: "pt-BR", target_language: "en", max_new_vocabulary_items: 6, avoid_topics: [], reading_level: "EARLY_READER", session_minutes: 20, correction_style: "GENTLE_RECAST" },
  teacher_instructions: { source: "PARENT", text: null, authored_at: null },
} as unknown as ContextPack;

function providerWith(handler: (req: Request, signal?: AbortSignal | null) => Promise<Response> | Response, timeoutMs = 30_000) {
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => handler(new Request(input, { method: init?.method, headers: init?.headers, body: init?.body }), init?.signal)) as typeof fetch;
  return new OpenAIProvider({ apiKey: "k", baseUrl: "https://example.invalid/v1", model: "m", timeoutMs, fetchImpl });
}
const completion = (content: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }] }), { status: 200, headers: { "content-type": "application/json" } });

describe("OpenAIProvider", () => {
  it("sends the contract, the pack as data and a strict JSON schema, and returns a validated proposal", async () => {
    let seen: { body: Record<string, unknown>; auth: string | null } | null = null;
    const p = providerWith(async (req) => {
      seen = { body: (await req.json()) as Record<string, unknown>, auth: req.headers.get("authorization") };
      return completion({ activity_ref: 1, objective_ref: "obj_1", title: "t", child_facing_intro: "Olá!", items: [{ prompt: "Say hello", expected_response: "Hello", accept_also: [], skill_ref: null, checkable: "EXACT" }], needs_clarification: null });
    });
    const r = await p.generateLessonActivity(pack, pack.lesson_plan.activities[0]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.items[0].expected_response).toBe("Hello");
    expect(seen!.auth).toBe("Bearer k");
    const messages = seen!.body.messages as Array<{ role: string; content: string }>;
    expect(messages[0].content).toContain("teacher-contract.v1");
    expect(messages[1].content).toContain("CONTEXT PACK (data)");
    expect((seen!.body.response_format as { json_schema: { strict: boolean } }).json_schema.strict).toBe(true);
    expect(r.meta.promptVersion).toContain("teacher-contract.v1");
  });

  it("rejects output that violates the schema, and non-JSON, as INVALID_OUTPUT", async () => {
    const bad = providerWith(async () => completion({ activity_ref: 1, objective_ref: "not-a-handle", title: "t", child_facing_intro: "x", items: [], needs_clarification: null, extra: 1 }));
    const r1 = await bad.generateLessonActivity(pack, pack.lesson_plan.activities[0]);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error.kind).toBe("INVALID_OUTPUT");
    const notJson = providerWith(async () => completion("Sure! Here is the activity: ..."));
    const r2 = await notJson.generateLessonActivity(pack, pack.lesson_plan.activities[0]);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error.kind).toBe("INVALID_OUTPUT");
  });

  it("maps 429, upstream errors, refusals and timeouts to ordinary error values", async () => {
    const limited = providerWith(async () => new Response("slow down", { status: 429 }));
    expect((await limited.generateCurriculumDraft({ subject: "s", goal: "g", age_years: null, instruction_language: "pt-BR", target_language: null, source_material: null, units_wanted: 2 })).ok).toBe(false);
    const down = providerWith(async () => new Response("boom", { status: 500 }));
    const r = await down.evaluateResponse(pack, { activity_ref: 1, prompt: "p", expected_response: null, accept_also: [], student_response: "x", objective_ref: "obj_1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("UPSTREAM");
    const refused = providerWith(async () => new Response(JSON.stringify({ choices: [{ message: { refusal: "no" } }] }), { status: 200 }));
    const r3 = await refused.generateExplanation(pack, { objective_ref: "obj_1", question: null });
    expect(r3.ok).toBe(false);
    if (!r3.ok) expect(r3.error.kind).toBe("REFUSED");
    const slow = providerWith((_req, signal) => new Promise((_, reject) => signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))), 20);
    const r4 = await slow.generateExplanation(pack, { objective_ref: "obj_1", question: null });
    expect(r4.ok).toBe(false);
    if (!r4.ok) expect(r4.error.kind).toBe("TIMEOUT");
  });
});
