"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Lumi } from "@/components/brand/lumi";
import { parseShowArgs, type ShowOnScreen } from "@/lib/literacy";
import { VOICE_SCREEN_ES, type VoiceScreenCopy } from "@/lib/copy/es";

/**
 * The live voice lesson, in the browser: microphone in, Lumi's voice out, over
 * WebRTC straight to the voice model with a short-lived secret minted by the
 * server. Hands-free after one tap, so a child who cannot read can do the
 * whole lesson alone. The model's tool calls are forwarded to the server,
 * which decides and records; this component relays and shows state, and
 * keeps the conversation moving: recordings go to the server in the
 * background and the next activity is prepared ahead of time.
 */

type Ticket = { clientSecret: string; callsUrl: string; activitiesTotal: number; completed: number };
type StartResult = { ok: true; ticket: Ticket } | { ok: false; message: string };
type Phase = "idle" | "connecting" | "live" | "paused" | "ending" | "error";
type FunctionCallItem = { type: "function_call"; name: string; call_id: string; arguments: string };
/** The activity as the server handed it over; kept here to answer record_answer without a round trip. */
type ActivityBrief = { activity_number: number; items: Array<{ number: number; kind: string; done: boolean }> };

/** A hard stop so a forgotten tab never keeps a paid session open. */
const MAX_SESSION_MS = 45 * 60_000;
const TRANSCRIPT_WAIT_MS = 1500;

/** The screen's words. Portuguese for the language lessons; Spanish for literacy taught in Spanish. */
const VOICE_SCREEN_PT: VoiceScreenCopy = {
  connecting: "Chamando o Lumi…",
  paused: "Pausado",
  ending: "Até a próxima!",
  speaking: "O Lumi está falando",
  listening: "Estou ouvindo…",
  thinking: "Pensando…",
  yourTurn: "Sua vez! Pode falar",
  hello: (name: string) => `Oi, ${name}!`,
  intro: "A aula de hoje é uma conversa com o Lumi.",
  start: "Conversar",
  again: "De novo",
  startLabel: "Conversar com o Lumi",
  micHint: "Adulto: na primeira vez, o navegador pede permissão para usar o microfone.",
  screenMode: "Fazer pela tela, sem voz",
  pause: "Pausar",
  resume: "Continuar",
  hideCaptions: "Esconder legenda",
  showCaptions: "Mostrar legenda",
  stars: (done: number, total: number) => `${done} de ${total} estrelas`,
  touched: (card: string) => `(A criança tocou no cartão: ${card})`,
  readHere: "Olhe aqui",
};

/** Waits, briefly, for transcripts still on their way. Outside the component: it reads the clock. */
async function waitForTranscripts(pending: { current: number }): Promise<void> {
  const started = Date.now();
  while (pending.current > 0 && Date.now() - started < TRANSCRIPT_WAIT_MS) await new Promise((r) => setTimeout(r, 100));
}

/** Sizes for what Lumi puts on the screen: the shorter it is, the bigger. */
const BOARD_SIZE: Record<Exclude<ShowOnScreen["style"], "choice">, string> = {
  letter: "text-[9rem] leading-none",
  syllable: "text-8xl",
  word: "text-6xl sm:text-7xl",
  sentence: "text-3xl sm:text-4xl leading-snug",
};

export function VoiceLesson({
  lessonId,
  childName,
  total,
  completed,
  start,
  runTool,
  prefetch,
  screenModeHref,
  lang = "pt",
}: {
  lessonId: string;
  childName: string;
  total: number;
  completed: number;
  start: (lessonId: string) => Promise<StartResult>;
  runTool: (lessonId: string, name: string, args: string, heard: string | null) => Promise<Record<string, unknown>>;
  prefetch: (lessonId: string) => Promise<unknown>;
  screenModeHref: string;
  /** "es": the child's screen in Spanish (literacy taught in Spanish). */
  lang?: "pt" | "es";
}) {
  const T = lang === "es" ? VOICE_SCREEN_ES : VOICE_SCREEN_PT;
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [caption, setCaption] = useState("");
  const [showCaptions, setShowCaptions] = useState(true);
  const [stars, setStars] = useState({ done: completed, total });
  /** What Lumi put on the screen (literacy lessons): a letter, syllable, word, sentence or cards. */
  const [board, setBoard] = useState<ShowOnScreen | null>(null);

  const pc = useRef<RTCPeerConnection | null>(null);
  const dc = useRef<RTCDataChannel | null>(null);
  const mic = useRef<MediaStream | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const heard = useRef<string[]>([]);
  const pendingTranscripts = useRef(0);
  /** After finish_lesson: wait for the goodbye to start, then end when it stops. */
  const finishing = useRef<"no" | "awaiting_goodbye" | "goodbye_playing">("no");
  const timers = useRef<number[]>([]);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const activity = useRef<ActivityBrief | null>(null);

  const send = (event: Record<string, unknown>) => {
    if (dc.current?.readyState === "open") dc.current.send(JSON.stringify(event));
  };

  const teardown = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    dc.current?.close();
    pc.current?.getSenders().forEach((s) => s.track?.stop());
    pc.current?.close();
    mic.current?.getTracks().forEach((t) => t.stop());
    pc.current = null;
    dc.current = null;
    mic.current = null;
  }, []);

  useEffect(() => teardown, [teardown]);

  const endLesson = useCallback(() => {
    teardown();
    setPhase("ending");
    router.refresh();
  }, [router, teardown]);

  /** The child's words for this answer: the independent transcript, waiting briefly if it is still on its way. */
  const takeHeard = async (): Promise<string | null> => {
    await waitForTranscripts(pendingTranscripts);
    const said = heard.current.at(-1) ?? null;
    heard.current = [];
    return said;
  };

  /** Server work, in order: recordings, prefetches, then anything that must see them (next activity, finish). */
  const enqueue = <T,>(job: () => Promise<T>): Promise<T> => {
    const run = queue.current.then(job);
    queue.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  /**
   * record_answer is answered at once from the activity the server handed
   * over, so the conversation never waits on the network; the server records
   * the attempt (and grades it) in the background, with the transcript that
   * belongs to this answer.
   */
  const answerLocally = (call: FunctionCallItem): Record<string, unknown> | null => {
    const act = activity.current;
    if (!act) return null;
    let n = NaN;
    try {
      n = Number((JSON.parse(call.arguments) as { item_number?: unknown }).item_number);
    } catch {
      return null;
    }
    const item = act.items.find((it) => it.number === n);
    const progress = () => {
      const left = act.items.filter((it) => it.kind !== "TEACH" && !it.done);
      return { items_left: left.length, activity_complete: left.length === 0, next_item: left[0]?.number ?? null };
    };
    if (!item) return { recorded: false, reason: "unknown_item", items: act.items.length };
    if (item.kind === "TEACH") return { recorded: false, reason: "teach_items_are_not_recorded" };
    if (item.done) return { recorded: false, reason: "already_recorded", ...progress() };
    item.done = true;
    const said = takeHeard();
    void enqueue(async () => runTool(lessonId, call.name, call.arguments, await said)).catch((err) => console.warn("record failed", err));
    return { recorded: true, ...progress() };
  };

  const takeBrief = (result: Record<string, unknown>) => {
    const brief = result.activity as ActivityBrief | undefined;
    if (result.lesson_complete) {
      activity.current = null;
      setStars((s) => ({ ...s, done: s.total }));
      return;
    }
    if (!brief) return;
    activity.current = { ...brief, items: brief.items.map((it) => ({ ...it })) };
    setStars((s) => ({ ...s, done: brief.activity_number - 1 }));
    // While the child works on this activity, the next one is written.
    void enqueue(() => prefetch(lessonId)).catch(() => undefined);
  };

  const handleCalls = async (calls: FunctionCallItem[]) => {
    for (const call of calls) {
      if (call.name === "show_on_screen") {
        // The browser alone executes it: nothing to record, nothing to wait for.
        const shown = parseShowArgs(call.arguments);
        if (shown) setBoard(shown);
        send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: call.call_id, output: JSON.stringify(shown ? { shown: true } : { shown: false, reason: "invalid: a style, a text, and 2-4 options for choice" }) } });
        continue;
      }
      let result = call.name === "record_answer" ? answerLocally(call) : null;
      if (!result) {
        setThinking(true);
        result = await enqueue(async () => runTool(lessonId, call.name, call.arguments, call.name === "record_answer" ? await takeHeard() : null));
        setThinking(false);
      }
      if (call.name === "next_activity" || call.name === "begin_lesson") {
        takeBrief(result);
        if (call.name === "next_activity") setBoard(null);
      }
      if (call.name === "finish_lesson") {
        finishing.current = "awaiting_goodbye";
        setStars((s) => ({ ...s, done: Math.max(s.done, s.total) }));
        // Leave time for the goodbye, then show the celebration even if no audio event arrives.
        timers.current.push(window.setTimeout(endLesson, 15_000));
      }
      send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result) } });
    }
    send({ type: "response.create" });
  };

  const onEvent = (raw: string) => {
    let ev: { type?: string; [k: string]: unknown };
    try {
      ev = JSON.parse(raw);
    } catch {
      return;
    }
    switch (ev.type) {
      case "input_audio_buffer.speech_started":
        setListening(true);
        break;
      case "input_audio_buffer.speech_stopped":
        setListening(false);
        break;
      case "input_audio_buffer.committed":
        pendingTranscripts.current += 1;
        break;
      case "conversation.item.input_audio_transcription.completed":
        pendingTranscripts.current = Math.max(0, pendingTranscripts.current - 1);
        if (typeof ev.transcript === "string" && ev.transcript.trim()) heard.current.push(ev.transcript.trim());
        break;
      case "conversation.item.input_audio_transcription.failed":
        pendingTranscripts.current = Math.max(0, pendingTranscripts.current - 1);
        break;
      case "output_audio_buffer.started":
        setSpeaking(true);
        if (finishing.current === "awaiting_goodbye") finishing.current = "goodbye_playing";
        break;
      case "output_audio_buffer.stopped":
        setSpeaking(false);
        if (finishing.current === "goodbye_playing") endLesson();
        break;
      case "response.output_audio_transcript.done":
        if (typeof ev.transcript === "string") setCaption(ev.transcript);
        break;
      case "response.done": {
        const output = ((ev.response as { output?: Array<{ type?: string }> } | undefined)?.output ?? []) as FunctionCallItem[];
        const calls = output.filter((o) => o.type === "function_call");
        if (calls.length) void handleCalls(calls);
        break;
      }
      case "error":
        console.warn("voice error", ev.error);
        break;
    }
  };

  const begin = async () => {
    setError(null);
    if (typeof RTCPeerConnection === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setPhase("error");
      setError("Este navegador não consegue fazer a aula por voz. Tente no Chrome, Edge ou Safari atualizados.");
      return;
    }
    setPhase("connecting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch {
      setPhase("error");
      setError("Preciso do microfone para conversar. Peça para um adulto permitir o microfone e tente de novo.");
      return;
    }
    mic.current = stream;
    const started = await start(lessonId);
    if (!started.ok) {
      stream.getTracks().forEach((t) => t.stop());
      setPhase("error");
      setError(started.message);
      return;
    }
    setStars({ done: started.ticket.completed, total: started.ticket.activitiesTotal });
    try {
      const peer = new RTCPeerConnection();
      pc.current = peer;
      peer.ontrack = (e) => {
        if (audio.current) audio.current.srcObject = e.streams[0];
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "failed" || peer.connectionState === "disconnected") {
          if (finishing.current !== "no") return endLesson();
          teardown();
          setPhase("error");
          setError("A conexão caiu. Toque para continuar de onde parou.");
        }
      };
      stream.getTracks().forEach((t) => peer.addTrack(t, stream));
      const channel = peer.createDataChannel("oai-events");
      dc.current = channel;
      channel.onmessage = (e) => onEvent(String(e.data));
      channel.onopen = () => {
        setPhase("live");
        send({ type: "response.create" });
      };
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const res = await fetch(started.ticket.callsUrl, {
        method: "POST",
        body: offer.sdp,
        headers: { authorization: `Bearer ${started.ticket.clientSecret}`, "content-type": "application/sdp" },
      });
      if (!res.ok) throw new Error(`calls ${res.status}`);
      await peer.setRemoteDescription({ type: "answer", sdp: await res.text() });
      timers.current.push(window.setTimeout(endLesson, MAX_SESSION_MS));
    } catch (err) {
      console.warn("voice connect failed", err);
      teardown();
      setPhase("error");
      setError("Não consegui ligar a voz agora. Tente de novo em instantes.");
    }
  };

  /** A touched card is the child's answer: it goes to Lumi as a message and stands in for the transcript. */
  const pick = (card: string) => {
    if (phase !== "live") return;
    heard.current.push(card);
    send({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text: T.touched(card) }] } });
    send({ type: "response.create" });
  };

  const pause = () => {
    mic.current?.getTracks().forEach((t) => (t.enabled = false));
    send({ type: "response.cancel" });
    send({ type: "output_audio_buffer.clear" });
    setSpeaking(false);
    setPhase("paused");
  };

  const resume = () => {
    mic.current?.getTracks().forEach((t) => (t.enabled = true));
    setPhase("live");
    send({ type: "conversation.item.create", item: { type: "message", role: "system", content: [{ type: "input_text", text: "The child is back from a pause. Welcome them back in one short sentence and repeat the last question." }] } });
    send({ type: "response.create" });
  };

  const status =
    phase === "connecting"
      ? { icon: "🔌", text: T.connecting }
      : phase === "paused"
        ? { icon: "⏸️", text: T.paused }
        : phase === "ending"
          ? { icon: "⭐", text: T.ending }
          : speaking
            ? { icon: "🔊", text: T.speaking }
            : listening
              ? { icon: "👂", text: T.listening }
              : thinking
                ? { icon: "💭", text: T.thinking }
                : { icon: "🎤", text: T.yourTurn };

  return (
    <div className="flex flex-1 flex-col items-center text-center">
      <audio ref={audio} autoPlay />
      <ol className="flex gap-1.5" aria-label={T.stars(stars.done, stars.total)}>
        {Array.from({ length: stars.total }, (_, i) => (
          <li key={i} aria-hidden className={`text-3xl transition ${i < stars.done ? "animate-pop" : "opacity-25 grayscale"}`}>
            ⭐
          </li>
        ))}
      </ol>

      {phase === "idle" || phase === "error" ? (
        <div className="mt-10 flex flex-col items-center">
          <Lumi size={150} mood="happy" className="animate-float" />
          <h1 className="mt-4 font-display text-4xl font-semibold">{T.hello(childName)}</h1>
          <p className="mt-2 text-lg text-muted">{T.intro}</p>
          <button type="button" onClick={begin} className="kid-btn mt-8 flex h-40 w-40 flex-col items-center justify-center gap-1 rounded-full bg-primary text-primary-foreground shadow-lift hover:bg-primary-strong" aria-label={T.startLabel}>
            <span className="text-6xl" aria-hidden>
              🎤
            </span>
            <span className="text-xl">{phase === "error" ? T.again : T.start}</span>
          </button>
          {error ? (
            <p role="alert" className="mt-6 max-w-md rounded-2xl bg-peach px-5 py-3 text-peach-ink">
              {error}
            </p>
          ) : (
            <p className="mt-6 max-w-sm text-sm text-muted">{T.micHint}</p>
          )}
          <a href={screenModeHref} className="mt-4 text-sm font-bold text-muted hover:text-foreground">
            {T.screenMode}
          </a>
        </div>
      ) : (
        <div className="mt-8 flex w-full flex-1 flex-col items-center">
          <div className={`relative flex items-center justify-center transition-all ${board ? "h-28 w-28" : "h-64 w-64"}`}>
            <span aria-hidden className={`absolute inset-0 rounded-full bg-lavender transition-transform duration-300 ${speaking ? "scale-100 animate-pulse" : listening ? "scale-90 bg-mint" : "scale-75"}`} />
            <Lumi size={board ? 80 : 170} mood={speaking ? "cheer" : thinking ? "think" : "happy"} className="relative" />
          </div>
          {board ? (
            <section aria-label={T.readHere} aria-live="polite" className="animate-pop mt-4 w-full rounded-3xl bg-surface px-6 py-8 shadow-lift">
              {board.style === "choice" ? (
                <>
                  {board.text ? <p className="font-display text-2xl font-semibold text-muted">{board.text}</p> : null}
                  <div className="mt-4 flex flex-wrap justify-center gap-4">
                    {board.options.map((o) => (
                      <button key={o} type="button" onClick={() => pick(o)} className="kid-btn min-w-28 rounded-3xl bg-sun px-6 py-5 font-display text-6xl font-semibold text-sun-ink shadow-lift hover:scale-105">
                        {o}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className={`font-display font-semibold tracking-wide break-words ${BOARD_SIZE[board.style]}`}>{board.text}</p>
              )}
            </section>
          ) : null}
          <p className="mt-4 flex items-center gap-2 font-display text-3xl font-semibold" role="status" aria-live="polite">
            <span aria-hidden>{status.icon}</span>
            {status.text}
          </p>
          {showCaptions && caption && phase !== "paused" ? <p className="mt-4 max-w-lg rounded-2xl bg-surface-2 px-5 py-3 text-lg">{caption}</p> : null}

          <div className="mt-auto flex items-center gap-4 pt-10 pb-4">
            {phase === "paused" ? (
              <button type="button" onClick={resume} className="kid-btn flex h-24 w-24 items-center justify-center rounded-full bg-primary text-5xl text-primary-foreground shadow-lift" aria-label={T.resume}>
                ▶️
              </button>
            ) : (
              <button type="button" onClick={pause} disabled={phase !== "live"} className="kid-btn flex h-24 w-24 items-center justify-center rounded-full bg-sun text-5xl text-sun-ink shadow-lift disabled:opacity-50" aria-label={T.pause}>
                ⏸️
              </button>
            )}
            <button type="button" onClick={() => setShowCaptions((v) => !v)} className="btn btn-ghost btn-sm" aria-pressed={showCaptions}>
              {showCaptions ? T.hideCaptions : T.showCaptions}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
