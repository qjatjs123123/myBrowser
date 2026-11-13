import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TApprovalRequest } from '@shared/agent/run';
import type { TAgentEvent } from '@shared/ipc/agent';

import { useAgentRun } from '@/hooks/useAgentRun';
import { toast } from '@/lib/toast';

import { AgentPanel } from '..';

/** App 처럼 run 을 한 번 구독해 넘기는 래퍼 (spec 011 — AgentPanel 은 run 을 prop 으로 받는다) */
function PanelWithRun() {
  const run = useAgentRun();
  return <AgentPanel run={run} />;
}

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
  render(<PanelWithRun />);
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
    render(<PanelWithRun />);
    expect(screen.getByRole('status', { name: '실행 상태' })).toHaveTextContent('대기');
    expect(screen.getByText('할 일을 입력하면 여기에 진행 상황이 표시됩니다')).toBeInTheDocument();
  });

  it('입력이 비었거나 공백뿐이면 실행 버튼이 비활성이다', () => {
    render(<PanelWithRun />);
    const button = screen.getByRole('button', { name: '작업 실행' });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: '할 일' }), { target: { value: '   ' } });
    expect(button).toBeDisabled();
  });

  it('실행을 누르면 입력한 할 일로 agent.start 를 부른다', async () => {
    vi.mocked(window.api.agent.start).mockResolvedValue({ ok: true, data: { runId: 'run-1' } });
    render(<PanelWithRun />);
    submitTask('강남역 맛집 전화번호');
    await waitFor(() => expect(window.api.agent.start).toHaveBeenCalledWith({ task: '강남역 맛집 전화번호' }));
  });

  it('실행 중에는 작업 중지 버튼이 보이고 입력창이 비활성이다', async () => {
    vi.mocked(window.api.agent.start).mockResolvedValue({ ok: true, data: { runId: 'run-1' } });
    render(<PanelWithRun />);
    submitTask('할 일');
    const stopButton = await screen.findByRole('button', { name: '작업 중지' });
    await waitFor(() => expect(stopButton).toBeEnabled());
    expect(stopButton).toHaveAccessibleName('작업 중지');
    expect(screen.getByRole('textbox', { name: '할 일' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: '작업 실행' })).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: '실행 상태' })).toHaveTextContent('실행 중…');
  });

  it('작업 중지를 누르면 현재 runId 로 agent.stop 을 부른다', async () => {
    vi.mocked(window.api.agent.start).mockResolvedValue({ ok: true, data: { runId: 'run-1' } });
    vi.mocked(window.api.agent.stop).mockResolvedValue({ ok: true, data: null });
    render(<PanelWithRun />);
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
    render(<PanelWithRun />);
    submitTask('할 일');
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('이미 실행 중인 작업이 있습니다'));
    expect(screen.getByRole('button', { name: '작업 실행' })).toBeEnabled();
  });

  it('Ctrl+Enter 를 누르면 실행한다', async () => {
    vi.mocked(window.api.agent.start).mockResolvedValue({ ok: true, data: { runId: 'run-1' } });
    render(<PanelWithRun />);
    const textbox = screen.getByRole('textbox', { name: '할 일' });
    fireEvent.change(textbox, { target: { value: '할 일' } });
    fireEvent.keyDown(textbox, { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(window.api.agent.start).toHaveBeenCalledWith({ task: '할 일' }));
  });

  it('Enter 를 누르면 [작업 실행] 처럼 실행한다 (spec 009)', async () => {
    vi.mocked(window.api.agent.start).mockResolvedValue({ ok: true, data: { runId: 'run-1' } });
    render(<PanelWithRun />);
    const textbox = screen.getByRole('textbox', { name: '할 일' });
    fireEvent.change(textbox, { target: { value: '할 일' } });
    fireEvent.keyDown(textbox, { key: 'Enter' });
    await waitFor(() => expect(window.api.agent.start).toHaveBeenCalledExactlyOnceWith({ task: '할 일' }));
  });

  it('Shift+Enter 는 실행하지 않는다', () => {
    render(<PanelWithRun />);
    const textbox = screen.getByRole('textbox', { name: '할 일' });
    fireEvent.change(textbox, { target: { value: '할 일' } });
    fireEvent.keyDown(textbox, { key: 'Enter', shiftKey: true });
    expect(window.api.agent.start).not.toHaveBeenCalled();
  });

  it('IME 조합 중 Enter 는 실행하지 않는다', () => {
    render(<PanelWithRun />);
    const textbox = screen.getByRole('textbox', { name: '할 일' });
    fireEvent.change(textbox, { target: { value: '예약해' } });
    fireEvent.keyDown(textbox, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(textbox, { key: 'Enter', keyCode: 229 });
    expect(window.api.agent.start).not.toHaveBeenCalled();
  });

  it('입력이 비었으면 Enter 를 눌러도 실행하지 않는다', () => {
    render(<PanelWithRun />);
    const textbox = screen.getByRole('textbox', { name: '할 일' });
    fireEvent.change(textbox, { target: { value: '   ' } });
    fireEvent.keyDown(textbox, { key: 'Enter' });
    expect(window.api.agent.start).not.toHaveBeenCalled();
  });

  it('step·종료 이벤트가 오면 타임라인·결과·상태를 보여준다', async () => {
    vi.mocked(window.api.agent.start).mockResolvedValue({ ok: true, data: { runId: 'run-1' } });
    render(<PanelWithRun />);
    submitTask('할 일');
    await screen.findByRole('button', { name: '작업 중지' });
    act(() => {
      const emit = getEventListener();
      emit({
        type: 'step',
        runId: 'run-1',
        step: { n: 1, tool: 'click', summary: '‘예약 확정’ 클릭', status: 'denied' },
      });
      emit({ type: 'done', runId: 'run-1', summary: '예약 확정은 사용자가 거부했습니다' });
      emit({ type: 'status', runId: 'run-1', status: 'done' });
    });
    expect(screen.getByRole('list', { name: '진행 단계' })).toHaveTextContent('‘예약 확정’ 클릭');
    expect(screen.getByRole('img', { name: '거부됨' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '실행 결과' })).toHaveTextContent('예약 확정은 사용자가 거부했습니다');
    expect(screen.getByRole('status', { name: '실행 상태' })).toHaveTextContent('완료');
    const textbox = screen.getByRole('textbox', { name: '할 일' });
    expect(textbox).toBeEnabled();
    fireEvent.change(textbox, { target: { value: '다음 할 일' } });
    expect(screen.getByRole('button', { name: '작업 실행' })).toBeEnabled();
  });

  it('실행이 시작되면 입력창을 비우고 할 일을 말풍선으로 보여준다 (spec 009)', async () => {
    vi.mocked(window.api.agent.start).mockResolvedValue({ ok: true, data: { runId: 'run-1' } });
    render(<PanelWithRun />);
    submitTask('강남역 맛집');
    expect(await screen.findByRole('group', { name: '내 할 일' })).toHaveTextContent('강남역 맛집');
    expect(screen.getByRole('textbox', { name: '할 일' })).toHaveValue('');
  });

  it('시작이 실패하면 입력을 그대로 둔다', async () => {
    vi.mocked(window.api.agent.start).mockResolvedValue({ ok: false, error: { code: 'BUSY', message: '바쁨' } });
    render(<PanelWithRun />);
    submitTask('강남역 맛집');
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('바쁨'));
    expect(screen.getByRole('textbox', { name: '할 일' })).toHaveValue('강남역 맛집');
  });

  it('끝난 뒤 [새 대화] 를 누르면 대화를 비운다', async () => {
    vi.mocked(window.api.agent.start).mockResolvedValue({ ok: true, data: { runId: 'run-1' } });
    render(<PanelWithRun />);
    const resetButton = screen.getByRole('button', { name: '새 대화' });
    expect(resetButton).toBeDisabled();
    submitTask('할 일');
    await screen.findByRole('button', { name: '작업 중지' });
    expect(resetButton).toBeDisabled();
    act(() => {
      getEventListener()({ type: 'done', runId: 'run-1', summary: '끝' });
      getEventListener()({ type: 'status', runId: 'run-1', status: 'done' });
    });
    fireEvent.click(resetButton);
    expect(screen.queryByRole('group', { name: '내 할 일' })).not.toBeInTheDocument();
    expect(screen.getByText('할 일을 입력하면 여기에 진행 상황이 표시됩니다')).toBeInTheDocument();
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

  describe('[실행 기록] 전환 (spec 012)', () => {
    /** 기록 목록 응답(빈 목록)을 주고 [실행 기록] 을 누른다 */
    async function openHistory(): Promise<void> {
      vi.mocked(window.api.runs.list).mockResolvedValue({ ok: true, data: { runList: [] } });
      fireEvent.click(screen.getByRole('button', { name: '실행 기록' }));
      await screen.findByText('아직 실행 기록이 없습니다');
    }

    it('[실행 기록] 을 누르면 대화 자리에 기록이 보이고 입력창은 그대로 있다', async () => {
      render(<PanelWithRun />);
      await openHistory();
      expect(screen.queryByText('할 일을 입력하면 여기에 진행 상황이 표시됩니다')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '실행 기록' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('textbox', { name: '할 일' })).toBeInTheDocument();
    });

    it('[실행 기록] 을 다시 누르면 대화로 돌아온다', async () => {
      render(<PanelWithRun />);
      await openHistory();
      fireEvent.click(screen.getByRole('button', { name: '실행 기록' }));
      expect(screen.getByText('할 일을 입력하면 여기에 진행 상황이 표시됩니다')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '실행 기록' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('[대화로 돌아가기] 를 누르면 대화로 돌아온다', async () => {
      render(<PanelWithRun />);
      await openHistory();
      fireEvent.click(screen.getByRole('button', { name: '대화로 돌아가기' }));
      expect(screen.getByText('할 일을 입력하면 여기에 진행 상황이 표시됩니다')).toBeInTheDocument();
    });

    // 입력창 추천 훅이 마운트 때 runs.list 를 1회 부른다 (spec 019) — 그 횟수를 기준으로 열 때마다 1회씩 는다
    it('열 때마다 기록 목록을 새로 읽는다', async () => {
      render(<PanelWithRun />);
      await waitFor(() => expect(window.api.runs.list).toHaveBeenCalledOnce());
      const mountCallCount = vi.mocked(window.api.runs.list).mock.calls.length;
      await openHistory();
      expect(window.api.runs.list).toHaveBeenCalledTimes(mountCallCount + 1);
      fireEvent.click(screen.getByRole('button', { name: '대화로 돌아가기' }));
      await openHistory();
      expect(window.api.runs.list).toHaveBeenCalledTimes(mountCallCount + 2);
    });

    it('기록을 보는 중에도 승인 카드가 입력창 위에 보인다', async () => {
      await startRun();
      await openHistory();
      emitApprovalWait();
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      expect(screen.getByText('아직 실행 기록이 없습니다')).toBeInTheDocument();
    });
  });
  describe('[설정] 전환 (spec 013)', () => {
    const EMPTY_CONVERSATION_TEXT = '할 일을 입력하면 여기에 진행 상황이 표시됩니다';

    /** 스킬 목록 응답(빈 목록)을 주고 [설정] 을 누른다 */
    async function openSettings(): Promise<void> {
      vi.mocked(window.api.skills.list).mockResolvedValue({ ok: true, data: { skillList: [] } });
      fireEvent.click(screen.getByRole('button', { name: '설정' }));
      await screen.findByText('아직 스킬이 없습니다');
    }

    it('[설정] 을 누르면 대화 자리에 설정 보기가 보이고 입력창은 그대로 있다', async () => {
      render(<PanelWithRun />);
      await openSettings();
      expect(screen.getByRole('region', { name: '설정' })).toBeInTheDocument();
      expect(screen.queryByText(EMPTY_CONVERSATION_TEXT)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '설정' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('textbox', { name: '할 일' })).toBeInTheDocument();
    });

    it('[설정] 을 다시 누르면 대화로 돌아온다', async () => {
      render(<PanelWithRun />);
      await openSettings();
      fireEvent.click(screen.getByRole('button', { name: '설정' }));
      expect(screen.queryByRole('region', { name: '설정' })).not.toBeInTheDocument();
      expect(screen.getByText(EMPTY_CONVERSATION_TEXT)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '설정' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('설정 보기에서 [대화로 돌아가기] 를 누르면 대화로 돌아온다', async () => {
      render(<PanelWithRun />);
      await openSettings();
      fireEvent.click(screen.getByRole('button', { name: '대화로 돌아가기' }));
      expect(screen.getByText(EMPTY_CONVERSATION_TEXT)).toBeInTheDocument();
    });

    it('설정을 보는 중에 [실행 기록] 을 누르면 설정은 꺼지고 기록이 보인다', async () => {
      render(<PanelWithRun />);
      await openSettings();
      vi.mocked(window.api.runs.list).mockResolvedValue({ ok: true, data: { runList: [] } });
      fireEvent.click(screen.getByRole('button', { name: '실행 기록' }));
      expect(await screen.findByText('아직 실행 기록이 없습니다')).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: '설정' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '설정' })).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByRole('button', { name: '실행 기록' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('기록을 보는 중에 [설정] 을 누르면 기록은 꺼지고 설정이 보인다', async () => {
      render(<PanelWithRun />);
      vi.mocked(window.api.runs.list).mockResolvedValue({ ok: true, data: { runList: [] } });
      fireEvent.click(screen.getByRole('button', { name: '실행 기록' }));
      await screen.findByText('아직 실행 기록이 없습니다');
      await openSettings();
      expect(screen.queryByText('아직 실행 기록이 없습니다')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '실행 기록' })).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByRole('button', { name: '설정' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('열 때마다 스킬 목록을 새로 읽는다', async () => {
      render(<PanelWithRun />);
      await openSettings();
      fireEvent.click(screen.getByRole('button', { name: '대화로 돌아가기' }));
      await openSettings();
      expect(window.api.skills.list).toHaveBeenCalledTimes(2);
    });

    it('설정을 보는 중에도 승인 카드가 입력창 위에 보인다', async () => {
      await startRun();
      await openSettings();
      emitApprovalWait();
      expect(screen.getByRole('alertdialog', { name: '승인 필요' })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: '설정' })).toBeInTheDocument();
    });
  });

  describe('입력창 추천 문구 (spec 019)', () => {
    it('새 탭이면 입력창 placeholder 가 새 탭 추천 문구다', async () => {
      render(<PanelWithRun />);
      expect(
        await screen.findByPlaceholderText('네이버에서 맛집 검색해서 평점 높은 곳 3개 알려줘'),
      ).toBeInTheDocument();
    });

    it('마운트하면 추천에 쓸 최근 작업을 runs.list 로 1회 읽는다', async () => {
      render(<PanelWithRun />);
      await waitFor(() => expect(window.api.runs.list).toHaveBeenCalledOnce());
    });
  });
});
