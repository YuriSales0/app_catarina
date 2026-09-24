import { describe, it, expect } from "vitest";
import { OpenAIProvider } from "@/lib/ai/openai-provider";
import type { ContextPack } from "@/schemas/context-pack";

/** Records the model and temperature of every request, answers with a minimal valid proposal. */
function recorder(quality: "standard" | "high", models = { standard: "gpt-4o-mini", high: "gpt-5.4-mini" }) {
  const seen: Array<{ model: string; temperature: unknown }> = [];
  const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { model: string; temperature?: number; response_format: { json_schema: { name: string } } };
    seen.push({ model: body.model, temperature: body.temperature });
    const name = body.response_format.json_schema.name;
    const content =
      name === "evaluation_proposal"
        ? { objective_ref: "obj_1", result: "CORRECT", confidence: "MEDIUM", correction: null, error_tags: [], rationale: "ok", needs_clarification: null }
        : { activity_ref: 1, objective_ref: "obj_1", title: "t", child_facing_intro: "Oi", items: [{ prompt: "p", expected_response: "e", accept_also: [], skill_ref: null, checkable: "EXACT" }], needs_clarification: null };
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), { status: 200 });
  }) as typeof fetch;
  return { provider: new OpenAIProvider({ apiKey: "k", baseUrl: "https://example.invalid/v1", models, quality, fetchImpl }), seen };
}

const pack = { pack_id: "pack_abcdef123456" } as unknown as ContextPack;
const activity = (type: string) => ({ sequence: 1, activity_type: type, objective_ref: "obj_1", skill_ref: null, instructions: "x", expected_evidence_count: 3, planned_minutes: 5 }) as unknown as ContextPack["lesson_plan"]["activities"][number];
const item = { activity_ref: 1, prompt: "p", expected_response: null, accept_also: [], student_response: "r", objective_ref: "obj_1" };

describe("conversation quality", () => {
  it("standard uses the economical model for every task", async () => {
    const { provider, seen } = recorder("standard");
    await provider.generateLessonActivity(pack, activity("PRACTICE"));
    await provider.generateLessonActivity(pack, activity("CONVERSATION"));
    await provider.evaluateResponse(pack, item);
    expect(seen.map((s) => s.model)).toEqual(["gpt-4o-mini", "gpt-4o-mini", "gpt-4o-mini"]);
  });

  it("high moves conversation, openings and open grading to the better model, keeps checkable exercises economical", async () => {
    const { provider, seen } = recorder("high");
    await provider.generateLessonActivity(pack, activity("PRACTICE"));
    await provider.generateLessonActivity(pack, activity("CONVERSATION"));
    await provider.generateLessonActivity(pack, activity("ORIENTATION"));
    await provider.evaluateResponse(pack, item);
    expect(seen.map((s) => s.model)).toEqual(["gpt-4o-mini", "gpt-5.4-mini", "gpt-5.4-mini", "gpt-5.4-mini"]);
  });

  it("omits temperature for reasoning-family models and records the model actually used", async () => {
    const { provider, seen } = recorder("high");
    const r = await provider.evaluateResponse(pack, item);
    expect(seen[0].temperature).toBeUndefined();
    expect(r.meta.model).toBe("gpt-5.4-mini");
    const { provider: std, seen: s2 } = recorder("standard");
    await std.generateLessonActivity(pack, activity("PRACTICE"));
    expect(s2[0].temperature).toBe(0.7);
  });
});
