/**
 * Structured JSON logger with a redaction allowlist.
 * `prompt`, `student_response`, emails and names are never logged.
 * Writes to stdout so Vercel's log drain is the sink.
 */
type Level = "debug" | "info" | "warn" | "error";
const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const REDACT_KEYS = new Set([
  "prompt",
  "student_response",
  "studentResponse",
  "expected_response",
  "expectedResponse",
  "email",
  "name",
  "display_name",
  "displayName",
  "password",
  "token",
  "authorization",
  "cookie",
  "api_key",
  "apiKey",
]);

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth]";
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACT_KEYS.has(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function currentLevel(): Level {
  const raw = process.env.LOG_LEVEL;
  return raw && raw in LEVELS ? (raw as Level) : "info";
}

export type LogFields = Record<string, unknown> & { requestId?: string };

function emit(level: Level, event: string, fields: LogFields = {}) {
  if (LEVELS[level] < LEVELS[currentLevel()]) return;
  const line = {
    ts: new Date().toISOString(),
    level,
    event,
    ...(redact(fields) as Record<string, unknown>),
  };
  const text = JSON.stringify(line);
  if (level === "error" || level === "warn") process.stderr.write(text + "\n");
  else process.stdout.write(text + "\n");
}

export const log = {
  debug: (event: string, fields?: LogFields) => emit("debug", event, fields),
  info: (event: string, fields?: LogFields) => emit("info", event, fields),
  warn: (event: string, fields?: LogFields) => emit("warn", event, fields),
  error: (event: string, fields?: LogFields) => emit("error", event, fields),
};

/** Named counters emitted as log events (section 38 of the brief). */
export type MetricEvent =
  | "lesson_started"
  | "lesson_completed"
  | "evidence_recorded"
  | "state_transition"
  | "authz_denied"
  | "auth_failure"
  | "db_error"
  | "ai_proposal_received"
  | "voice_session_opened"
  | "ai_proposal_rejected"
  | "ai_provider_error";

export function metric(event: MetricEvent, fields?: LogFields) {
  emit("info", `metric.${event}`, fields);
}

export { redact as redactForLog };
