/**
 * logger — minimal structured logging for the mobile app (NEW-W2-005).
 *
 * The app previously used bare `console.warn` for error paths, which loses
 * scope/context and is invisible to crash tooling. This module provides a
 * tiny structured wrapper:
 *
 *   logger.error('kfs', 'generate failed', { applicationId, err });
 *
 * Output shape: single console line with a JSON context payload so device
 * logs stay grep-able. `__DEV__` gates debug noise. When Firebase
 * Crashlytics is wired (see CLAUDE.md monitoring stack), route `warn`/
 * `error` through `crashlytics().recordError` here — call sites stay as-is.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  [key: string]: unknown;
}

function serializeContext(context?: LogContext): string {
  if (!context) return '';
  try {
    return ' ' + JSON.stringify(context, (_k, v) => (v instanceof Error ? `${v.name}: ${v.message}` : v));
  } catch {
    return ' [unserializable context]';
  }
}

function emit(level: LogLevel, scope: string, message: string, context?: LogContext): void {
  const line = `[${scope}] ${message}${serializeContext(context)}`;
  switch (level) {
    case 'debug':
      if (__DEV__) console.debug(line);
      break;
    case 'info':
      console.info(line);
      break;
    case 'warn':
      console.warn(line);
      break;
    case 'error':
      console.error(line);
      break;
  }
}

export const logger = {
  debug: (scope: string, message: string, context?: LogContext) => emit('debug', scope, message, context),
  info: (scope: string, message: string, context?: LogContext) => emit('info', scope, message, context),
  warn: (scope: string, message: string, context?: LogContext) => emit('warn', scope, message, context),
  error: (scope: string, message: string, context?: LogContext) => emit('error', scope, message, context),
};
