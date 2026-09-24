"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Lumi } from "@/components/brand/lumi";

/**
 * The live voice lesson, in the browser: microphone in, Lumi's voice out, over
 * WebRTC straight to the voice model with a short-lived secret minted by the
 * server. Hands-free after one tap, so a child who cannot read can do the
 * whole lesson alone. The model's tool calls are forwarded to the server,
 * which decides and records; this component only relays and shows state.
 */

type Ticket = { clientSecret: string; callsUrl: string; activitiesTotal: number; completed: number };
type StartResult = { ok: true; ticket: Ticket } | { ok: false; message: string };
type Phase = "idle" | "connecting" | "live" | "paused" | "ending" | "error";
type FunctionCallItem = { type: "function_call"; name: string; call_id: string; arguments: string };

/** A hard stop so a forgotten tab never keeps a paid session open. */
const MAX_SESSION_MS = 45 * 60_000;
const TRANSCRIPT_WAIT_MS = 1500;

export function VoiceLesson({
  lessonId,
  childName,
  total,
  completed,
  start,
  runTool,
  screenModeHref,
}: {
  lessonId: string;
  childName: string;
  total: number;
  completed: number;
  start: (lessonId: string) => Promise<StartResult>;
  runTool: (lessonId: string, name: string, args: string, heard: string | null) => Promise<Record<string, unknown>>;
  screenModeHref: string;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [caption, setCaption] = useState("");
  const [showCaptions, setShowCaptions] = useState(true);
  const [stars, setStars] = useState({ done: completed, total });

  const pc = useRef<RTCPeerConnection | null>(null);
  const dc = useRef<RTCDataChannel | null>(null);
  const mic = useRef<MediaStream | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const heard = useRef<string[]>([]);
  const pendingTranscripts = useRef(0);
  /** After finish_lesson: wait for the goodbye to start, then end when it stops. */
  const finishing = useRef<"no" | "awaiting_goodbye" | "goodbye_playing">("no");
  const timers = useRef<number[]>([]);

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
    const started = Date.now();
    while (pendingTranscripts.current > 0 && Date.now() - started < TRANSCRIPT_WAIT_MS) await new Promise((r) => setTimeout(r, 100));
    const said = heard.current.at(-1) ?? null;
    heard.current = [];
    return said;
  };

  const handleCalls = async (calls: FunctionCallItem[]) => {
    setThinking(true);
    for (const call of calls) {
      const said = call.name === "record_answer" ? await takeHeard() : null;
      const result = await runTool(lessonId, call.name, call.arguments, said);
      if (call.name === "next_activity" || call.name === "begin_lesson") {
        const activity = result.activity as { activity_number?: number } | undefined;
        if (result.lesson_complete) setStars((s) => ({ ...s, done: s.total }));
        else if (activity?.activity_number) setStars((s) => ({ ...s, done: activity.activity_number! - 1 }));
      }
      if (call.name === "finish_lesson") {
        finishing.current = "awaiting_goodbye";
        setStars((s) => ({ ...s, done: Math.max(s.done, s.total) }));
        // Leave time for the goodbye, then show the celebration even if no audio event arrives.
        timers.current.push(window.setTimeout(endLesson, 15_000));
      }
      send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result) } });
    }
    setThinking(false);
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
      ? { icon: "🔌", text: "Chamando o Lumi…" }
      : phase === "paused"
        ? { icon: "⏸️", text: "Pausado" }
        : phase === "ending"
          ? { icon: "⭐", text: "Até a próxima!" }
          : speaking
            ? { icon: "🔊", text: "O Lumi está falando" }
            : listening
              ? { icon: "👂", text: "Estou ouvindo…" }
              : thinking
                ? { icon: "💭", text: "Pensando…" }
                : { icon: "🎤", text: "Sua vez! Pode falar" };

  return (
    <div className="flex flex-1 flex-col items-center text-center">
      <audio ref={audio} autoPlay />
      <ol className="flex gap-1.5" aria-label={`${stars.done} de ${stars.total} estrelas`}>
        {Array.from({ length: stars.total }, (_, i) => (
          <li key={i} aria-hidden className={`text-3xl transition ${i < stars.done ? "animate-pop" : "opacity-25 grayscale"}`}>
            ⭐
          </li>
        ))}
      </ol>

      {phase === "idle" || phase === "error" ? (
        <div className="mt-10 flex flex-col items-center">
          <Lumi size={150} mood="happy" className="animate-float" />
          <h1 className="mt-4 font-display text-4xl font-semibold">Oi, {childName}!</h1>
          <p className="mt-2 text-lg text-muted">A aula de hoje é uma conversa com o Lumi.</p>
          <button type="button" onClick={begin} className="kid-btn mt-8 flex h-40 w-40 flex-col items-center justify-center gap-1 rounded-full bg-primary text-primary-foreground shadow-lift hover:bg-primary-strong" aria-label="Conversar com o Lumi">
            <span className="text-6xl" aria-hidden>
              🎤
            </span>
            <span className="text-xl">{phase === "error" ? "De novo" : "Conversar"}</span>
          </button>
          {error ? (
            <p role="alert" className="mt-6 max-w-md rounded-2xl bg-peach px-5 py-3 text-peach-ink">
              {error}
            </p>
          ) : (
            <p className="mt-6 max-w-sm text-sm text-muted">Adulto: na primeira vez, o navegador pede permissão para usar o microfone.</p>
          )}
          <a href={screenModeHref} className="mt-4 text-sm font-bold text-muted hover:text-foreground">
            Fazer pela tela, sem voz
          </a>
        </div>
      ) : (
        <div className="mt-8 flex w-full flex-1 flex-col items-center">
          <div className="relative flex h-64 w-64 items-center justify-center">
            <span aria-hidden className={`absolute inset-0 rounded-full bg-lavender transition-transform duration-300 ${speaking ? "scale-100 animate-pulse" : listening ? "scale-90 bg-mint" : "scale-75"}`} />
            <Lumi size={170} mood={speaking ? "cheer" : thinking ? "think" : "happy"} className="relative" />
          </div>
          <p className="mt-4 flex items-center gap-2 font-display text-3xl font-semibold" role="status" aria-live="polite">
            <span aria-hidden>{status.icon}</span>
            {status.text}
          </p>
          {showCaptions && caption && phase !== "paused" ? <p className="mt-4 max-w-lg rounded-2xl bg-surface-2 px-5 py-3 text-lg">{caption}</p> : null}

          <div className="mt-auto flex items-center gap-4 pt-10 pb-4">
            {phase === "paused" ? (
              <button type="button" onClick={resume} className="kid-btn flex h-24 w-24 items-center justify-center rounded-full bg-primary text-5xl text-primary-foreground shadow-lift" aria-label="Continuar">
                ▶️
              </button>
            ) : (
              <button type="button" onClick={pause} disabled={phase !== "live"} className="kid-btn flex h-24 w-24 items-center justify-center rounded-full bg-sun text-5xl text-sun-ink shadow-lift disabled:opacity-50" aria-label="Pausar">
                ⏸️
              </button>
            )}
            <button type="button" onClick={() => setShowCaptions((v) => !v)} className="btn btn-ghost btn-sm" aria-pressed={showCaptions}>
              {showCaptions ? "Esconder legenda" : "Mostrar legenda"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
