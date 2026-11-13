import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TApprovalRequest } from '@shared/agent/run';

import { ApprovalPanel } from '..';

const GUARD_REQUEST: TApprovalRequest = {
  requestId: 'req-1',
  stepN: 2,
  kind: 'guard',
  source: 'structure',
  reason: '확정·결제 버튼은 사용자가 결정합니다',
  display: { action: '클릭', target: '예약 확정' },
  modelNote: null,
};

const MODEL_REQUEST: TApprovalRequest = {
  requestId: 'req-2',
  stepN: 3,
  kind: 'model',
  source: 'model',
  reason: '예약 전에 확인',
  display: { action: '확인 요청', target: '' },
  modelNote: '오늘 7시 2명으로 예약해도 될까요?',
};

/** 승인 창을 그리고 결정 콜백을 돌려준다 */
function renderPanel(request: TApprovalRequest) {
  const onDecide = vi.fn<(decision: string) => Promise<void>>().mockResolvedValue(undefined);
  render(<ApprovalPanel request={request} onDecide={onDecide} />);
  return { onDecide, dialog: screen.getByRole('alertdialog', { name: '승인 필요' }) };
}

describe('ApprovalPanel', () => {
  it('가드 승인 창은 행동·대상·이유를 이벤트 값 그대로 보여준다', () => {
    const { dialog } = renderPanel(GUARD_REQUEST);
    expect(dialog).toHaveTextContent('클릭');
    expect(dialog).toHaveTextContent('예약 확정');
    expect(dialog).toHaveTextContent('확정·결제 버튼은 사용자가 결정합니다');
  });

  it('픽셀 승인 창은 요소를 모르는 좌표 문구를 그대로 대상에 보여준다', () => {
    const { dialog } = renderPanel({
      ...GUARD_REQUEST,
      source: 'pixel',
      display: { action: '클릭', target: '좌표 (10, 20) — 요소를 확인할 수 없음' },
    });
    expect(dialog).toHaveTextContent('좌표 (10, 20) — 요소를 확인할 수 없음');
  });

  it('열리면 기본 포커스가 [거부] 버튼이다', () => {
    renderPanel(GUARD_REQUEST);
    expect(screen.getByRole('button', { name: '거부' })).toHaveFocus();
  });

  it('[에이전트가 누르기] 를 누르면 agent 결정을 보낸다', async () => {
    const { onDecide } = renderPanel(GUARD_REQUEST);
    fireEvent.click(screen.getByRole('button', { name: '에이전트가 누르기' }));
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith('agent'));
  });

  it('[거부] 를 누르면 denied 결정을 보낸다', async () => {
    const { onDecide } = renderPanel(GUARD_REQUEST);
    fireEvent.click(screen.getByRole('button', { name: '거부' }));
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith('denied'));
  });

  it('[직접 누를게요] 를 누르면 결정을 보내지 않고 안내 문구와 [계속] 을 보여준다', () => {
    const { onDecide, dialog } = renderPanel(GUARD_REQUEST);
    fireEvent.click(screen.getByRole('button', { name: '직접 누를게요' }));
    expect(onDecide).not.toHaveBeenCalled();
    expect(dialog).toHaveTextContent('탭에서 직접 누른 뒤 [계속]을 누르세요');
    expect(screen.getByRole('button', { name: '계속' })).toHaveFocus();
    expect(screen.queryByRole('button', { name: '에이전트가 누르기' })).not.toBeInTheDocument();
  });

  it('직접 누르기 안내에서 [계속] 을 누르면 user_done 결정을 보낸다', async () => {
    const { onDecide } = renderPanel(GUARD_REQUEST);
    fireEvent.click(screen.getByRole('button', { name: '직접 누를게요' }));
    fireEvent.click(screen.getByRole('button', { name: '계속' }));
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith('user_done'));
  });

  it('결정을 보내는 동안에는 버튼이 비활성이다', () => {
    const onDecide = vi.fn(() => new Promise<void>(() => {}));
    render(<ApprovalPanel request={GUARD_REQUEST} onDecide={onDecide} />);
    fireEvent.click(screen.getByRole('button', { name: '거부' }));
    expect(screen.getByRole('button', { name: '에이전트가 누르기' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '거부' })).toBeDisabled();
  });

  it('모델 승인 창은 [승인]/[거부] 두 버튼만 있다', () => {
    renderPanel(MODEL_REQUEST);
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.getByRole('button', { name: '승인' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '거부' })).toBeInTheDocument();
  });

  it('모델 승인 창은 모델 문장을 “에이전트 설명” 라벨로 따로 보여준다', () => {
    renderPanel(MODEL_REQUEST);
    expect(screen.getByText('에이전트 설명').nextElementSibling).toHaveTextContent('오늘 7시 2명으로 예약해도 될까요?');
    expect(screen.getByText('확인 요청')).toBeInTheDocument();
  });

  it('모델 승인 창도 기본 포커스가 [거부] 버튼이다', () => {
    renderPanel(MODEL_REQUEST);
    expect(screen.getByRole('button', { name: '거부' })).toHaveFocus();
  });

  it('모델 승인 창에서 [승인] 을 누르면 approved 결정을 보낸다', async () => {
    const { onDecide } = renderPanel(MODEL_REQUEST);
    fireEvent.click(screen.getByRole('button', { name: '승인' }));
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith('approved'));
  });

  it('가드 승인 창에는 “에이전트 설명” 이 없다', () => {
    renderPanel(GUARD_REQUEST);
    expect(screen.queryByText('에이전트 설명')).not.toBeInTheDocument();
  });

  describe('번호 선택 목록 (spec 009)', () => {
    it('가드 승인 창은 열자마자 Enter 를 누르면 거부한다 (승인 아님)', async () => {
      const { onDecide } = renderPanel(GUARD_REQUEST);
      fireEvent.keyDown(screen.getByRole('button', { name: '거부' }), { key: 'Enter' });
      await waitFor(() => expect(onDecide).toHaveBeenCalledExactlyOnceWith('denied'));
    });

    it('모델 승인 창도 열자마자 Enter 를 누르면 거부한다 (승인 아님)', async () => {
      const { onDecide } = renderPanel(MODEL_REQUEST);
      fireEvent.keyDown(screen.getByRole('button', { name: '거부' }), { key: 'Enter' });
      await waitFor(() => expect(onDecide).toHaveBeenCalledExactlyOnceWith('denied'));
    });

    it('↑ 로 [에이전트가 누르기] 로 옮긴 뒤 Enter 를 누르면 agent 결정을 보낸다', async () => {
      const { onDecide } = renderPanel(GUARD_REQUEST);
      const group = screen.getByRole('group', { name: '승인 선택' });
      fireEvent.keyDown(group, { key: 'ArrowUp' });
      expect(screen.getByRole('button', { name: '에이전트가 누르기' })).toHaveFocus();
      fireEvent.keyDown(group, { key: 'Enter' });
      await waitFor(() => expect(onDecide).toHaveBeenCalledExactlyOnceWith('agent'));
    });

    it('숫자 2 를 누르면 agent 결정을 보낸다', async () => {
      const { onDecide } = renderPanel(GUARD_REQUEST);
      fireEvent.keyDown(screen.getByRole('group', { name: '승인 선택' }), { key: '2' });
      await waitFor(() => expect(onDecide).toHaveBeenCalledExactlyOnceWith('agent'));
    });

    it('숫자 1 을 누르면 결정을 보내지 않고 직접 누르기 안내로 바뀐다', () => {
      const { onDecide } = renderPanel(GUARD_REQUEST);
      fireEvent.keyDown(screen.getByRole('group', { name: '승인 선택' }), { key: '1' });
      expect(onDecide).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: '계속' })).toHaveFocus();
    });
  });
});
