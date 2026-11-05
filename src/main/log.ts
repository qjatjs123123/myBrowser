/**
 * [main 로그] console 대신 이 함수만 쓴다. error 는 `[main.error]` 접두사로 stderr — e2e fixtures 가 이 줄을 센다.
 * 규칙: .claude/rules/electron/main.md
 */
type TLevel = 'info' | 'warn' | 'error';

function write(level: TLevel, scope: string, message: string, meta?: unknown): void {
  const suffix = meta === undefined ? '' : ` ${formatMeta(meta)}`;
  const line = `[main.${level}] [${scope}] ${message}${suffix}\n`;
  (level === 'info' ? process.stdout : process.stderr).write(line);
}

function formatMeta(meta: unknown): string {
  if (meta instanceof Error) return meta.stack ?? meta.message;
  try {
    return JSON.stringify(meta);
  } catch {
    return String(meta);
  }
}

export const log = {
  info: (scope: string, message: string, meta?: unknown) => write('info', scope, message, meta),
  warn: (scope: string, message: string, meta?: unknown) => write('warn', scope, message, meta),
  error: (scope: string, message: string, meta?: unknown) => write('error', scope, message, meta),
};
