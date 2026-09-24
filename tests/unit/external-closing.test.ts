import { describe, it, expect } from "vitest";
import { externalClosingSchema, extractClosingJson } from "@/schemas/external-closing";
import { renderExternalLessonPrompt, renderExternalClosingRequest, materialFor, chunkWords, type ExternalActivity } from "@/lib/lessons/external-prompt";
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
    stage: "WORDS_TO_PHRASES",
    first_lesson_ever: false,
    theme: { title: "Days of the week and times", description: "Say the days", vocabulary: [], key_phrases: [] },
    can_do_at_the_end: [],
    situation_ideas: [],
    module: null,
    previous_lesson: { practised: ["Numbers 1 to 10"], went_well: [], was_hard: [] },
    plan: [],
    minutes: 30,
  };
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "o'clock", "half past", "morning", "afternoon", "evening", "night"];
  const material = materialFor("WORDS_TO_PHRASES", days, ["It's three o'clock.", "On Monday I go swimming."], 6);
  const activities: ExternalActivity[] = [
    { sequence: 1, label: "Coisa nova!", activity_type: "EXPLANATION", instructions: "x", minutes: 5, expected_attempts: 0, review: null },
    { sequence: 2, label: "Vamos praticar!", activity_type: "PRACTICE", instructions: "x", minutes: 10, expected_attempts: 5, review: null },
    { sequence: 3, label: "Hora do jogo!", activity_type: "GAME", instructions: "x", minutes: 8, expected_attempts: 3, review: null },
    { sequence: 4, label: "Mostre o que você sabe!", activity_type: "ASSESSMENT", instructions: "x", minutes: 7, expected_attempts: 3, review: null },
  ];
  const text = renderExternalLessonPrompt({ pack, overview, activities, material });

  it("a new topic takes at most the age cap of new words, in groups of three, and leaves the rest for later lessons", () => {
    expect(material.groups).toEqual([["Monday", "Tuesday", "Wednesday"], ["Thursday", "Friday", "Saturday"]]);
    expect(material.later).toContain("Sunday");
    expect(material.later).toContain("half past");
    expect(material.phrases).toEqual(["On Monday I go swimming."]);
    expect(chunkWords(["a", "b", "c", "d"])).toEqual([["a", "b"], ["c", "d"]]);
    expect(text).toContain("grupo 1: Monday; Tuesday; Wednesday");
    expect(text).toContain("Ficam para as próximas aulas (não ensine hoje): Sunday");
  });

  it("every activity has concrete steps and a minimum of rounds, and the lesson cannot end early", () => {
    expect(text).toContain("A aula dura cerca de 30 minutos");
    expect(text).toContain("Não pule, não resuma e não encerre antes da última etapa");
    expect(text).toContain("ATIVIDADE 1: Coisa nova!");
    expect(text).toContain("jogo de reconhecer: 4 rodadas");
    expect(text).toContain("Pelo menos 6 perguntas");
    expect(text).toContain("Jogue pelo menos 6 rodadas");
    expect(text).toContain("Desafio: 4 perguntas SEM ajuda");
    expect(text).toContain("ENCERRAMENTO (depois da última atividade)");
    expect(text).not.toMatch(/encerramento curto/);
  });

  it("keeps Lumi's pedagogy and forbids questions about facts the assistant cannot know", () => {
    expect(text).toContain("Você é o Lumi");
    expect(text).toContain('nunca comece com "repita comigo"');
    expect(text).toContain("Das palavras para frases e conversa");
    expect(text).toContain("que dia é hoje, que horas são");
    expect(text).toContain("se despedir em inglês");
    expect(text).toContain("vá mais devagar");
    expect(text).not.toMatch(/undefined|\[object Object\]|\$\{/);
  });

  it("the closing is a separate, self-contained request with this lesson's code", () => {
    expect(text).not.toContain("lesson_code");
    expect(text).toContain("pedido de fechamento");
    const request = renderExternalClosingRequest({ childName: "Catarina", lessonCode: "A1B2C3", activities });
    expect(request).toContain("Responda só em texto");
    expect(request).toContain('"lesson_code": "A1B2C3"');
    expect(request).toContain('"format": "learning-os-closing.v1"');
    expect(request).toContain("2 = Vamos praticar!");
    expect(request).toContain("use child_said null e result NOT_ASSESSED");
    expect(externalClosingSchema.safeParse(extractClosingJson(request)).success).toBe(true);
  });
});
