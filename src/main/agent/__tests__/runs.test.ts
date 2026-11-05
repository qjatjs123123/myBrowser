import { describe, expect, it } from 'vitest';

import { RunStatusSchema, type TRunStatus } from '@shared/agent/run';

import { isFinalStatus, transition, type TRunEvent } from '../runs';

const LEGAL_LIST: [TRunStatus, TRunEvent, TRunStatus][] = [
  ['queued', 'start', 'running'],
  ['running', 'finish', 'done'],
  ['running', 'fail', 'failed'],
  ['running', 'stop', 'stopped'],
  ['running', 'guardStop', 'stopped_before_confirm'],
];

const EVENT_LIST: TRunEvent[] = ['start', 'finish', 'fail', 'stop', 'guardStop'];

const ILLEGAL_LIST = RunStatusSchema.options.flatMap((from) =>
  EVENT_LIST.filter((event) => !LEGAL_LIST.some(([f, e]) => f === from && e === event)).map(
    (event) => [from, event] as const,
  ),
);

describe('transition', () => {
  it.each(LEGAL_LIST)('%s 에서 %s 하면 %s 가 된다', (from, event, to) => {
    expect(transition(from, event)).toBe(to);
  });

  it.each(ILLEGAL_LIST)('%s 에서 %s 하면 throw 한다', (from, event) => {
    expect(() => transition(from, event)).toThrow(/허용되지 않은 run 전이/);
  });
});

describe('isFinalStatus', () => {
  it.each(['done', 'failed', 'stopped', 'stopped_before_confirm'] as const)('%s 는 종료 상태다', (status) => {
    expect(isFinalStatus(status)).toBe(true);
  });

  it.each(['queued', 'running', 'waiting_user'] as const)('%s 는 종료 상태가 아니다', (status) => {
    expect(isFinalStatus(status)).toBe(false);
  });
});
