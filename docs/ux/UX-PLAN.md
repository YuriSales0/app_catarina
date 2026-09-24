# Plano de UX e interface

Objetivo: trocar a interface técnica por uma experiência suave e acolhedora,
pensada para famílias brasileiras e crianças de 6 a 11 anos, sem perder o que
torna o produto sério: cada status vem de evidência, e a IA decide só **como**
ensinar.

## Princípios

1. **Duas vozes, um produto.** O adulto vê clareza e confiança; a criança vê
   brincadeira e conquista. A criança nunca vê status, porcentagens ou ids.
2. **Uma ação principal por tela.** Cada tela responde "o que eu faço agora?".
3. **Linguagem de família, não de sistema.** "Dominou" em vez de MASTERED,
   "Como foi a aula" em vez de Report. Detalhes técnicos continuam acessíveis,
   recolhidos.
4. **Evidência visível, sem jargão.** "Por que esta aula?" em frases simples;
   a pontuação do motor fica num "ver detalhes".
5. **Suave e acessível.** Cores pastel com contraste AA no texto, cantos
   arredondados, tipografia grande e arredondada, alvos de toque de 48 px no
   modo criança, respeito a `prefers-reduced-motion`.

## Identidade visual

| Elemento | Decisão |
| --- | --- |
| Fundo | Creme quente (`#FBF7F0`), superfícies brancas |
| Cor principal | Índigo suave (`#5B5BD6`) |
| Apoio | Céu, menta, pêssego, sol e lavanda, em tons pastel para áreas e ilustrações |
| Texto | Ameixa escura (`#2D2A3E`), nunca preto puro |
| Tipografia | Nunito (interface) e Fredoka (títulos e modo criança), auto-hospedadas |
| Forma | Cantos 16–28 px, sombras leves, botões em pílula |
| Mascote | **Lumi**, uma coruja que guia a criança, explica cada etapa e comemora |
| Avatares | Cada criança escolhe um bicho (raposa, gato, panda, coelho, leão, sapo, polvo, unicórnio) e uma cor |
| Modo escuro | Mantido para o adulto, com os mesmos tokens |

Status do objetivo, sempre com cor e rótulo fixos:

| Sistema | Rótulo | Ideia |
| --- | --- | --- |
| NOT_STARTED | Ainda não começou | semente |
| INTRODUCED | Conheceu | broto |
| PRACTISING | Praticando | folha |
| DEVELOPING | Ganhando confiança | planta |
| PROFICIENT | Consegue sozinha | flor |
| MASTERED | Dominou | estrela |

## Jornada

### 1. Landing page (`/`)
Pública. Seções:
- **Hero:** "Inglês de verdade, no ritmo do seu filho", com CTA "Começar".
- **Como funciona:** três passos (planejamos, a criança pratica, você acompanha).
- **Para a criança / para a família.**
- **Evidência, não achismo:** o diferencial.
- **Níveis Cambridge:** Pre A1 Starters e A1 Movers.
- **Planos:** "Tutor" (use sua própria assinatura de IA) e "Tutor Particular"
  (IA dentro do app), os dois marcados "em breve", sem preço inventado.
- **Perguntas frequentes e CTA final.**

Quem já está logado vê "Ir para o painel".

### 2. Entrada (`/login`)
Cartão único com o Lumi, textos em português, os métodos disponíveis e o erro
explicado em linguagem simples.

### 3. Primeiros passos (`/boas-vindas`)
Aparece automaticamente quando a conta não tem nenhuma criança. Quatro passos
curtos com indicador de progresso:
1. **Quem vai aprender?** Nome, data de nascimento, bicho e cor.
2. **Ponto de partida.** Starters ou Movers, com sugestão pela idade, e a
   duração da aula (10, 15, 20 ou 30 min). Matéria e idiomas vêm prontos
   (inglês ensinado em português).
3. **Aula com IA.** Explicação honesta do que a IA recebe e do que ela não
   pode fazer, com o consentimento opcional.
4. **Tudo pronto.** Botão "Começar a primeira aula", que cria a aula pelo
   motor e abre o modo criança.

### 4. Dia a dia (`/dashboard`, "Início")
- Saudação pelo horário.
- Um cartão por criança com avatar, **"Aula de hoje"** em um clique
  (continuar, começar a próxima ou fazer revisão), a semana em bolinhas (dias
  com aula), o anel de progresso da trilha e os objetivos em foco com rótulos
  amigáveis.
- **Sugestões** do motor, recolhidas, com aceitar ou dispensar.
- Atalho **"Modo criança"** (`/criancas`): a criança escolhe o próprio avatar
  e entra direto na aula do dia.

### 5. Aula no modo criança (`/play/[id]`)
- Barra de estrelas mostrando as etapas; Lumi fala a instrução em português.
- **Com IA ligada**, cada etapa é preparada automaticamente pela API: título,
  introdução para a criança e itens.
  - Itens com resposta conferível (palavra ou frase): a criança digita, e o
    **sistema** corrige por comparação exata, sem modelo.
  - Itens abertos (conversa): o adulto marca "Acertou", "Quase" ou "Ainda não".
- **Sem IA**, os exemplos do currículo viram cartões, e o adulto marca cada um.
- Feedback imediato e gentil ("Muito bem!" ou "Quase! Vamos tentar de novo?").
- **Final com comemoração:** estrelas conquistadas, Lumi, confete (desligado
  com movimento reduzido) e o link "Adulto: ver como foi".

### 6. Aula na visão do adulto (`/lessons/[id]`)
Roteiro em passos numerados, notas de ensino recolhidas, registro de
tentativas em cada passo, anotação rápida e encerramento. O log técnico fica
recolhido em "Registro técnico".

### 7. Feedback (`/lessons/[id]/report`, "Como foi a aula")
- Resumo em chips: duração, tentativas e taxa de acerto.
- **O que aconteceu** (calculado da evidência, nunca escrito por modelo),
  **O que isso pode indicar** (inferências, com a fonte) e **Próximos passos**
  (propostas).
- Com IA: botão "Pedir comentário da IA", que acrescenta um texto sem mudar o
  observado.

### 8. Desenvolvimento (`/students/.../progress`)
- Resumo da trilha: quantos objetivos em cada estágio, com barra empilhada.
- **Trilha por unidade:** cada objetivo é uma "pedra" colorida pelo estágio.
- **Habilidades** (ouvir, falar, ler, escrever) em barras.
- **Conquistas recentes:** avanços de estágio com data.
- O detalhe técnico de cada objetivo continua a um clique.

### 9. Próxima aula e perfil
- **Próxima aula:** objetivo, roteiro e "Por que esta aula?" em frases
  simples; a pontuação e as alternativas ficam recolhidas.
- **Perfil da criança:** avatar, matrícula por cartões de nível, acesso de
  outros adultos, IA e dados.

## Fora deste ciclo
- Voz (entrada e saída), planos e cobrança, e a ponte com assinatura externa:
  estão no roadmap.
- Tradução completa das telas técnicas (Estúdio de currículo, Context Pack):
  recebem o novo visual e títulos em português, mas o conteúdo técnico segue
  em inglês.
