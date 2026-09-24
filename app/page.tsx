import Link from "next/link";
import { getActor } from "@/lib/auth/session";
import { Logo, Lumi } from "@/components/brand/lumi";
import { STATUS, TONE } from "@/lib/copy/pt";

/** Public landing page. Honest claims only: no invented numbers, prices or testimonials. */
export default async function Home() {
  const actor = await getActor();
  const cta = actor ? { href: "/dashboard", label: "Ir para o painel" } : { href: "/login", label: "Começar agora" };

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-5">
        <Logo />
        <nav aria-label="Página" className="hidden items-center gap-6 text-sm font-bold text-muted md:flex">
          <a href="#como-funciona" className="hover:text-foreground">
            Como funciona
          </a>
          <a href="#adaptacao" className="hover:text-foreground">
            Como se adapta
          </a>
          <a href="#niveis" className="hover:text-foreground">
            Níveis
          </a>
          <a href="#planos" className="hover:text-foreground">
            Planos
          </a>
          <a href="#perguntas" className="hover:text-foreground">
            Perguntas
          </a>
        </nav>
        <Link href={actor ? "/dashboard" : "/login"} className="btn btn-secondary">
          {actor ? "Meu painel" : "Entrar"}
        </Link>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pt-8 pb-20 lg:grid-cols-[1.1fr_1fr] lg:pt-16">
          <div aria-hidden className="pointer-events-none absolute -top-24 -left-32 h-80 w-80 rounded-full bg-lavender blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute top-40 -right-24 h-72 w-72 rounded-full bg-peach blur-3xl" />
          <div className="relative">
            <p className="badge mb-5 border-transparent bg-mint text-mint-ink">Inglês para crianças · alinhado aos níveis Cambridge</p>
            <h1 className="font-display text-4xl leading-[1.08] font-semibold tracking-tight sm:text-5xl lg:text-6xl">
              Inglês de verdade, <span className="text-primary">no ritmo</span> do seu filho.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted">
              Aulas curtas e divertidas, planejadas a partir do que a criança já mostrou que sabe. Para ela, brincadeira. Para você, clareza sobre cada passo.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={cta.href} className="btn btn-primary btn-lg">
                {cta.label}
              </Link>
              <a href="#como-funciona" className="btn btn-secondary btn-lg">
                Como funciona
              </a>
            </div>
            <p className="mt-4 text-xs text-muted">Hoje o acesso é por convite.</p>
          </div>

          <HeroIllustration />
        </section>

        {/* How it works */}
        <section id="como-funciona" className="scroll-mt-8 bg-surface py-20">
          <div className="mx-auto w-full max-w-6xl px-4">
            <p className="eyebrow text-center">Como funciona</p>
            <h2 className="mt-2 text-center font-display text-3xl font-semibold sm:text-4xl">Três passos, todo dia um pouquinho</h2>
            <ol className="mt-12 grid gap-6 md:grid-cols-3">
              {[
                { n: 1, emoji: "🧭", tone: "sky" as const, title: "A gente planeja a aula", text: "O app escolhe o próximo passo pelo que a criança já demonstrou, respeitando o que precisa vir antes e o que está na hora de revisar." },
                { n: 2, emoji: "🎈", tone: "peach" as const, title: "A criança pratica brincando", text: "O Lumi guia 10 a 20 minutos de atividades: conhecer, praticar, jogar e conversar. Cada acerto vira uma estrela." },
                { n: 3, emoji: "🌱", tone: "mint" as const, title: "Você acompanha a evolução", text: "Depois de cada aula, um resumo claro: o que aconteceu, o que isso pode indicar e o que vem a seguir." },
              ].map((s) => (
                <li key={s.n} className="card relative">
                  <span className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl text-2xl ${TONE[s.tone].bg}`} aria-hidden>
                    {s.emoji}
                  </span>
                  <p className="mt-5 text-xs font-bold text-muted">Passo {s.n}</p>
                  <h3 className="mt-1 font-display text-xl font-semibold">{s.title}</h3>
                  <p className="mt-2 text-sm text-muted">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* For the child, for the family */}
        <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-20 md:grid-cols-2">
          <div className="rounded-[2rem] bg-lavender p-8">
            <p className="eyebrow text-lavender-ink">Para a criança</p>
            <h2 className="mt-2 font-display text-3xl font-semibold">Uma aventura, não uma prova</h2>
            <ul className="mt-6 space-y-3 text-sm">
              {["Um guia simpático, o Lumi, que explica em português e comemora cada conquista", "Telas grandes, sem números, notas ou comparações", "Atividades curtas que mudam de formato para ninguém cansar", "Um avatar só dela, escolhido por ela"].map((t) => (
                <li key={t} className="flex gap-3">
                  <span aria-hidden className="mt-0.5">⭐</span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-[2rem] bg-sky p-8">
            <p className="eyebrow text-sky-ink">Para a família</p>
            <h2 className="mt-2 font-display text-3xl font-semibold">Clareza sem precisar ser professor</h2>
            <ul className="mt-6 space-y-3 text-sm">
              {["Você vê o que foi praticado, o que já foi dominado e o que pede revisão", "Cada avanço mostra as tentativas que o justificam", "Sugestões práticas do que fazer no dia a dia", "Você decide se usa IA, e pode exportar ou apagar os dados quando quiser"].map((t) => (
                <li key={t} className="flex gap-3">
                  <span aria-hidden className="mt-0.5">✓</span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Evidence */}
        <section className="bg-surface py-20">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 lg:grid-cols-2">
            <div>
              <p className="eyebrow">Nosso jeito</p>
              <h2 className="mt-2 font-display text-3xl font-semibold sm:text-4xl">Evidência, não achismo</h2>
              <p className="mt-4 text-muted">
                A memória do aprendizado não fica num chat. Fica num registro de tudo o que a criança tentou. A inteligência artificial ajuda a decidir <strong className="text-foreground">como</strong> ensinar. O que foi aprendido quem mostra são as tentativas da própria criança.
              </p>
              <ul className="mt-6 space-y-4 text-sm">
                <li className="flex gap-3">
                  <span className="text-xl" aria-hidden>
                    🧩
                  </span>
                  <span>
                    <strong>Uma coisa de cada vez.</strong> Nada novo antes de o que vem antes estar firme.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-xl" aria-hidden>
                    🔁
                  </span>
                  <span>
                    <strong>Revisão na hora certa.</strong> O que foi aprendido volta depois de alguns dias, para não ser esquecido.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-xl" aria-hidden>
                    ⭐
                  </span>
                  <span>
                    <strong>&ldquo;Dominou&rdquo; é para valer.</strong> Só depois de mostrar sem ajuda e lembrar semanas depois.
                  </span>
                </li>
              </ul>
            </div>
            <div className="card">
              <p className="eyebrow">A trilha de cada objetivo</p>
              <ol className="mt-5 space-y-2">
                {(Object.keys(STATUS) as Array<keyof typeof STATUS>).map((k, i) => (
                  <li key={k} className="flex items-center gap-3">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg ${TONE[STATUS[k].tone].bg}`} aria-hidden>
                      {STATUS[k].emoji}
                    </span>
                    <span className="font-bold">{STATUS[k].label}</span>
                    <span className="ml-auto h-2 w-24 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                      <span className="block h-full rounded-full bg-primary/60" style={{ width: `${((i + 1) / 6) * 100}%` }} />
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* How lessons adapt */}
        <section id="adaptacao" className="mx-auto w-full max-w-6xl scroll-mt-8 px-4 py-20">
          <p className="eyebrow text-center">Como a aula se adapta</p>
          <h2 className="mt-2 text-center font-display text-3xl font-semibold sm:text-4xl">Começa bem, lembra de tudo, fala do jeito certo</h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              {
                emoji: "🗺️",
                tone: "peach" as const,
                title: "Aula inaugural e abertura de cada módulo",
                text: "Na primeira aula e no começo de cada módulo, o Lumi explica como tudo funciona, mostra o que vem pela frente e faz um diagnóstico rápido. Se o nível não parecer certo, você recebe um aviso para ajustar. Quem decide é sempre você.",
              },
              {
                emoji: "🧠",
                tone: "lavender" as const,
                title: "Memória de curto e de longo prazo",
                text: "A cada tentativa, o progresso é recalculado. A cada aula, um relatório. E a cada semana, uma visão da evolução que orienta o ritmo das próximas aulas, inclusive o da IA.",
              },
              {
                emoji: "✨",
                tone: "mint" as const,
                title: "Qualidade da conversa: Padrão ou Alto",
                text: "Escolha o nível da IA para cada criança. Padrão para exercícios e correções rápidas; Alto para conversa aberta, correção com nuance e comentários mais ricos.",
              },
            ].map((c) => (
              <div key={c.title} className="card">
                <span className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl text-2xl ${TONE[c.tone].bg}`} aria-hidden>
                  {c.emoji}
                </span>
                <h3 className="mt-5 font-display text-xl font-semibold">{c.title}</h3>
                <p className="mt-2 text-sm text-muted">{c.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Levels */}
        <section id="niveis" className="scroll-mt-8 bg-surface py-20">
          <div className="mx-auto w-full max-w-6xl px-4">
          <p className="eyebrow text-center">Níveis</p>
          <h2 className="mt-2 text-center font-display text-3xl font-semibold sm:text-4xl">Alinhado aos níveis Cambridge para crianças</h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              { name: "Pre A1 Starters", age: "a partir de 6 anos", text: "Primeiro contato: cumprimentos, cores, números, família, animais, frases simples.", tone: "mint" as const, soon: false },
              { name: "A1 Movers", age: "a partir de 8 anos", text: "Frases mais longas, rotina, passado simples, descrever pessoas e lugares.", tone: "sky" as const, soon: false },
              { name: "A2 Flyers", age: "a partir de 9 anos", text: "Contar histórias, comparar, dar opiniões e entender textos curtos.", tone: "lavender" as const, soon: true },
            ].map((l) => (
              <div key={l.name} className={`rounded-[2rem] p-7 ${TONE[l.tone].bg}`}>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-2xl font-semibold">{l.name}</h3>
                  {l.soon ? <span className="badge">em breve</span> : null}
                </div>
                <p className={`mt-1 text-sm font-bold ${TONE[l.tone].ink}`}>{l.age}</p>
                <p className="mt-4 text-sm">{l.text}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-muted">Conteúdo alinhado aos níveis Cambridge English Young Learners. O Learning OS não é um produto oficial da Cambridge.</p>
          </div>
        </section>

        {/* Plans */}
        <section id="planos" className="scroll-mt-8 py-20">
          <div className="mx-auto w-full max-w-6xl px-4">
            <p className="eyebrow text-center">Planos</p>
            <h2 className="mt-2 text-center font-display text-3xl font-semibold sm:text-4xl">Do seu jeito</h2>
            <div className="mx-auto mt-12 grid max-w-4xl gap-6 md:grid-cols-2">
              <Plan
                name="Tutor"
                tagline="Para quem já tem uma assinatura de IA"
                items={["Planejamento de cada aula pelo que a criança já mostrou", "Aula inaugural e abertura de módulo com diagnóstico de nível", "Roteiro pronto para usar no ChatGPT ou no Claude, inclusive por voz", "Você traz o resultado da aula e o app registra a evolução", "Relatórios e evolução semana a semana"]}
              />
              <Plan
                name="Tutor Particular"
                tagline="A aula inteira dentro do app"
                highlight
                items={["Tudo do plano Tutor", "A IA prepara e conduz as atividades dentro do app", "Correção automática das respostas", "Qualidade da conversa: Padrão ou Alto, por criança", "Comentário da IA ao fim de cada aula"]}
              />
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="perguntas" className="mx-auto w-full max-w-3xl scroll-mt-8 px-4 py-20">
          <p className="eyebrow text-center">Perguntas</p>
          <h2 className="mt-2 text-center font-display text-3xl font-semibold sm:text-4xl">Perguntas frequentes</h2>
          <div className="mt-10 space-y-3">
            {[
              { q: "Qual a idade ideal?", a: "A trilha Starters funciona bem a partir dos 6 anos, e a Movers a partir dos 8. No cadastro, sugerimos o nível pela idade, e você pode mudar quando quiser." },
              { q: "Preciso falar inglês para acompanhar?", a: "Não. As instruções são em português, e cada atividade traz exemplos e o que esperar como resposta." },
              { q: "A IA é obrigatória?", a: "Não. Sem IA, o app planeja a aula e você conduz com os exemplos prontos. Com IA, as atividades são preparadas e corrigidas automaticamente. Em nenhum caso a IA decide o que a criança aprendeu." },
              { q: "Como vocês sabem se o nível está certo?", a: "A primeira aula e o começo de cada módulo trazem um diagnóstico rápido, feito antes de qualquer explicação. Se a criança acerta quase tudo ou quase nada, o relatório sugere ajustar o nível. O app nunca troca o nível sozinho." },
              { q: "A IA lembra do que aconteceu nas aulas anteriores?", a: "Quem lembra é o sistema, não a IA. Cada tentativa fica registrada, e antes de cada aula a IA recebe um resumo calculado pelo sistema: o estágio de cada objetivo, os erros que se repetem, a última aula e a evolução das últimas semanas. Assim ela ajusta o ritmo sem inventar histórico." },
              { q: "Quanto tempo por dia?", a: "De 10 a 20 minutos, algumas vezes por semana. Constância vale mais do que aula longa." },
              { q: "E os dados do meu filho?", a: "Guardamos o mínimo: primeiro nome, idade e o histórico de aulas. A IA só recebe dados com o seu consentimento, e você pode exportar ou apagar tudo a qualquer momento." },
            ].map((f) => (
              <details key={f.q} className="card-flat group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-bold marker:content-none">
                  {f.q}
                  <span aria-hidden className="text-primary transition group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm text-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="mx-auto w-full max-w-6xl px-4 pb-20">
          <div className="relative overflow-hidden rounded-[2.5rem] bg-primary px-8 py-14 text-center text-primary-foreground sm:px-16">
            <Lumi size={96} mood="cheer" className="mx-auto animate-float" />
            <h2 className="mt-4 font-display text-3xl font-semibold sm:text-4xl">Pronto para a primeira aula?</h2>
            <p className="mx-auto mt-3 max-w-lg opacity-90">Cadastre a criança em um minuto, e o Lumi prepara a primeira aventura.</p>
            <Link href={cta.href} className="btn btn-lg mt-8 bg-surface text-primary-strong hover:bg-surface-2">
              {cta.label}
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/70 py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 text-xs text-muted">
          <Logo />
          <p>Aprendizagem baseada em evidência. A IA decide como ensinar; o registro mostra o que foi aprendido.</p>
        </div>
      </footer>
    </div>
  );
}

function Plan({ name, tagline, items, highlight = false }: { name: string; tagline: string; items: string[]; highlight?: boolean }) {
  return (
    <div className={`card relative flex flex-col ${highlight ? "border-2 border-primary" : ""}`}>
      <span className="badge absolute top-6 right-6 border-transparent bg-sun text-sun-ink">em breve</span>
      <h3 className="font-display text-2xl font-semibold">{name}</h3>
      <p className="mt-1 text-sm text-muted">{tagline}</p>
      <ul className="mt-6 space-y-3 text-sm">
        {items.map((i) => (
          <li key={i} className="flex gap-3">
            <span aria-hidden className="text-primary">
              ✓
            </span>
            {i}
          </li>
        ))}
      </ul>
    </div>
  );
}

function HeroIllustration() {
  return (
    <div className="relative mx-auto w-full max-w-md" aria-hidden>
      <div className="kid-card relative rotate-1">
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((i) => (
              <span key={i} className={`text-xl ${i <= 3 ? "" : "opacity-25 grayscale"}`}>
                ⭐
              </span>
            ))}
          </div>
          <span className="badge border-transparent bg-peach text-peach-ink">Hora do jogo!</span>
        </div>
        <div className="mt-6 flex items-end gap-3">
          <Lumi size={84} mood="happy" className="animate-float" />
          <div className="mb-4 rounded-3xl rounded-bl-md bg-lavender px-4 py-3 font-display text-lg">Como se diz &ldquo;gato&rdquo; em inglês?</div>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-3">
          {["dog", "cat", "bird"].map((w) => (
            <span key={w} className={`rounded-2xl py-4 text-center font-display text-xl font-semibold ${w === "cat" ? "bg-mint text-mint-ink ring-2 ring-mint-ink/40" : "bg-surface-2"}`}>
              {w}
            </span>
          ))}
        </div>
        <p className="mt-5 text-center font-display text-lg font-semibold text-mint-ink">Muito bem! 🎉</p>
      </div>
      <div className="absolute -top-6 -left-6 rotate-[-6deg] rounded-2xl bg-surface px-4 py-2 text-sm font-bold shadow-lift">⭐ Dominou: Greetings</div>
      <div className="absolute -right-4 -bottom-6 rotate-[4deg] rounded-2xl bg-surface px-4 py-2 text-sm font-bold shadow-lift">🌷 Ganhando confiança: Colours</div>
    </div>
  );
}
