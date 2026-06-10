/**
 * Structured logging facade. Pretty console lines in dev, JSON lines in
 * production so log aggregators can parse the structure.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = {
  module?: string;
  [k: string]: unknown;
};

function emit(level: LogLevel, message: string, ctx?: LogContext, err?: unknown) {
  const entry: Record<string, unknown> = {
    t: new Date().toISOString(),
    level,
    message,
    ...(ctx ?? {}),
  };
  if (err) {
    entry.error = err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : String(err);
  }
  if (process.env.NODE_ENV !== "production") {
    const c = level === "error" ? "\x1b[31m" : level === "warn" ? "\x1b[33m" : level === "info" ? "\x1b[36m" : "\x1b[90m";
    const r = "\x1b[0m";
    const tag = ctx?.module ? `[${ctx.module}]` : "";
    console[level === "debug" ? "log" : level](`${c}${level.toUpperCase()}${r} ${tag} ${message}`, ctx ?? "", err ?? "");
  } else {
    process.stdout.write(JSON.stringify(entry) + "\n");
  }
}

export const log = {
  debug: (m: string, ctx?: LogContext) => emit("debug", m, ctx),
  info: (m: string, ctx?: LogContext) => emit("info", m, ctx),
  warn: (m: string, ctx?: LogContext, err?: unknown) => emit("warn", m, ctx, err),
  error: (m: string, ctx?: LogContext, err?: unknown) => emit("error", m, ctx, err),
};

export function captureException(err: unknown, ctx?: LogContext): void {
  log.error(err instanceof Error ? err.message : "exception", ctx, err);
}
