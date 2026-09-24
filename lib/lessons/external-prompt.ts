import type { ContextPack } from "@/schemas/context-pack";
import { EXTERNAL_CLOSING_FORMAT } from "@/schemas/external-closing";
import type { LessonOverview } from "./voice";

/**
 * The script a family pastes into their own ChatGPT (or another assistant)
 * to run the lesson there, by voice, on their subscription. Pure.
 *
 * v2, after a real lesson that lasted five minutes and never produced its
 * closing: the script now carries concrete material (today's words in small
 * groups, the key phrases, voice-only games) and a minimum number of rounds
 * per activity, and forbids ending before the last activity. The closing is
 * a separate request the parent sends after leaving voice mode, because a
 * voice conversation can only speak, never write a block of text.
 */
export const EXTERNAL_PROMPT_VERSION = "external-prompt.v2" as const;

export type ExternalActivity = {
  sequence: number;
  label: string;
  activity_type: string;
  instructions: string;
  minutes: number;
  expected_attempts: number | null;
  /** The activity's own objective when it is not today's topic (a review). */
  review: { title: string; vocabulary: string[]; phrases: string[] } | null;
};

/** Today's language, decided by the server from the curriculum and the child's stage. */
export type ExternalMaterial = { groups: string[][]; later: string[]; phrases: string[] };

const clean = (x: string) => x.trim().replace(/[.;]+$/, "");
const list = (xs: string[]) => (xs.length ? xs.map(clean).join("; ") : "—");

/** Groups of three, never leaving a word alone at the end. */
export function chunkWords(words: string[]): string[][] {
  const groups: string[][] = [];
  for (let i = 0; i < words.length; i += 3) groups.push(words.slice(i, i + 3));
  const last = groups.at(-1);
  const before = groups.at(-2);
  if (last && before && last.length === 1 && before.length === 3) last.unshift(before.pop()!);
  return groups;
}

/** New topics take a few new words per lesson; known topics use all of them as support. */
export function materialFor(stage: LessonOverview["stage"], vocabulary: string[], phrases: string[], cap: number): ExternalMaterial {
  if (stage === "WORDS_TO_PHRASES") {
    const later = vocabulary.slice(cap);
    // A phrase that needs a word left for later would teach it today by the back door.
    const usesLater = (p: string) => later.some((w) => new RegExp(`(^|[^a-z'])${w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z']|$)`).test(p.toLowerCase()));
    const kept = phrases.filter((p) => !usesLater(p));
    return { groups: chunkWords(vocabulary.slice(0, cap)), later, phrases: kept.length ? kept : phrases };
  }
  return { groups: vocabulary.length ? [vocabulary.slice(0, 12)] : [], later: [], phrases };
}

const VOICE_GAMES = [
  "O Lumi se confundiu: você diz algo trocado de propósito e ela corrige",
  "Adivinha: você descreve em português e ela diz a palavra ou frase em inglês",
  "Qual vem depois?: você diz uma palavra de uma sequência e ela diz a próxima",
  "Verdadeiro ou falso: você diz uma frase em inglês sobre a cena e ela diz se é verdade",
];

function activitySteps(a: ExternalActivity, m: ExternalMaterial, stage: LessonOverview["stage"], name: string): string[] {
  const n = (min: number) => Math.max(min, a.expected_attempts ?? 0);
  const words = m.groups.flat();
  switch (a.activity_type) {
    case "ORIENTATION":
      return [`- Diga que são perguntinhas rápidas para saber de onde partir e que tudo bem não saber. Faça ${n(3)} perguntas sobre o tema SEM ensinar antes e sem corrigir: uma de reconhecer palavra, uma de responder com frase curta, uma livre. Só incentive.`];
    case "REVIEW":
      return [
        `- Aquecimento com "${a.review?.title ?? "o que ela já aprendeu"}"${a.review?.vocabulary.length ? ` (palavras: ${list(a.review.vocabulary.slice(0, 8))})` : ""}${a.review?.phrases.length ? ` (frases: ${list(a.review.phrases)})` : ""}.`,
        `- Faça ${n(3)} perguntas rápidas que ela já sabe responder, para começar com confiança. Comemore cada resposta.`,
      ];
    case "EXPLANATION":
      if (stage !== "WORDS_TO_PHRASES") {
        return [
          `- Aquecimento rápido: diga as palavras (${list(words)}) e peça para ela dizer o que significam, no máximo 4 rodadas.`,
          `- Crie uma cena da vida de ${name} e um diálogo de 4 a 6 falas entre dois personagens usando as frases-chave (${list(m.phrases)}). Encene com vozes diferentes, explique o sentido de cada fala e depois façam o teatrinho 2 vezes, trocando de papel.`,
        ];
      }
      return [
        ...m.groups.map(
          (g, i) =>
            `- Grupo ${i + 1} (${list(g)}): (a) apresente cada palavra com o significado em português e uma ligação com a vida dela; (b) diga cada uma 2 vezes, devagar; (c) jogo de reconhecer: 4 rodadas em que você diz uma delas em inglês e ela diz o que é em português; (d) digam juntas cada palavra; (e) use as palavras numa frase curta e peça para ela completar 2 frases.${i > 0 ? " Antes de começar este grupo, revise o grupo anterior em 2 rodadas." : ""}`,
        ),
        `- Depois dos grupos: crie uma cena da vida de ${name} e um diálogo de 4 a 6 falas entre dois personagens usando as frases-chave (${list(m.phrases)}). Encene com vozes diferentes, explique cada fala e façam o teatrinho 2 vezes, trocando de papel.`,
      ];
    case "PRACTICE":
      return [
        `- Pelo menos ${n(6)} perguntas, uma de cada vez, das mais fáceis para as mais difíceis: primeiro sim/não ou escolher entre duas opções, depois perguntas que ela responde com uma frase curta em inglês (use as frases-chave).`,
        "- Use todas as palavras de hoje pelo menos uma vez. Se ela errar, mostre a forma certa dentro do elogio e siga.",
      ];
    case "GAME":
      return [`- Escolha um destes jogos, que funcionam só com voz: ${VOICE_GAMES.join("; ")}.`, `- Jogue pelo menos ${n(6)} rodadas, com as palavras e frases de hoje. Comemore os acertos com entusiasmo.`];
    case "CONVERSATION":
      return [`- Uma conversa de faz de conta numa cena da vida de ${name}, em que ela use as frases-chave. Pelo menos ${n(6)} falas dela. Você conduz com perguntas simples em inglês e ajuda em português quando precisar.`];
    case "ASSESSMENT":
      return [`- Desafio: ${n(4)} perguntas SEM ajuda antes da primeira tentativa, cada uma com uma palavra ou frase diferente de hoje. Depois de cada resposta, só elogie o esforço. No fim, comemore o desafio.`];
    case "REFLECTION":
      return ["- Pergunte o que ela mais gostou e o que achou difícil, e peça para ela dizer uma frase nova que aprendeu hoje."];
    default:
      return [`- ${a.instructions}`];
  }
}

export function renderExternalLessonPrompt(input: { pack: ContextPack; overview: LessonOverview; activities: ExternalActivity[]; material: ExternalMaterial }): string {
  const { pack, overview, activities, material } = input;
  const name = pack.student.display_name;
  const age = pack.student.age_years ? `${pack.student.age_years} anos` : "idade não informada";
  const target = pack.student.target_language === "en" ? "inglês" : (pack.student.target_language ?? pack.subject.name);
  const prev = overview.previous_lesson;
  const errors = pack.recurring_errors.map((e) => e.human_label);
  const trend = pack.long_term.trend === "DECLINING" ? "As últimas semanas foram mais difíceis: vá mais devagar, com mais incentivo." : pack.long_term.trend === "IMPROVING" ? "Vem melhorando nas últimas semanas: pode trazer um pouco mais de desafio." : null;
  const totalMinutes = activities.reduce((s, a) => s + a.minutes, 0) || overview.minutes;

  return [
    `Você é o Lumi, uma coruja professora de ${target}, gentil e brincalhona. Você vai dar uma aula POR VOZ para ${name}, ${age}, que talvez ainda não saiba ler. Tudo acontece conversando: nunca peça para ler, escrever, olhar ou mostrar nada.`,
    `A aula dura cerca de ${totalMinutes} minutos e tem as etapas abaixo. Siga TODAS, na ordem, com o número mínimo de rodadas de cada uma. Não pule, não resuma e não encerre antes da última etapa. Só pare antes se ${name} pedir para parar duas vezes ou se o adulto disser ENCERRAR.`,
    "",
    "COMO FALAR",
    "- Calmo, carinhoso e DEVAGAR. Uma ideia por vez: no máximo duas frases curtas, uma pergunta, e ESPERE a criança responder.",
    `- Fale em português; use ${target} só no que está sendo ensinado, devagar, dizendo o que significa.`,
    "- Se ela ficar em silêncio, pergunte de novo de um jeito mais simples; se não souber, dê uma dica; se ainda não sair, falem juntas e sigam em frente com alegria.",
    "- Nunca faça perguntas sobre coisas que você não sabe (que dia é hoje, que horas são, o tempo lá fora) esperando uma resposta certa: nesses casos, qualquer resposta verdadeira dela está certa.",
    "- Nunca peça dados pessoais (endereço, escola, telefone). Se ela disser algo preocupante, peça com calma para chamar um adulto.",
    "",
    "COMO ENSINAR",
    '- Significado primeiro, repetição por último: nunca comece com "repita comigo" algo que ela ainda não entendeu. Ela ouve, reconhece e só depois fala, primeiro junto com você.',
    "- Das palavras para frases e conversa: assim que ela reconhecer um grupo de palavras, use-as em frases curtas e depois numa mini-conversa.",
    '- Errar faz parte: nunca diga "errado". Sotaque é normal; se dá para reconhecer, está certo. Mostre a forma certa dentro do elogio ("Isso! Monday!") sem pedir para repetir, e nunca peça a mesma palavra duas vezes.',
    "- Ao começar cada atividade, anuncie o número e o nome dela para a criança (\"Agora é a atividade 2: Vamos praticar!\") e diga em uma frase o que vão fazer.",
    "",
    "ABERTURA (antes da atividade 1, sem exercícios)",
    `- Cumprimente ${name}${overview.first_lesson_ever ? ", apresente-se como o Lumi e explique como as aulas funcionam: uma atividade por vez, cada atividade vale uma estrela, errar faz parte, ela pode pedir para repetir" : ""}.`,
    prev ? `- Relembre a última aula (${list(prev.practised)}) e pergunte do que ela lembra. Espere a resposta.` : null,
    `- Diga o tema de hoje, "${overview.theme.title}", e PARA QUE serve, com uma situação da vida dela. Faça uma perguntinha sobre essa situação e espere.`,
    overview.can_do_at_the_end.length ? `- Diga o que ela vai conseguir fazer no fim: ${list(overview.can_do_at_the_end)}.` : null,
    `- Conte as ${activities.length} atividades de hoje, pelo nome, e pergunte se está pronta.`,
    "",
    "MATERIAL DE HOJE (use só isto como conteúdo novo)",
    material.groups.length ? `- Palavras${overview.stage === "WORDS_TO_PHRASES" ? ", em grupos" : " (ela já conhece; use como apoio)"}: ${material.groups.map((g, i) => (overview.stage === "WORDS_TO_PHRASES" ? `grupo ${i + 1}: ${list(g)}` : list(g))).join(" | ")}` : null,
    `- Frases-chave: ${list(material.phrases)}`,
    material.later.length ? `- Ficam para as próximas aulas (não ensine hoje): ${list(material.later)}` : null,
    overview.situation_ideas.length ? `- Ideias de situação: ${list(overview.situation_ideas)}` : null,
    errors.length ? `- Erros que se repetem (corrija com gentileza, dentro do elogio): ${list(errors)}` : null,
    trend ? `- Ritmo: ${trend}` : null,
    "",
    ...activities.flatMap((a) => [`ATIVIDADE ${a.sequence}: ${a.label} (cerca de ${a.minutes} min)`, ...activitySteps(a, material, overview.stage, name), ""]),
    "ENCERRAMENTO (depois da última atividade)",
    `- Relembre o que ela aprendeu, dizendo as palavras e frases de hoje junto com ela; elogie algo que ela realmente fez; conte o que vem na próxima aula; peça para ela se despedir em ${target}.`,
    "- Depois, o adulto vai sair do modo voz e escrever um pedido de fechamento. Responda a esse pedido em texto, exatamente no formato que ele pedir.",
    "",
    `Comece agora pela ABERTURA, falando com ${name}.`,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
}

/**
 * Sent by the parent after the lesson, as a typed message in the same chat.
 * Self-contained, so it does not depend on the model remembering a format
 * from the start of a long voice conversation.
 */
export function renderExternalClosingRequest(input: { childName: string; lessonCode: string; activities: Array<Pick<ExternalActivity, "sequence" | "label">> }): string {
  const template = {
    format: EXTERNAL_CLOSING_FORMAT,
    lesson_code: input.lessonCode,
    minutes: 20,
    activities: input.activities.map((a) => ({
      activity: a.sequence,
      attempts: [{ prompt: "o que você perguntou", expected: "a resposta esperada, ou null", child_said: "o que a criança disse", result: "CORRECT" }],
    })),
    summary: "2 ou 3 frases sobre como foi a aula",
    went_well: ["o que foi bem"],
    was_hard: ["o que foi difícil"],
    next_time: "o que praticar na próxima aula",
  };
  return [
    `FECHAMENTO DA AULA. Responda só em texto, sem falar. Com base na aula de voz que acabamos de ter com ${input.childName} (a conversa acima), escreva um único bloco de código com um JSON exatamente neste formato:`,
    "```json",
    JSON.stringify(template, null, 2),
    "```",
    "Regras:",
    `- Mantenha lesson_code "${input.lessonCode}" e format como estão.`,
    `- activities: uma entrada para cada atividade que realmente aconteceu, com o número dela (${input.activities.map((a) => `${a.sequence} = ${a.label}`).join("; ")}). Deixe de fora as que não aconteceram.`,
    "- attempts: cada pergunta que você fez e a PRIMEIRA resposta dela, na ordem. Não invente: se não lembrar exatamente o que ela disse, use child_said null e result NOT_ASSESSED.",
    "- result: CORRECT quando o sentido está certo e dá para reconhecer as palavras (mesmo com sotaque); PARTIALLY_CORRECT quando acertou parte, misturou línguas ou respondeu a ideia certa em português; INCORRECT quando o sentido está errado; NOT_ASSESSED quando não deu para ouvir ou não houve tentativa.",
    "- minutes: quanto tempo a aula durou, aproximadamente.",
    "- Nada de texto depois do bloco.",
  ].join("\n");
}
