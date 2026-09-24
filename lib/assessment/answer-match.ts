/**
 * System grading of short answers, typed or spoken. Pure and deterministic:
 * no model decides a checkable answer.
 *
 * A match is either exact (after normalisation) or a phrase match: the
 * accepted answer appears as whole words inside a short response ("a cat",
 * "it's a cat" for "cat"). Spoken answers need this; typed answers benefit.
 * A negation the accepted answer does not contain ("not a cat") never
 * matches, and a response much longer than the answer does not either.
 *
 * v2: a near miss (one or two letters off, as a young learner's accent or a
 * plural slip comes out in a transcript: "mondei", "cats") is partial credit,
 * not a wrong answer. Numbers are never near: 13 for 30 is a real mistake.
 */
export const ANSWER_MATCH_POLICY = { version: "answer-match.v2", maxExtraWords: 3 } as const;

const NUMBER_WORDS: Record<string, string> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  eleven: "11", twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15", sixteen: "16", seventeen: "17", eighteen: "18", nineteen: "19", twenty: "20",
};
const NEGATIONS = new Set(["not", "no", "never", "dont", "doesnt", "isnt", "arent", "cant", "wont", "didnt", "nt"]);

export function normalizeAnswer(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/n't\b/g, "nt")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => NUMBER_WORDS[w] ?? w);
}

export type AnswerMatch = { match: boolean; method: "exact" | "phrase" | "near" | "none"; result: "CORRECT" | "PARTIALLY_CORRECT" | "INCORRECT" };

const NONE: AnswerMatch = { match: false, method: "none", result: "INCORRECT" };

/** Edit distance, for short strings only. */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}

/** Letters allowed off for a near miss: one for short words, two for longer ones. */
const nearBudget = (len: number) => (len < 3 ? 0 : len <= 5 ? 1 : 2);

function isNear(got: string[], want: string[]): boolean {
  if (want.some((w) => /\d/.test(w))) return false;
  const target = want.join("");
  const budget = nearBudget(target.length);
  if (budget === 0) return false;
  for (let size = Math.max(1, want.length - 1); size <= want.length + 1; size++) {
    for (let i = 0; i + size <= got.length; i++) {
      const window = got.slice(i, i + size);
      if (window.some((w) => /\d/.test(w))) continue;
      if (distance(window.join(""), target) <= budget) return true;
    }
  }
  return false;
}

export function matchAnswer(response: string, accepted: string[]): AnswerMatch {
  const got = normalizeAnswer(response);
  if (got.length === 0) return NONE;
  const negated = got.some((w) => NEGATIONS.has(w));
  for (const a of accepted) {
    const want = normalizeAnswer(a);
    if (want.length === 0) continue;
    if (want.join(" ") === got.join(" ")) return { match: true, method: "exact", result: "CORRECT" };
    if (negated && !want.some((w) => NEGATIONS.has(w))) continue;
    if (got.length - want.length > ANSWER_MATCH_POLICY.maxExtraWords) continue;
    for (let i = 0; i + want.length <= got.length; i++) {
      if (want.every((w, j) => got[i + j] === w)) return { match: true, method: "phrase", result: "CORRECT" };
    }
  }
  for (const a of accepted) {
    const want = normalizeAnswer(a);
    if (want.length === 0) continue;
    if (negated && !want.some((w) => NEGATIONS.has(w))) continue;
    if (got.length - want.length > ANSWER_MATCH_POLICY.maxExtraWords) continue;
    if (isNear(got, want)) return { match: false, method: "near", result: "PARTIALLY_CORRECT" };
  }
  return NONE;
}
