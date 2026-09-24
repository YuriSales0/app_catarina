import { describe, it, expect } from "vitest";
import { speechLangOf } from "@/lib/speech/lang";

describe("speechLangOf", () => {
  it("reads Portuguese instructions with a Portuguese voice", () => {
    expect(speechLangOf("Como se diz gato em inglês?")).toBe("pt-BR");
    expect(speechLangOf("Vamos praticar agora")).toBe("pt-BR");
  });
  it("reads English target language with an English voice", () => {
    expect(speechLangOf("What is this? It is a cat.")).toBe("en-GB");
    expect(speechLangOf("How many apples do you have?")).toBe("en-GB");
  });
  it("falls back when it cannot tell", () => {
    expect(speechLangOf("cat")).toBe("en-GB");
    expect(speechLangOf("cat", "pt-BR")).toBe("pt-BR");
  });
});
