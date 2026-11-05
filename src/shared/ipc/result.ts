/**
 * [IPC 봉투] 모든 invoke 응답의 공통 모양 — renderer 는 ok 로 분기하고 message 를 그대로 사용자에게 보여준다.
 * 규칙: .claude/rules/electron/ipc.md 「봉투」
 */
export type TIpcErrorCode = 'INVALID_INPUT' | 'NOT_FOUND' | 'BUSY' | 'AGENT_ERROR' | 'INTERNAL';

export interface IIpcError {
  code: TIpcErrorCode;
  message: string;
  issues?: unknown;
}

export type TIpcResult<T> = { ok: true; data: T } | { ok: false; error: IIpcError };

/** 성공 봉투를 만든다 */
export function ok<T>(data: T): TIpcResult<T> {
  return { ok: true, data };
}

/** 실패 봉투를 만든다 — message 는 사용자에게 보일 한국어 문장 */
export function fail<T = never>(code: TIpcErrorCode, message: string, issues?: unknown): TIpcResult<T> {
  return issues === undefined
    ? { ok: false, error: { code, message } }
    : { ok: false, error: { code, message, issues } };
}
