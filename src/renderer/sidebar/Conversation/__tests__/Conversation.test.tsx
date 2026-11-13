import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ITurn } from '@/hooks/useAgentRun';
import { toast } from '@/lib/toast';

import { Conversation } from '..';

vi.mock('@/lib/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const PAST_TURN: ITurn = {
  runId: 'run-1',
  task: '첫 할 일',
  status: 'done',
  stepList: [{ n: 1, tool: 'snapshot', summary: '페이지 읽기', status: 'ok' }],
  result: { kind: 'done', text: '첫 결과' },
};

const CURRENT_TURN: ITurn = {
  runId: 'run-2',
  task: '두 번째 할 일',
  status: 'done',
  stepList: [
    { n: 1, tool: 'snapshot', summary: '다시 읽기', status: 'ok' },
    { n: 2, tool: 'click', summary: '‘다음’ 클릭', status: 'ok' },
  ],
  result: { kind: 'done', text: '두 번째 결과' },
};

/** 클립보드 대역을 심고 writeText mock 을 돌려준다 */
function stubClipboard(writeText: () => Promise<void>) {
  const mock = vi.fn(writeText);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: mock } });
  return mock;
}

describe('Conversation', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('대화가 비면 기존 빈 상태 문구를 보여준다', () => {
    render(<Conversation pastTurnList={[]} currentTurn={null} />);
    expect(screen.getByText('할 일을 입력하면 여기에 진행 상황이 표시됩니다')).toBeInTheDocument();
  });

  it('지난 턴과 현재 턴을 순서대로 말풍선·응답 쌍으로 보여준다', () => {
    render(<Conversation pastTurnList={[PAST_TURN]} currentTurn={CURRENT_TURN} />);
    const bubbleList = screen.getAllByRole('group', { name: '내 할 일' });
    expect(bubbleList.map((bubble) => bubble.textContent)).toEqual(['첫 할 일', '두 번째 할 일']);
    const resultList = screen.getAllByRole('region', { name: '실행 결과' });
    expect(resultList.map((result) => result.textContent)).toEqual(['첫 결과', '두 번째 결과']);
  });

  it('지난 턴은 접혀 있고 헤더를 누르면 단계가 펼쳐진다', () => {
    render(<Conversation pastTurnList={[PAST_TURN]} currentTurn={null} />);
    const header = screen.getByRole('button', { name: '1단계' });
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list', { name: '진행 단계' })).not.toBeInTheDocument();
    fireEvent.click(header);
    expect(screen.getByRole('list', { name: '진행 단계' })).toHaveTextContent('페이지 읽기');
  });

  it('현재 턴은 완료된 뒤에도 단계가 펼쳐져 있다', () => {
    render(<Conversation pastTurnList={[PAST_TURN]} currentTurn={CURRENT_TURN} />);
    expect(screen.getByRole('button', { name: '2단계' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('list', { name: '진행 단계' })).toHaveTextContent('‘다음’ 클릭');
  });

  it('단계가 없는 실행 중 턴은 “생각 중…” 이다', () => {
    render(<Conversation pastTurnList={[]} currentTurn={{ ...CURRENT_TURN, status: 'running', stepList: [], result: null }} />);
    expect(screen.getByRole('button', { name: '생각 중…' })).toBeDisabled();
  });

  it('끝난 턴 아래에 상태 문구를 보여준다', () => {
    render(<Conversation pastTurnList={[]} currentTurn={{ ...CURRENT_TURN, status: 'stopped' }} />);
    expect(screen.getByRole('article', { name: '에이전트 응답' })).toHaveTextContent('중지됨');
  });

  it('결과 복사를 누르면 결과 문구를 클립보드에 쓴다', async () => {
    const writeText = stubClipboard(() => Promise.resolve());
    render(<Conversation pastTurnList={[]} currentTurn={CURRENT_TURN} />);
    fireEvent.click(screen.getByRole('button', { name: '결과 복사' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledExactlyOnceWith('두 번째 결과'));
  });

  it('할 일 복사를 누르면 할 일 문구를 클립보드에 쓴다', async () => {
    const writeText = stubClipboard(() => Promise.resolve());
    render(<Conversation pastTurnList={[]} currentTurn={CURRENT_TURN} />);
    const bubble = screen.getByRole('group', { name: '내 할 일' });
    fireEvent.click(within(bubble).getByRole('button', { name: '할 일 복사' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledExactlyOnceWith('두 번째 할 일'));
  });

  it('복사에 실패하면 toast 로 알린다', async () => {
    stubClipboard(() => Promise.reject(new Error('denied')));
    render(<Conversation pastTurnList={[]} currentTurn={CURRENT_TURN} />);
    fireEvent.click(screen.getByRole('button', { name: '결과 복사' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('복사하지 못했습니다'));
  });

  it('대기 카드(footer)를 대화 끝에 붙인다', () => {
    render(<Conversation pastTurnList={[]} currentTurn={CURRENT_TURN} footer={<p>승인 카드</p>} />);
    expect(screen.getByText('승인 카드')).toBeInTheDocument();
  });
});
