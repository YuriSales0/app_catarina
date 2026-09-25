import { describe, it, expect } from "vitest";
import { computePlacementResult, placedOutUnitKeys, placementProbes, newPlacement, placementOf } from "@/lib/learning/placement";

const NOW = new Date("2026-09-25T12:00:00Z");

describe("placement", () => {
  it("suggests the first unit not passed; a unit the check never reached is not passed", () => {
    const r = computePlacementResult(
      [
        { unit_key: "S1", unit_name: "Hello!", results: ["CORRECT", "CORRECT"] },
        { unit_key: "S2", unit_name: "Colours", results: ["CORRECT", "PARTIALLY_CORRECT"] },
        { unit_key: "S3", unit_name: "Family", results: ["INCORRECT", "PARTIALLY_CORRECT"] },
        { unit_key: "S4", unit_name: "Animals", results: [] },
      ],
      "lesson-1",
      NOW,
    );
    expect(r.units.map((u) => [u.unit_key, u.passed])).toEqual([["S1", true], ["S2", true], ["S3", false], ["S4", false]]);
    expect(r.suggested_start_unit_key).toBe("S3");
    expect(r.all_passed).toBe(false);
    expect(r.units[3].score).toBeNull();
  });

  it("a child who knows nothing starts at the first unit, and one who knows everything is told so", () => {
    expect(computePlacementResult([{ unit_key: "S1", unit_name: "Hello!", results: ["INCORRECT", "NOT_ASSESSED"] }], "l", NOW).suggested_start_unit_key).toBe("S1");
    const all = computePlacementResult([{ unit_key: "S1", unit_name: "a", results: ["CORRECT"] }, { unit_key: "S2", unit_name: "b", results: ["CORRECT", "CORRECT"] }], "l", NOW);
    expect(all.all_passed).toBe(true);
    expect(all.suggested_start_unit_key).toBeNull();
  });

  it("only a confirmed start skips units; pending checks and suggestions skip nothing", () => {
    const units = ["S1", "S2", "S3"];
    expect(placedOutUnitKeys(units, { ...newPlacement("TEST", NOW), status: "SET", start_unit_key: "S3" })).toEqual(new Set(["S1", "S2"]));
    expect(placedOutUnitKeys(units, newPlacement("TEST", NOW)).size).toBe(0);
    expect(placedOutUnitKeys(units, { ...newPlacement("TEST", NOW), status: "RESULT_READY", start_unit_key: "S3" }).size).toBe(0);
    expect(placedOutUnitKeys(units, newPlacement("BEGINNER", NOW)).size).toBe(0);
    expect(placedOutUnitKeys(units, null).size).toBe(0);
  });

  it("probes one objective per unit, in order, and reads stored placements leniently", () => {
    const probes = placementProbes([{ unitKey: "S1", id: "a" }, { unitKey: "S1", id: "b" }, { unitKey: "S2", id: "c" }]);
    expect(probes.map((p) => p.id)).toEqual(["a", "c"]);
    expect(newPlacement("TEST", NOW).status).toBe("PENDING_TEST");
    expect(newPlacement("BEGINNER", NOW).status).toBe("SET");
    expect(placementOf({ placement: newPlacement("CHOSEN", NOW) })?.method).toBe("CHOSEN");
    expect(placementOf({})).toBeNull();
    expect(placementOf({ placement: { nonsense: true } })).toBeNull();
  });
});
