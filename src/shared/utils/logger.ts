type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

function getCurrentLevel(): LogLevel {
  const rawLevel = process.env.LOG_LEVEL?.trim().toLowerCase();
  if (rawLevel === "debug" || rawLevel === "info" || rawLevel === "warn" || rawLevel === "error") {
    return rawLevel;
  }
  return "info";
}

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[getCurrentLevel()];
}

function log(level: LogLevel, message: string, ...meta: unknown[]): void {
  if (!shouldLog(level)) {
    return;
  }

  const prefix = `[${new Date().toISOString()}] [${level.toUpperCase()}]`;
  const line = `${prefix} ${message}`;

  if (level === "error") {
    console.error(line, ...meta);
    return;
  }

  if (level === "warn") {
    console.warn(line, ...meta);
    return;
  }

  console.log(line, ...meta);
}

export const logger = {
  debug(message: string, ...meta: unknown[]) {
    log("debug", message, ...meta);
  },
  info(message: string, ...meta: unknown[]) {
    log("info", message, ...meta);
  },
  warn(message: string, ...meta: unknown[]) {
    log("warn", message, ...meta);
  },
  error(message: string, ...meta: unknown[]) {
    log("error", message, ...meta);
  }
};
