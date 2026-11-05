import type { z } from 'zod';

import type { TApprovalRequest, TQuestion } from '@shared/agent/run';
import type { TGuardVerdict } from '@shared/guard/types';
import type { IBrowserDriver, TActionResult, THumanToolName, TToolName } from '@shared/tools';

import type { TWaitAnswer } from '../waits';

/**
 * 도구 정의 1개 — 도구 1개 = 파일 1개 = 행동 1개 (rules/agent/tools.md).
 * 가드·step 기록·정지 확인은 index.ts 의 공통 래퍼가 하고, execute 는 행동만 한다.
 */
export interface IAgentTool<TInput> {
  name: TToolName;
  /** 모델이 읽는 문장 — 언제 쓰고/말지, ref 출처, 예시 입력 1개 */
  description: string;
  inputSchema: z.ZodType<TInput>;
  execute(driver: IBrowserDriver, input: TInput): Promise<TActionResult>;
}

/** 사용자 대기 요청 — requestId 는 서비스(대기 레지스트리)가 붙인다 */
export type TUserRequest =
  | { kind: 'approval'; approval: Omit<TApprovalRequest, 'requestId'> }
  | { kind: 'question'; question: Omit<TQuestion, 'requestId'> };

/** 가드가 낸 승인 요청 판정 */
export type TApprovalVerdict = Extract<TGuardVerdict, { kind: 'require_approval' }>;

/** 사람 개입 도구가 받는 것 — 브라우저는 주지 않는다 (사용자 대기만) */
export interface IHumanToolContext {
  stepN: number;
  /** isApprovalRequest 도구면 래퍼가 상한 검사를 통과시킨 가드 판정 (display·reason 은 모델 문장이 아니다) */
  approvalVerdict: TApprovalVerdict | null;
  /** step 을 waiting 으로 바꾸고 사용자 답을 기다린다 — 중지·종료면 cancelled */
  waitForUser(request: TUserRequest): Promise<TWaitAnswer>;
}

/** 사람 개입 도구 결과 — halted 면 래퍼가 HALTED 결과를 돌려준다. storedText 는 DB 에 남길 값(답변 원문 금지, SR-5) */
export type THumanToolResult = { status: 'ok' | 'denied'; text: string; storedText: string } | { status: 'halted' };

/**
 * 사람 개입 도구(ask_user·request_approval) — 가드 대상이 아니고 브라우저를 쓰지 않는다.
 * execute(driver) 대신 executeWithContext(ctx) 를 가져 래퍼가 분기한다 (spec 004 「결정 사항」).
 */
export interface IHumanTool<TInput> {
  name: THumanToolName;
  description: string;
  inputSchema: z.ZodType<TInput>;
  /** true 면 승인 요청 — 래퍼가 승인 상한(SR-4)을 검사하고 approvalCount 에 더한다 */
  isApprovalRequest: boolean;
  executeWithContext(ctx: IHumanToolContext, input: TInput): Promise<THumanToolResult>;
}

/** 모델에 보이는 클라이언트 도구 15개의 정의 */
export type TAnyAgentTool = IAgentTool<unknown> | IHumanTool<unknown>;

/** 사람 개입 도구인지 */
export function isHumanTool(tool: TAnyAgentTool): tool is IHumanTool<unknown> {
  return 'executeWithContext' in tool;
}
