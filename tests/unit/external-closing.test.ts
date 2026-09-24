import { describe, it, expect } from "vitest";
import { externalClosingSchema, extractClosingJson } from "@/schemas/external-closing";
import { renderExternalLessonPrompt } from "@/lib/lessons/external-prompt";
import type { ContextPack } from "@/schemas/context-pack";
import type { LessonOverview } from "@/lib/lessons/voice";

const closing = {
  format: "learning-os-closing.v1",
  lesson_code: "A1B2C3",
  minutes: 18,
  activities: [{ activity: 2, attempts: [{ prompt: "Que dia é Monday?", expected: "segunda-feira", child_said: "segunda", result: "correct" }] }],
  summary: "Foi ótima.",
  went_well: ["Reconheceu os dias"],
  was_hard: [],
  next_time: "Frases com os dias",
  extra_field: "ignored",
};

describe("external closing", () => {
  it("finds the JSON in a fenced block inside a whole pasted message, and straightens curly quotes", () => {
    const pasted = `Que aula legal! Aqui está o fechamento:\n\n\`\`\`json\n${JSON.stringify(closing, null, 2)}\n\`\`\`\nAté a próxima!`;
    const parsed = externalClosingSchema.parse(extractClosingJson(pasted));
    expect(parsed.lesson_code).toBe("A1B2C3");
    expect(parsed.activities[0].attempts[0].result).toBe("CORRECT");
    expect("extra_field" in parsed).toBe(false);
    const curly = JSON.stringify(closing).replace(/"/g, "“");
    expect(externalClosingSchema.parse(extractClosingJson(curly)).summary).toBe("Foi ótima.");
  });

  it("rejects a message without a block and a block with an unknown result", () => {
    expect(() => extractClosingJson("a aula foi boa")).toThrow();
    const bad = { ...closing, activities: [{ activity: 1, attempts: [{ prompt: "x", result: "GREAT" }] }] };
    expect(externalClosingSchema.safeParse(bad).success).toBe(false);
  });
});

describe("external lesson script", () => {
  const pack = {
    student: { display_name: "Catarina", age_years: 7, instruction_language: "pt-BR", target_language: "en", timezone: "America/Sao_Paulo" },
    subject: { name: "English", slug: "english" },
    recurring_errors: [{ human_label: "Silent initial h (hat, house, horse)" }],
    mastered_relevant_concepts: [],
    long_term: { trend: "DECLINING" },
  } as unknown as ContextPack;
  const overview: LessonOverview = {
    mode: "START",
    lesson_kind: "REGULAR",
    stage: "PHRASES_AND_DIALOGUE",
    first_lesson_ever: false,
    theme: { title: "Days of the week", description: "Say the days", vocabulary: ["Monday", "Tuesday"], key_phrases: ["Today is Monday."] },
    can_do_at_the_end: ["Says what day it is today"],
    situation_ideas: ["A weekly calendar"],
    module: { name: "My week", goals: [] },
    previous_lesson: { practised: ["Numbers 1 to 10"], went_well: [], was_hard: [] },
    plan: [],
    minutes: 20,
  };
  const text = renderExternalLessonPrompt({
    pack,
    overview,
    lessonCode: "A1B2C3",
    activities: [{ sequence: 1, label: "Coisa nova!", activity_type: "EXPLANATION", instructions: "Apresente os dias.", minutes: 4, expected_attempts: 0 }],
  });

  it("carries the same pedagogy as the in-app lesson, in Portuguese", () => {
    expect(text).toContain("Você é o Lumi");
    expect(text).toContain('Nunca comece com "repita comigo"');
    expect(text).toContain("DAS PALAVRAS PARA FRASES E CONVERSA");
    expect(text).toContain("o foco é em frases e diálogos curtos");
    expect(text).toContain("A AULA TEM TRÊS PARTES");
    expect(text).toContain("se despedir em inglês");
    expect(text).toContain("vá mais devagar");
    expect(text).toContain("Silent initial h");
  });

  it("asks for a closing block with this lesson's code and each planned activity", () => {
    expect(text).toContain('"lesson_code": "A1B2C3"');
    expect(text).toContain('"format": "learning-os-closing.v1"');
    expect(text).toContain('"activity": 1');
    expect(text).toContain("FECHAMENTO");
    expect(text).not.toMatch(/undefined|\[object Object\]|\$\{/);
  });
});
