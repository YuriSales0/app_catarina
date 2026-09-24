import { describe, it, expect } from "vitest";
import { buildRealtimeSession, createRealtimeClientSecret, renderVoiceInstructions, realtimeCallsUrl, VOICE_TOOLS, type VoiceActivityBrief } from "@/lib/ai/realtime";
import type { ContextPack } from "@/schemas/context-pack";

const pack = {
  context_version: "context.v2",
  pack_id: "pack_abcdefabcdef",
  student: { display_name: "Catarina", age_years: 5, instruction_language: "pt-BR", target_language: "en", timezone: "America/Sao_Paulo" },
} as unknown as ContextPack;

const brief: VoiceActivityBrief = {
  activity_number: 1,
  activities_total: 4,
  activity_type: "ORIENTATION",
  instructions: "Abertura do curso",
  intro: null,
  opening: { kind: "COURSE_START", module: "Hello!", goals: ["Greetings", "Colours"] },
  items: [{ number: 1, kind: "CHECK", prompt: "What colour is the sun?", expected: "yellow", accept_also: [], done: false }],
};

describe("live voice session", () => {
  it("instructions carry the pack and the activity as data, voice-only rules, and no JSON-output rule", () => {
    const text = renderVoiceInstructions({ pack, brief, lessonMinutes: 20 });
    expect(text).toContain("LIVE VOICE lesson");
    expect(text).toContain("never ask the child to read");
    expect(text).toContain('"display_name":"Catarina"');
    expect(text).toContain('"goals":["Greetings","Colours"]');
    expect(text).toContain("Never claim mastery");
    expect(text).not.toContain("Produce structured output");
    expect(text).toContain("about 20 minutes");
  });

  it("the session exposes exactly three tools and transcribes the child independently", () => {
    const session = buildRealtimeSession({ model: "gpt-realtime-mini", voice: "marin", transcriptionModel: "gpt-4o-mini-transcribe", instructions: "x" });
    expect(session.tools.map((t) => t.name)).toEqual(["record_answer", "next_activity", "finish_lesson"]);
    expect(session.audio.input.transcription.model).toBe("gpt-4o-mini-transcribe");
    expect(session.audio.input.turn_detection.type).toBe("semantic_vad");
    const record = VOICE_TOOLS[0];
    expect(record.parameters.required).toEqual(["item_number", "child_said", "judgement"]);
  });

  it("mints a short-lived client secret without exposing the API key to the browser", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ value: "ek_test", expires_at: 123, session: {} }), { status: 200 });
    }) as unknown as typeof fetch;
    const session = buildRealtimeSession({ model: "m", voice: "v", transcriptionModel: "t", instructions: "i" });
    const r = await createRealtimeClientSecret({ apiKey: "sk-secret", baseUrl: "https://api.openai.com/v1/", fetchImpl }, session);
    expect(r).toEqual({ ok: true, value: { value: "ek_test", expiresAt: 123 } });
    expect(calls[0].url).toBe("https://api.openai.com/v1/realtime/client_secrets");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.expires_after).toEqual({ anchor: "created_at", seconds: 120 });
    expect(body.session.type).toBe("realtime");
    expect(JSON.stringify(r)).not.toContain("sk-secret");
    expect(realtimeCallsUrl("https://api.openai.com/v1/")).toBe("https://api.openai.com/v1/realtime/calls");
  });

  it("maps upstream failures to provider errors", async () => {
    const session = buildRealtimeSession({ model: "m", voice: "v", transcriptionModel: "t", instructions: "i" });
    const limited = await createRealtimeClientSecret({ apiKey: "k", baseUrl: "https://x", fetchImpl: (async () => new Response("", { status: 429 })) as unknown as typeof fetch }, session);
    expect(limited).toMatchObject({ ok: false, error: { kind: "RATE_LIMITED" } });
    const bad = await createRealtimeClientSecret({ apiKey: "k", baseUrl: "https://x", fetchImpl: (async () => new Response("nope", { status: 400 })) as unknown as typeof fetch }, session);
    expect(bad).toMatchObject({ ok: false, error: { kind: "UPSTREAM" } });
  });
});
