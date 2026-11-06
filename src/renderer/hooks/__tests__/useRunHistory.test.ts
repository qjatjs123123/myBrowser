import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TRunGetResponse, TRunListResponse } from '@shared/ipc/runs';

import { useRunHistory } from '../useRunHistory';

const RUN_LIST: TRunListResponse = {
  runList: [
    {
      id: 'run-1',
      task: '강남역 맛집 전화번호',
      status: 'done',
      summary: '02-123-4567 입니다',
      reason: null,
      createdAt: '2026-11-06T01:00:00.000Z',
      endedAt: '2026-11-06T01:01:00.000Z',
    },
  ],
};

const DETAIL: TRunGetResponse = {
  run: RUN_LIST.runList[0]!,
  stepList: [{ n: 1, tool: 'read_page', summary: '페이지 읽기', status: 'ok' }],
};

const FAILED_ENVELOPE = { ok: false, error: { code: 'INTERNAL', message: '실행 기록을 불러오지 못했습니다' } };

describe('useRunHistory', () => {
  it('list 는 runs.list 의 봉투를 그대로 돌려준다', async () => {
    vi.mocked(window.api.runs.list).mockResolvedValue({ ok: true, data: RUN_LIST });
    const { result } = renderHook(() => useRunHistory());
    expect(await result.current.list()).toEqual({ ok: true, data: RUN_LIST });
  });

  it('get 은 runId 로 runs.get 을 부르고 봉투를 그대로 돌려준다', async () => {
    vi.mocked(window.api.runs.get).mockResolvedValue({ ok: true, data: DETAIL });
    const { result } = renderHook(() => useRunHistory());
    expect(await result.current.get('run-1')).toEqual({ ok: true, data: DETAIL });
    expect(window.api.runs.get).toHaveBeenCalledWith({ runId: 'run-1' });
  });

  it('get 의 실패 봉투(NOT_FOUND)는 그대로 돌려준다', async () => {
    const notFound = {
      ok: false as const,
      error: { code: 'NOT_FOUND' as const, message: '실행 기록을 찾을 수 없습니다' },
    };
    vi.mocked(window.api.runs.get).mockResolvedValue(notFound);
    const { result } = renderHook(() => useRunHistory());
    expect(await result.current.get('run-x')).toEqual(notFound);
  });

  it('list 가 throw 하면 INTERNAL 실패 봉투를 돌려준다', async () => {
    vi.mocked(window.api.runs.list).mockRejectedValue(new Error('ipc'));
    const { result } = renderHook(() => useRunHistory());
    expect(await result.current.list()).toEqual(FAILED_ENVELOPE);
  });

  it('get 이 throw 하면 INTERNAL 실패 봉투를 돌려준다', async () => {
    vi.mocked(window.api.runs.get).mockRejectedValue(new Error('ipc'));
    const { result } = renderHook(() => useRunHistory());
    expect(await result.current.get('run-1')).toEqual(FAILED_ENVELOPE);
  });

  it('렌더가 바뀌어도 같은 함수 묶음을 돌려준다 (effect 의존성용)', () => {
    const { result, rerender } = renderHook(() => useRunHistory());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
