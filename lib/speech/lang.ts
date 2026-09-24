/**
 * Picks a speech voice language for a line of lesson text: Portuguese
 * instructions or English target language. A cheap heuristic, good enough to
 * choose a voice; it decides nothing about learning.
 */
const PT_WORDS = new Set(["o", "a", "os", "as", "de", "do", "da", "que", "e", "é", "você", "voce", "como", "se", "diz", "em", "inglês", "ingles", "para", "com", "não", "nao", "vamos", "qual", "palavra", "repita", "muito", "bem", "agora", "sua", "seu", "um", "uma"]);
const EN_WORDS = new Set(["the", "is", "a", "an", "what", "this", "that", "it", "i", "you", "my", "your", "are", "do", "does", "can", "how", "many", "where", "who", "and", "have", "has", "am", "he", "she", "they", "we"]);

export function speechLangOf(text: string, fallback: "pt-BR" | "en-GB" = "en-GB"): "pt-BR" | "en-GB" {
  if (/[ãõçáéíóúâêô]/i.test(text)) return "pt-BR";
  const words = text.toLowerCase().match(/[a-z']+/g) ?? [];
  let pt = 0;
  let en = 0;
  for (const w of words) {
    if (PT_WORDS.has(w)) pt++;
    if (EN_WORDS.has(w)) en++;
  }
  if (pt === en) return fallback;
  return pt > en ? "pt-BR" : "en-GB";
}
