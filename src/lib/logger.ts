import * as Sentry from '@sentry/nextjs';

type LogLevel = 'info' | 'warn' | 'error';

/**
 * 구조화된 로거.
 * - 개발 환경: console 출력
 * - 프로덕션: Sentry 연동 (error/warn)
 */
function log(level: LogLevel, module: string, message: string, extra?: Record<string, unknown>) {
  const entry = { module, message, ...extra };

  if (level === 'error') {
    console.error(`[${module}]`, message, extra ?? '');
    Sentry.captureMessage(`[${module}] ${message}`, {
      level: 'error',
      extra: entry,
    });
  } else if (level === 'warn') {
    console.warn(`[${module}]`, message, extra ?? '');
    Sentry.captureMessage(`[${module}] ${message}`, {
      level: 'warning',
      extra: entry,
    });
  } else {
    console.log(`[${module}]`, message, extra ?? '');
  }
}

export const logger = {
  info: (module: string, message: string, extra?: Record<string, unknown>) => log('info', module, message, extra),
  warn: (module: string, message: string, extra?: Record<string, unknown>) => log('warn', module, message, extra),
  error: (module: string, message: string, extra?: Record<string, unknown>) => log('error', module, message, extra),
};
