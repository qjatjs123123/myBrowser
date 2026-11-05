import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TApprovalRequest } from '@shared/agent/run';
import type { TAgentEvent } from '@shared/ipc/agent';

import { toast } from '@/lib/toast';

import { AgentPanel } from '..';

vi.mock('@/lib/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

/** onEvent 에 넘겨진 콜백을 꺼낸다 */
function getEventListener(): (event: TAgentEvent) => void {
  const listener = vi.mocked(window.api.agent.onEvent).mock.calls[0]?.[0];
  if (!listener) throw new Error('onEvent 가 구독되지 않았습니다');
  return listener;
}

/** 할 일을 입력하고 [실행] 을 누른다 */
function submitTask(task: string): void {
  fireEvent.change(screen.getByRole('textbox', { name: '할 일' }), { target: { value: task } });
  fireEvent.click(screen.getByRole('button', { name: '작업 실행' }));
}

const APPROVAL: TApprovalRequest = {
  requestId: 'req-1',
  stepN: 1,
  kind: 'guard',
  source: 'structure',
  reason: '확정 버튼',
  display: { action: '클릭', target: '예약 확정' },
  modelNote: null,
};

/** 할 일을 실행해 run-1 을 세운다 */
async function startRun(): Promise<void> {
  vi.mocked(window.api.agent.start).mockResolvedValue({ ok: true, data: { runId: 'run-1' } });
  render(<AgentPanel />);
  submitTask('할 일');
  const stopButton = await screen.findByRole('button', { name: '작업 중지' });
  await waitFor(() => expect(stopButton).toBeEnabled());
}

/** 승인 대기 상태(status waiting_user + approval_required)로 만든다 */
function emitApprovalWait(): void {
  act(() => {
    getEventListener()({ type: 'status', runId: 'run-1', status: 'waiting_user' });
    getEventListener()({ type: 'approval_required', runId: 'run-1', request: APPROVAL });
  });
}

describe('AgentPanel', () => {
  it('처음에는 대기 상태와 빈 상태 안내 문구를 보여준다', () => {
    render(<AgentPanel />);
    expect(screen.getByRole('status', { name: '실행 상태' })).toHaveTextContent('대기');
    expect(screen.getByText('할 일을 입력하면 여기에 진행 상황이 표시됩니다')).toBeInTheDocument();
  });

  it('입력이 비었거나 공백뿐이면 실행 버튼이 비활성이다', () => {
    render(<AgentPanel />);
    const button = screen.getByRole('button', { name: '작업 실행' });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: '할 일' }), { target: { value: '   ' } });
    expect(button).toBeDisabled();
  });

  it('실행을 누르면 입력한 할 일로 agent.start 를 부른다', async () => {
    vi.mocked(window.api.agent.start).mockResolvedValue({ ok: true, data: { runId: 'run-1' } });
    render(<AgentPanel />);
    submitTask('강남역 맛집 전화번호');
    await waitFor(() => expect(window.api.agent.start).toHaveBeenCalledWith({ task: '강남역 맛집 전화번호' }));
  });

  it('실행 중에는 작업 중지 버튼이 보이고 입력창이 비활성이다', async () => {
    vi.mocked(window.api.agent.start).mockResolvedValue({ ok: true, data: { runId: 'run-1' } });
    render(<AgentPanel />);
    submitTask('할 일');
    const stopButton = await screen.findByRole('button', { name: '작업 중지' });
    await waitFor(() => expect(stopButton).toBeEnabled());
    expect(stopButton).toHaveTextContent('중지');
    expect(screen.getByRole('textbox', { name: '할 일' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: '작업 실행' })).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: '실행 상태' })).toHaveTextContent('실행 중…');
  });

  it('작업 중지를 누르면 현재 runId 로 agent.stop 을 부른다', async () => {
    vi.mocked(window.api.agent.start).mockResolvedValue({ ok: true, data: { runId: 'run-1' } });
    vi.mocked(window.api.agent.stop).mockResolvedValue({ ok: true, data: null });
    render(<AgentPanel />);
    submitTask('할 일');
    const stopButton = await screen.findByRole('button', { name: '작업 중지' });
    await waitFor(() => expect(stopButton).toBeEnabled());
    fireEvent.click(stopButton);
    await waitFor(() => expect(window.api.agent.stop).toHaveBeenCalledWith({ runId: 'run-1' }));
  });

  it('start 가 BUSY 실패 봉투면 main 의 메시지로 toast 를 띄우고 다시 실행할 수 있다', async () => {
    vi.mocked(window.api.agent.start).mockResolvedValue({
      ok: false,
      error: { code: 'BUSY', message: '이미 실행 중인 작업이 있습니다' },
    });
    render(<AgentPanel />);
    submitTask('할 일');
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('이미 실행 중인 작업이 있습니다'));
    expect(screen.getByRole('button', { name: '작업 실행' })).toBeEnabled();
  });

  it('Ctrl+Enter 를 누르면 실행한다', async () => {
    vi.mocked(window.api.agent.start).mockResolvedValue({ ok: true, data: { runId: 'run-1' } });
    render(<AgentPanel />);
    const textbox = screen.getByRole('textbox', { name: '할 일' });
    fireEvent.change(textbox, { target: { value: '할 일' } });
    fireEvent.keyDown(textbox, { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(window.api.agent.start).toHaveBeenCalledWith({ task: '할 일' }));
  });

  it('Ctrl 없이 Enter 만 누르면 실행하지 않는다', () => {
    render(<AgentPanel />);
    const textbox = screen.getByRole('textbox', { name: '할 일' });
    fireEvent.change(textbox, { target: { value: '할 일' } });
    fireEvent.keyDown(textbox, { key: 'Enter' });
    expect(window.api.agent.start).not.toHaveBeenCalled();
  });

  it('step·종료 이벤트가 오면 타임라인·결과·상태를 보여준다', async () => {
    vi.mocked(window.api.agent.start).mockResolvedValue({ ok: true, data: { runId: 'run-1' } });
    render(<AgentPanel />);
    submitTask('할 일');
    await screen.findByRole('button', { name: '작업 중지' });
    act(() => {
      const emit = getEventListener();
      emit({
        type: 'step',
        runId: 'run-1',
        step: { n: 1, tool: 'click', summary: '‘예약 확정’ 클릭', status: 'blocked' },
      });
      emit({ type: 'guard_stopped', runId: 'run-1', reason: 'r', display: { action: '클릭', target: '예약 확정' } });
      emit({ type: 'status', runId: 'run-1', status: 'stopped_before_confirm' });
    });
    expect(screen.getByRole('list', { name: '진행 단계' })).toHaveTextContent('‘예약 확정’ 클릭');
    expect(screen.getByRole('region', { name: '실행 결과' })).toHaveTextContent('클릭: 예약 확정');
    expect(screen.getByRole('status', { name: '실행 상태' })).toHaveTextContent('확정 직전 정지');
    expect(screen.getByRole('button', { name: '작업 실행' })).toBeEnabled();
  });

  it('승인 대기면 상태가 “확인 필요” 이고 승인 창이 뜬다', async () => {
    await startRun();
    emitApprovalWait();
    expect(screen.getByRole('status', { name: '실행 상태' })).toHaveTextContent('확인 필요');
    expect(screen.getByRole('alertdialog', { name: '승인 필요' })).toHaveTextContent('예약 확정');
    expect(screen.getByRole('button', { name: '작업 중지' })).toBeEnabled();
  });

  it('승인 창에서 [거부] 를 누르면 runId·requestId 로 agent.approve 를 부른다', async () => {
    await startRun();
    emitApprovalWait();
    vi.mocked(window.api.agent.approve).mockResolvedValue({ ok: true, data: null });
    fireEvent.click(screen.getByRole('button', { name: '거부' }));
    await waitFor(() =>
      expect(window.api.agent.approve).toHaveBeenCalledWith({ runId: 'run-1', requestId: 'req-1', decision: 'denied' }),
    );
  });

  it('approve 가 실패 봉투면 main 의 메시지로 toast 를 띄운다', async () => {
    await startRun();
    emitApprovalWait();
    vi.mocked(window.api.agent.approve).mockResolvedValue({
      ok: false,
      error: { code: 'NOT_FOUND', message: '확인할 요청을 찾을 수 없습니다' },
    });
    fireEvent.click(screen.getByRole('button', { name: '에이전트가 누르기' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('확인할 요청을 찾을 수 없습니다'));
  });

  it('approval_resolved 가 오면 승인 창이 닫힌다', async () => {
    await startRun();
    emitApprovalWait();
    act(() =>
      getEventListener()({ type: 'approval_resolved', runId: 'run-1', requestId: 'req-1', decision: 'denied' }),
    );
    expect(screen.queryByRole('alertdialog', { name: '승인 필요' })).not.toBeInTheDocument();
  });

  it('질문이 오면 질문 카드가 뜨고 선택지를 누르면 agent.answer 를 부른다', async () => {
    await startRun();
    act(() =>
      getEventListener()({
        type: 'question',
        runId: 'run-1',
        question: { requestId: 'req-2', stepN: 1, text: '몇 명인가요?', optionList: ['2명'] },
      }),
    );
    vi.mocked(window.api.agent.answer).mockResolvedValue({ ok: true, data: null });
    expect(screen.getByRole('dialog', { name: '에이전트 질문' })).toHaveTextContent('몇 명인가요?');
    fireEvent.click(screen.getByRole('button', { name: '2명' }));
    await waitFor(() =>
      expect(window.api.agent.answer).toHaveBeenCalledWith({ runId: 'run-1', requestId: 'req-2', answer: '2명' }),
    );
  });

  it('answer 가 실패 봉투면 main 의 메시지로 toast 를 띄운다', async () => {
    await startRun();
    act(() =>
      getEventListener()({
        type: 'question',
        runId: 'run-1',
        question: { requestId: 'req-2', stepN: 1, text: '몇 명인가요?', optionList: ['2명'] },
      }),
    );
    vi.mocked(window.api.agent.answer).mockResolvedValue({
      ok: false,
      error: { code: 'NOT_FOUND', message: '확인할 요청을 찾을 수 없습니다' },
    });
    fireEvent.click(screen.getByRole('button', { name: '2명' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('확인할 요청을 찾을 수 없습니다'));
  });
});
