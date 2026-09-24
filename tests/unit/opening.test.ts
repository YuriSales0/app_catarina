import { describe, it, expect } from "vitest";
import { decideOpening, placementCheck, openingInstructions } from "@/lib/lessons/opening";
import { buildLessonStructure } from "@/lib/lessons/structure";

const unit = [
  { id: "00000000-0000-7000-8000-000000000001", title: "Greetings", status: "NOT_STARTED" as const },
  { id: "00000000-0000-7000-8000-000000000002", title: "My name is", status: "NOT_STARTED" as const },
];

describe("decideOpening", () => {
  it("opens the course when nothing was completed on this curriculum version", () => {
    expect(decideOpening({ completedLessonsOnVersion: 0, unitName: "Hello!", unitObjectives: unit })?.kind).toBe("COURSE_START");
  });
  it("opens a module when nothing in the unit has started", () => {
    expect(decideOpening({ completedLessonsOnVersion: 4, unitName: "Colours", unitObjectives: unit })).toEqual({
      kind: "UNIT_START",
      unit_name: "Colours",
      unit_objectives: unit.map(({ id, title }) => ({ id, title })),
    });
  });
  it("does not open once the unit is under way", () => {
    expect(decideOpening({ completedLessonsOnVersion: 4, unitName: "Colours", unitObjectives: [{ ...unit[0], status: "INTRODUCED" }, unit[1]] })).toBeNull();
  });
});

describe("opening structure", () => {
  it("puts the orientation first and keeps the planned minutes", () => {
    const opening = decideOpening({ completedLessonsOnVersion: 0, unitName: "Hello!", unitObjectives: unit })!;
    const acts = buildLessonStructure({ id: unit[0].id, title: "Greetings", status: "NOT_STARTED" }, [], 15, opening);
    expect(acts[0]).toMatchObject({ sequence: 1, activity_type: "ORIENTATION", expected_evidence_count: 3 });
    expect(acts.map((a) => a.sequence)).toEqual(acts.map((_, i) => i + 1));
    expect(acts.reduce((a, x) => a + x.planned_minutes, 0)).toBe(15);
    expect(openingInstructions(opening, "Greetings")).toContain('"Greetings", "My name is"');
  });
});

describe("placementCheck", () => {
  const course = { kind: "COURSE_START" as const, unit_name: "Hello!", unit_objectives: [] };
  const unitStart = { kind: "UNIT_START" as const, unit_name: "Colours", unit_objectives: [] };
  it("suggests the next level when the course diagnostic is nearly perfect, and never acts on its own", () => {
    const r = placementCheck(course, ["CORRECT", "CORRECT", "CORRECT"], "English Starters (Cambridge Pre A1 aligned)");
    expect(r?.action).toMatch(/Movers/);
    expect(r?.reason).toMatch(/decisão de mudar é sempre da família/);
  });
  it("suggests an easier level when a higher level's diagnostic fails, but not below Starters", () => {
    expect(placementCheck(course, ["INCORRECT", "INCORRECT", "INCORRECT"], "English Movers (Cambridge A1 aligned)")?.action).toMatch(/Starters/);
    expect(placementCheck(course, ["INCORRECT", "INCORRECT", "INCORRECT"], "English Starters (Cambridge Pre A1 aligned)")).toBeNull();
  });
  it("needs three assessed answers and stays quiet in the middle", () => {
    expect(placementCheck(course, ["CORRECT", "CORRECT", "NOT_ASSESSED"], "English Starters")).toBeNull();
    expect(placementCheck(course, ["CORRECT", "INCORRECT", "PARTIALLY_CORRECT"], "English Starters")).toBeNull();
  });
  it("comments on module starts without talking about levels", () => {
    expect(placementCheck(unitStart, ["CORRECT", "CORRECT", "CORRECT"], "English Starters")?.action).toMatch(/já sabendo bastante/);
    expect(placementCheck(unitStart, ["INCORRECT", "INCORRECT", "INCORRECT"], "English Starters")?.action).toMatch(/revisão calma/);
  });
});
