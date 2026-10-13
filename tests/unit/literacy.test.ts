import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildRealtimeSession, renderVoiceInstructions, VOICE_TOOLS, type VoiceLessonOverview } from "@/lib/ai/realtime";
import { isLiteracyPack, parseShowArgs, SHOW_TOOL } from "@/lib/ai/literacy";
import { letterAlbum, stickerLook } from "@/lib/lessons/album";
import { cardsFor, renderLiteracyExternalPrompt, renderLiteracyPlacementPrompt } from "@/lib/lessons/literacy-prompt";
import { renderExternalClosingRequest } from "@/lib/lessons/external-prompt";
import { gradeExternalAttempt } from "@/lib/lessons/external";
import { isNonAttempt } from "@/lib/assessment/answer-match";
import { parseCurriculumYaml } from "@/lib/curriculum/parse";
import type { ContextPack } from "@/schemas/context-pack";

const pack = {
  context_version: "context.v2",
  pack_id: "pack_abcdefabcdef",
  student: { display_name: "Aurora", age_years: 5, instruction_language: "es", target_language: "es", timezone: "Europe/Madrid" },
  subject: { name: "Alfabetización", slug: "literacy" },
  curriculum: { name: "La Isla de las Letras", version: "1.0.0", source: "FAMILY" },
  current_unit: { name: "Isla 3: M, P, L y S", description: "", position: 3 },
  primary_objective: { ref: "obj_1", code: "LIT.L3.M", title: "La M: ma, me, mi, mo, mu", description: "", difficulty: 2, skills: [], teaching_notes: {} },
  current_student_state: { status: "NOT_STARTED" },
  relevant_recent_evidence: [],
  mastered_relevant_concepts: [{ title: "Las cinco vocales" }],
  recurring_errors: [],
  previous_lesson_summary: null,
  long_term: { trend: "STABLE" },
  pedagogical_constraints: { correction_style: "GENTLE_RECAST" },
  teacher_instructions: { text: null },
} as unknown as ContextPack;

const overview: VoiceLessonOverview = {
  mode: "START",
  lesson_kind: "COURSE_START",
  stage: "WORDS_TO_PHRASES",
  first_lesson_ever: true,
  theme: { title: "La M: ma, me, mi, mo, mu", description: "", vocabulary: ["M", "ma", "mamá"], key_phrases: ["mmm + a = ma", "Mi mamá me mima."] },
  can_do_at_the_end: ["Lee ma, me, mi, mo, mu"],
  situation_ideas: ["El tren de sílabas"],
  module: { name: "Isla 3: M, P, L y S", goals: ["La M"] },
  previous_lesson: null,
  plan: [
    { step: 1, activity_type: "ORIENTATION", label: "¡Empieza la aventura!", minutes: 3, done: false },
    { step: 2, activity_type: "GAME", label: "¡Hora del juego!", minutes: 5, done: false },
  ],
  minutes: 15,
};

describe("literacy mode", () => {
  it("is chosen by the subject, and the English pack keeps the language lesson", () => {
    expect(isLiteracyPack(pack)).toBe(true);
    expect(isLiteracyPack({ subject: { name: "English", slug: "english" } } as ContextPack)).toBe(false);
  });

  it("voice instructions teach reading in Spanish, by sound, as a game, with the screen", () => {
    const text = renderVoiceInstructions({ pack, overview });
    expect(text).toContain("READ AND WRITE");
    expect(text).toContain("Speak ONLY Spanish (Spain, Castilian)");
    expect(text).toContain("SOUND, not name");
    expect(text).toContain("show_on_screen");
    expect(text).toContain("STICKER");
    expect(text).toContain("Isla 3: M, P, L y S");
    expect(text).not.toContain("Brazilian accent");
    expect(text).toContain("CONTEXT PACK (data):");
  });

  it("the session adds show_on_screen and the transcription language only for literacy", () => {
    const lit = buildRealtimeSession({ model: "m", voice: "v", transcriptionModel: "t", instructions: "x", literacy: true, language: "es" });
    expect(lit.tools.map((t) => t.name)).toEqual([...VOICE_TOOLS.map((t) => t.name), SHOW_TOOL.name]);
    expect(lit.audio.input.transcription.language).toBe("es");
    const lang = buildRealtimeSession({ model: "m", voice: "v", transcriptionModel: "t", instructions: "x" });
    expect(lang.tools.map((t) => t.name)).not.toContain("show_on_screen");
    expect(lang.audio.input.transcription.language).toBeUndefined();
  });

  it("parses what Lumi asks to show, refusing malformed requests", () => {
    expect(parseShowArgs('{"style":"syllable","text":"ma","options":[]}')).toEqual({ style: "syllable", text: "ma", options: [] });
    expect(parseShowArgs('{"style":"choice","text":"¿Cuál es la M?","options":["M","N","A"]}')?.options).toEqual(["M", "N", "A"]);
    expect(parseShowArgs('{"style":"choice","text":"x","options":["M"]}')).toBeNull();
    expect(parseShowArgs('{"style":"poster","text":"x","options":[]}')).toBeNull();
    expect(parseShowArgs('{"style":"word","text":"","options":[]}')).toBeNull();
    expect(parseShowArgs("not json")).toBeNull();
  });

  it("the ChatGPT script is in Spanish, lists the cards and keeps every level", () => {
    const cards = cardsFor(["M", "ma", "mamá", "ma"], ["mmm + a = ma", "Mi mamá me mima."]);
    expect(cards).toEqual(["M", "ma", "mamá", "Mi mamá me mima"]);
    const text = renderLiteracyExternalPrompt({
      pack,
      overview,
      cards,
      activities: [
        { sequence: 1, label: "¡Empieza la aventura!", activity_type: "ORIENTATION", instructions: "", minutes: 3, expected_attempts: 3, review: null },
        { sequence: 2, label: "¡Hora del juego!", activity_type: "GAME", instructions: "", minutes: 5, expected_attempts: 6, review: null },
      ],
    });
    expect(text).toContain("Habla SOLO en español de España");
    expect(text).toContain("NIVEL 1");
    expect(text).toContain("NIVEL 2");
    expect(text).toContain("TARJETAS QUE TIENE EL ADULTO: M; ma; mamá; Mi mamá me mima");
    expect(text).not.toMatch(/inglês|português/);
    const placement = renderLiteracyPlacementPrompt({ pack, probes: [{ sequence: 2, unit_name: "Isla 2: Las vocales", topic: "La A", vocabulary: ["A"], phrases: [], examples: [] }] });
    expect(placement).toContain('isla "Isla 2: Las vocales"');
  });

  it("closing and grading use reading rules, not the Portuguese rule", () => {
    expect(renderExternalClosingRequest({ childName: "Aurora", lessonCode: "ABC", activities: [], literacy: true })).toContain("result (leitura)");
    // An English lesson marks "Marrom." for brown as partial; a reading answer is never judged by language.
    expect(gradeExternalAttempt("CORRECT", "Marrom.", "brown").result).toBe("PARTIALLY_CORRECT");
    expect(gradeExternalAttempt("CORRECT", "mamá", "mama mia", true).result).toBe("CORRECT");
    expect(isNonAttempt("no sé")).toBe(true);
    expect(isNonAttempt("Ni idea")).toBe(true);
  });

  it("the album shows letters by system state, grouped by island", () => {
    const o = (key: string, unit: number, status: "NOT_STARTED" | "DEVELOPING" | "PROFICIENT") => ({ status, objective: { objectiveKey: key, title: key }, unit: { name: `Isla ${unit}`, sequence: unit } });
    const album = letterAlbum([o("LIT.L2.A", 2, "PROFICIENT"), o("LIT.L2.E", 2, "DEVELOPING"), o("LIT.L2.ALL", 2, "NOT_STARTED"), o("LIT.L1.RHYME", 1, "PROFICIENT"), o("LIT.L3.M", 3, "NOT_STARTED")]);
    expect(album.map((i) => i.name)).toEqual(["Isla 1", "Isla 2", "Isla 3"]);
    expect(album[1].stickers.map((s) => [s.letter, s.look])).toEqual([["A", "gold"], ["E", "collected"]]);
    expect(album[1]).toMatchObject({ objectives: 3, secure: 1, gold: 1 });
    expect(album[0].stickers).toEqual([]);
    expect(stickerLook("MASTERED")).toBe("gold");
    expect(stickerLook("INTRODUCED")).toBe("collected");
  });
});

describe("La Isla de las Letras curriculum", () => {
  const parsed = parseCurriculumYaml(readFileSync("curricula/alfabetizacion-es.yaml", "utf8"));
  if (!parsed.ok) throw new Error(parsed.errors.join("\n"));
  const file = parsed.value.file;

  it("is a literacy curriculum taught in Spanish", () => {
    expect(file.subject).toBe("literacy");
    expect(file.instruction_language).toBe("es");
  });

  it("asks a child to read only letters already taught", () => {
    // Islands 1 and 2 are oral and letter-by-letter; from island 3 on, every written word uses known letters.
    const known = new Set(["a", "e", "i", "o", "u"]);
    const strip = (w: string) => w.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const problems: string[] = [];
    for (const unit of file.units) {
      for (const obj of unit.objectives) {
        const letter = /^LIT\.L\d+\.([A-Z])$/.exec(obj.key)?.[1];
        if (letter) known.add(letter.toLowerCase());
        if (["L1", "L2"].includes(unit.key) || obj.key === "LIT.L5.NAME") continue;
        const words = [...obj.teaching_notes.vocabulary, ...obj.teaching_notes.structures.filter((x) => !/[+:]/.test(x))].flatMap((x) => strip(x).split(/[^a-zñ]+/)).filter((w) => w.length > 1);
        for (const w of words) {
          const unknown = [...w].filter((c) => !known.has(c));
          if (unknown.length) problems.push(`${obj.key}: "${w}" uses ${[...new Set(unknown)].join(",")}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
