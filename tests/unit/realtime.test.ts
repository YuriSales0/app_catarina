import { describe, it, expect } from "vitest";
import { buildRealtimeSession, createRealtimeClientSecret, renderVoiceInstructions, realtimeCallsUrl, VOICE_TOOLS, type VoiceLessonOverview } from "@/lib/ai/realtime";
import type { ContextPack } from "@/schemas/context-pack";

const pack = {
  context_version: "context.v2",
  pack_id: "pack_abcdefabcdef",
  student: { display_name: "Catarina", age_years: 5, instruction_language: "pt-BR", target_language: "en", timezone: "America/Sao_Paulo" },
} as unknown as ContextPack;

const overview: VoiceLessonOverview = {
  mode: "START",
  lesson_kind: "COURSE_START",
  first_lesson_ever: true,
  theme: { title: "Greet and say goodbye", description: "Use hello and goodbye", vocabulary: ["hello", "goodbye"], key_phrases: ["Hello!", "Goodbye!"] },
  can_do_at_the_end: ["Replies to a greeting"],
  situation_ideas: ["Greeting round with toys"],
  module: { name: "Hello!", goals: ["Greetings", "Colours"] },
  previous_lesson: null,
  plan: [
    { step: 1, activity_type: "ORIENTATION", label: "Começando a aventura!", minutes: 3, done: false },
    { step: 2, activity_type: "EXPLANATION", label: "Coisa nova!", minutes: 4, done: false },
  ],
  minutes: 20,
};

describe("live voice session", () => {
  it("a new lesson must open with context, goals and the plan before any exercise", () => {
    const text = renderVoiceInstructions({ pack, overview });
    expect(text).toContain("LIVE VOICE lesson");
    expect(text).toContain("never ask the child to read");
    expect(text).toContain("One idea per turn");
    const opening = text.indexOf("PART 1 - OPENING");
    const activities = text.indexOf("PART 2 - ACTIVITIES");
    const closing = text.indexOf("PART 3 - CLOSING");
    expect(opening).toBeGreaterThan(-1);
    expect(activities).toBeGreaterThan(opening);
    expect(closing).toBeGreaterThan(activities);
    expect(text).toContain("Introduce yourself");
    expect(text).toContain("Explain how the lessons work");
    expect(text).toContain("WHY it is useful");
    expect(text).toContain("can_do_at_the_end");
    expect(text).toContain("Only then call begin_lesson");
    expect(text).toContain('"key_phrases":["Hello!","Goodbye!"]');
    expect(text).toContain("Never claim mastery");
    expect(text).not.toContain("Produce structured output");
    expect(text).toContain("about 20 minutes");
    expect(text).toMatch(/Start now with PART 1 - OPENING/);
  });

  it("speaks of the subject and languages by name, and never assumes English", () => {
    const english = renderVoiceInstructions({ pack, overview });
    expect(english).toContain("an owl who teaches English");
    expect(english).toContain("Speak Brazilian Portuguese for everything except the English being taught");
    expect(english).toContain("say goodbye in English");
    const maths = { ...pack, subject: { name: "Mathematics", slug: "mathematics" }, student: { ...pack.student, target_language: null } } as ContextPack;
    const text = renderVoiceInstructions({ pack: maths, overview });
    expect(text).toContain("an owl who teaches Mathematics");
    expect(text).toContain("Speak Brazilian Portuguese throughout");
    expect(text).not.toContain("English");
  });

  it("a regular lesson skips the how-it-works talk; a reconnect only welcomes back", () => {
    const regular = renderVoiceInstructions({ pack, overview: { ...overview, lesson_kind: "REGULAR", first_lesson_ever: false } });
    expect(regular).not.toContain("Explain how the lessons work");
    expect(regular).not.toContain("Introduce yourself");
    expect(regular).toContain("WHY it is useful");
    const resume = renderVoiceInstructions({ pack, overview: { ...overview, mode: "RESUME" } });
    expect(resume).toContain("WELCOME BACK");
    expect(resume).not.toContain("PART 1 - OPENING");
  });

  it("the session exposes exactly four tools and transcribes the child independently", () => {
    const session = buildRealtimeSession({ model: "gpt-realtime-mini", voice: "marin", transcriptionModel: "gpt-4o-mini-transcribe", instructions: "x" });
    expect(session.tools.map((t) => t.name)).toEqual(["begin_lesson", "record_answer", "next_activity", "finish_lesson"]);
    expect(session.audio.output.speed).toBeLessThan(1);
    expect(session.audio.input.transcription.model).toBe("gpt-4o-mini-transcribe");
    expect(session.audio.input.turn_detection.type).toBe("semantic_vad");
    const record = VOICE_TOOLS[1];
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
