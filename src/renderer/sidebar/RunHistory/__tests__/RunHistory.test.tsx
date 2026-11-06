import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TRunGetResponse, TRunSummary } from '@shared/ipc/runs';

import { toast } from '@/lib/toast';

import { RunHistory } from '..';

vi.mock('@/lib/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

/** 테스트용 run 요약 — 시각은 로컬 시각 기준으로 만든다 */
function createRun(patch: Partial<TRunSummary> & Pick<TRunSummary, 'id' | 'task' | 'status'>): TRunSummary {
  return {
    summary: null,
    reason: null,
    createdAt: new Date(2026, 10, 6, 19, 5).toISOString(),
    endedAt: null,
    ...patch,
  };
}

const RUN_LIST: TRunSummary[] = [
  createRun({ id: 'run-3', task: '최신 할 일', status: 'done', summary: '전화번호는 02-123-4567 입니다' }),
  createRun({ id: 'run-2', task: '실패한 할 일', status: 'failed', reason: '페이지를 열지 못했습니다' }),
  createRun({
    id: 'run-1',
    task: '오래된 할 일',
    status: 'stopped',
    createdAt: new Date(2026, 0, 3, 7, 9).toISOString(),
  }),
];

const DONE_DETAIL: TRunGetResponse = {
  run: RUN_LIST[0]!,
  stepList: [
    { n: 1, tool: 'navigate', summary: '검색 페이지 열기', status: 'ok' },
    { n: 2, tool: 'read_page', summary: '페이지 읽기', status: 'ok' },
  ],
};

/** 목록 응답을 주고 그린 뒤 목록이 뜰 때까지 기다린다 */
async function renderWithList(runList: TRunSummary[] = RUN_LIST) {
  vi.mocked(window.api.runs.list).mockResolvedValue({ ok: true, data: { runList } });
  const onClose = vi.fn();
  render(<RunHistory onClose={onClose} />);
  await screen.findByRole('list', { name: '실행 기록 목록' });
  return { onClose };
}

describe('RunHistory', () => {
  it('열면 목록을 한 번 읽고 main 이 준 순서(최신 먼저)대로 보여준다', async () => {
    await renderWithList();
    expect(window.api.runs.list).toHaveBeenCalledOnce();
    const list = screen.getByRole('list', { name: '실행 기록 목록' });
    const buttonList = within(list).getAllByRole('button');
    expect(buttonList.map((button) => button.textContent)).toEqual([
      expect.stringContaining('최신 할 일'),
      expect.stringContaining('실패한 할 일'),
      expect.stringContaining('오래된 할 일'),
    ]);
  });

  it('각 줄 버튼의 접근 이름은 할 일만이다 (상태·시각이 섞이지 않는다)', async () => {
    await renderWithList();
    expect(screen.getByRole('button', { name: '최신 할 일' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '오래된 할 일' })).toBeInTheDocument();
  });

  it('각 줄에 상태 문구와 `M월 D일 HH:mm` 시작 시각을 보여준다', async () => {
    await renderWithList();
    const latest = screen.getByRole('button', { name: '최신 할 일' });
    expect(latest).toHaveTextContent('완료');
    expect(latest).toHaveTextContent('11월 6일 19:05');
    expect(screen.getByRole('button', { name: '실패한 할 일' })).toHaveTextContent('실패');
    const oldest = screen.getByRole('button', { name: '오래된 할 일' });
    expect(oldest).toHaveTextContent('중지됨');
    expect(oldest).toHaveTextContent('1월 3일 07:09');
  });

  it.each([
    ['running', '실행 중'],
    ['queued', '실행 중'],
    ['waiting_user', '확인 대기'],
    ['stopped_before_confirm', '확정 직전 정지'],
  ] as const)('상태 %s 는 `%s` 로 보여준다', async (status, label) => {
    await renderWithList([createRun({ id: 'run-1', task: '할 일', status })]);
    expect(screen.getByRole('button', { name: '할 일' })).toHaveTextContent(label);
  });

  it('기록이 없으면 빈 문구를 보여준다', async () => {
    vi.mocked(window.api.runs.list).mockResolvedValue({ ok: true, data: { runList: [] } });
    render(<RunHistory onClose={vi.fn()} />);
    expect(await screen.findByText('아직 실행 기록이 없습니다')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: '실행 기록 목록' })).not.toBeInTheDocument();
  });

  it('[대화로 돌아가기] 를 누르면 onClose 를 부른다', async () => {
    const { onClose } = await renderWithList();
    fireEvent.click(screen.getByRole('button', { name: '대화로 돌아가기' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('줄을 누르면 그 run 을 읽어 말풍선·단계·결과를 보여준다', async () => {
    await renderWithList();
    vi.mocked(window.api.runs.get).mockResolvedValue({ ok: true, data: DONE_DETAIL });
    fireEvent.click(screen.getByRole('button', { name: '최신 할 일' }));
    const bubble = await screen.findByRole('group', { name: '내 할 일' });
    expect(window.api.runs.get).toHaveBeenCalledWith({ runId: 'run-3' });
    expect(bubble).toHaveTextContent('최신 할 일');
    expect(screen.getByText('검색 페이지 열기')).toBeInTheDocument();
    expect(screen.getByText('페이지 읽기')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '실행 결과' })).toHaveTextContent('전화번호는 02-123-4567 입니다');
  });

  it('실패한 run 의 상세는 reason 을 결과로 보여준다', async () => {
    await renderWithList();
    vi.mocked(window.api.runs.get).mockResolvedValue({ ok: true, data: { run: RUN_LIST[1]!, stepList: [] } });
    fireEvent.click(screen.getByRole('button', { name: '실패한 할 일' }));
    expect(await screen.findByRole('region', { name: '실행 결과' })).toHaveTextContent('페이지를 열지 못했습니다');
  });

  it('중지된 run 의 상세는 `중지했습니다` 를 결과로 보여준다', async () => {
    await renderWithList();
    vi.mocked(window.api.runs.get).mockResolvedValue({ ok: true, data: { run: RUN_LIST[2]!, stepList: [] } });
    fireEvent.click(screen.getByRole('button', { name: '오래된 할 일' }));
    expect(await screen.findByRole('region', { name: '실행 결과' })).toHaveTextContent('중지했습니다');
  });

  it('상세의 [목록으로] 를 누르면 목록으로 돌아온다', async () => {
    await renderWithList();
    vi.mocked(window.api.runs.get).mockResolvedValue({ ok: true, data: DONE_DETAIL });
    fireEvent.click(screen.getByRole('button', { name: '최신 할 일' }));
    fireEvent.click(await screen.findByRole('button', { name: '목록으로' }));
    expect(screen.getByRole('list', { name: '실행 기록 목록' })).toBeInTheDocument();
  });

  it('상세에는 실행·중지·승인·거부 버튼이 없다 (읽기 전용)', async () => {
    await renderWithList();
    vi.mocked(window.api.runs.get).mockResolvedValue({ ok: true, data: DONE_DETAIL });
    fireEvent.click(screen.getByRole('button', { name: '최신 할 일' }));
    await screen.findByRole('group', { name: '내 할 일' });
    for (const name of [/실행/, /중지/, /승인/, /거부/, /에이전트가 누르기/, /직접 누를게요/]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });

  it('상세를 읽지 못하면 main 의 메시지로 toast 하고 목록에 머문다', async () => {
    await renderWithList();
    vi.mocked(window.api.runs.get).mockResolvedValue({
      ok: false,
      error: { code: 'NOT_FOUND', message: '실행 기록을 찾을 수 없습니다' },
    });
    fireEvent.click(screen.getByRole('button', { name: '최신 할 일' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('실행 기록을 찾을 수 없습니다'));
    expect(screen.getByRole('list', { name: '실행 기록 목록' })).toBeInTheDocument();
  });

  it('목록을 읽지 못하면 main 의 메시지로 toast 하고 [다시 시도] 를 보여준다', async () => {
    vi.mocked(window.api.runs.list).mockResolvedValue({
      ok: false,
      error: { code: 'INTERNAL', message: '데이터베이스를 열지 못했습니다' },
    });
    render(<RunHistory onClose={vi.fn()} />);
    expect(await screen.findByRole('button', { name: '다시 시도' })).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith('데이터베이스를 열지 못했습니다');
  });

  it('[다시 시도] 를 누르면 목록을 다시 읽어 보여준다', async () => {
    vi.mocked(window.api.runs.list).mockResolvedValueOnce({
      ok: false,
      error: { code: 'INTERNAL', message: '데이터베이스를 열지 못했습니다' },
    });
    render(<RunHistory onClose={vi.fn()} />);
    vi.mocked(window.api.runs.list).mockResolvedValue({ ok: true, data: { runList: RUN_LIST } });
    fireEvent.click(await screen.findByRole('button', { name: '다시 시도' }));
    expect(await screen.findByRole('list', { name: '실행 기록 목록' })).toBeInTheDocument();
    expect(window.api.runs.list).toHaveBeenCalledTimes(2);
  });
});
