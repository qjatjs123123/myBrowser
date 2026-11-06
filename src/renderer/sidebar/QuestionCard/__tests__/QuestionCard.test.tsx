import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TQuestion } from '@shared/agent/run';

import { QuestionCard } from '..';

const QUESTION: TQuestion = { requestId: 'req-1', stepN: 2, text: '몇 명 예약할까요?', optionList: ['2명', '4명'] };

/** 질문 카드를 그리고 답 콜백을 돌려준다 */
function renderCard(question: TQuestion = QUESTION) {
  const onAnswer = vi.fn<(answer: string) => Promise<void>>().mockResolvedValue(undefined);
  render(<QuestionCard question={question} onAnswer={onAnswer} />);
  return { onAnswer, card: screen.getByRole('dialog', { name: '에이전트 질문' }) };
}

describe('QuestionCard', () => {
  it('질문과 선택지 버튼을 보여준다', () => {
    const { card } = renderCard();
    expect(card).toHaveTextContent('몇 명 예약할까요?');
    expect(screen.getByRole('button', { name: '2명' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '4명' })).toBeInTheDocument();
  });

  it('선택지가 있으면 열리자마자 첫 선택지에 포커스가 간다', () => {
    renderCard();
    expect(screen.getByRole('button', { name: '2명' })).toHaveFocus();
  });

  it('선택지가 없으면 열리자마자 답변칸에 포커스가 간다', () => {
    renderCard({ ...QUESTION, optionList: [] });
    expect(screen.getByRole('textbox', { name: '답변' })).toHaveFocus();
  });

  it('열자마자 Enter 를 누르면 첫 선택지로 답한다', async () => {
    const { onAnswer } = renderCard();
    fireEvent.keyDown(screen.getByRole('button', { name: '2명' }), { key: 'Enter' });
    await waitFor(() => expect(onAnswer).toHaveBeenCalledExactlyOnceWith('2명'));
  });

  it('선택지를 누르면 그 문구로 답한다', async () => {
    const { onAnswer } = renderCard();
    fireEvent.click(screen.getByRole('button', { name: '4명' }));
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith('4명'));
  });

  it('자유 입력 후 [보내기] 를 누르면 앞뒤 공백을 뺀 답을 보낸다', async () => {
    const { onAnswer } = renderCard();
    fireEvent.change(screen.getByRole('textbox', { name: '답변' }), { target: { value: '  3명  ' } });
    fireEvent.click(screen.getByRole('button', { name: '보내기' }));
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith('3명'));
  });

  it('답변칸에서 폼을 제출하면(Enter) 보낸다', async () => {
    const { onAnswer } = renderCard();
    const textbox = screen.getByRole('textbox', { name: '답변' });
    fireEvent.change(textbox, { target: { value: '3명' } });
    fireEvent.submit(textbox);
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith('3명'));
  });

  it('답변이 비었거나 공백뿐이면 [보내기] 가 비활성이다', () => {
    renderCard();
    const button = screen.getByRole('button', { name: '보내기' });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: '답변' }), { target: { value: '   ' } });
    expect(button).toBeDisabled();
  });

  it('비밀번호·카드번호를 쓰지 말라는 안내 문구를 보여준다', () => {
    const { card } = renderCard();
    expect(card).toHaveTextContent('비밀번호·카드번호는 여기 쓰지 말고 탭에 직접 입력하세요');
  });

  it('선택지가 없으면 선택지 버튼 없이 [보내기] 만 있다', () => {
    renderCard({ ...QUESTION, optionList: [] });
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: '보내기' })).toBeInTheDocument();
  });
});
