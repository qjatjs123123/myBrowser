import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TaskInput } from '../TaskInput';

const SUGGESTION = '이 페이지 핵심만 3줄로 요약해줘';

/** 입력창을 그린다 — 콜백은 vi.fn */
function renderInput(props: { task?: string; suggestion?: string | null; isBusy?: boolean } = {}) {
  const onTaskChange = vi.fn();
  const onStart = vi.fn();
  render(
    <TaskInput
      task={props.task ?? ''}
      suggestion={props.suggestion === undefined ? SUGGESTION : props.suggestion}
      isBusy={props.isBusy ?? false}
      canStop={false}
      onTaskChange={onTaskChange}
      onStart={onStart}
      onStop={vi.fn()}
    />,
  );
  return { onTaskChange, onStart, textbox: screen.getByRole('textbox', { name: '할 일' }) };
}

describe('TaskInput 추천 문구 (spec 019)', () => {
  it('빈 입력에 추천이 있으면 placeholder 가 추천 문구다', () => {
    const { textbox } = renderInput();
    expect(textbox).toHaveAttribute('placeholder', SUGGESTION);
  });

  it('추천이 없으면 기존 placeholder 다', () => {
    const { textbox } = renderInput({ suggestion: null });
    expect(textbox).toHaveAttribute('placeholder', '할 일을 입력하세요');
  });

  it('입력 중이면 추천의 나머지 글자를 흐리게 잇는다', () => {
    renderInput({ task: '이 페이지' });
    const ghost = screen.getByTestId('task-suggestion-ghost');
    expect(ghost).toHaveTextContent('이 페이지 핵심만 3줄로 요약해줘');
    expect(ghost.lastElementChild).toHaveTextContent('핵심만 3줄로 요약해줘');
    expect(ghost.lastElementChild).toHaveClass('text-muted-foreground');
  });

  it('빈 입력이면 흐린 이어쓰기 층은 없다 (placeholder 가 보인다)', () => {
    renderInput();
    expect(screen.queryByTestId('task-suggestion-ghost')).not.toBeInTheDocument();
  });

  it('Tab 을 누르면 입력값이 추천 문구 전체가 되고 실행하지 않는다', () => {
    const { textbox, onTaskChange, onStart } = renderInput({ task: '이 페이지' });
    const isNotPrevented = fireEvent.keyDown(textbox, { key: 'Tab' });
    expect(isNotPrevented).toBe(false);
    expect(onTaskChange).toHaveBeenCalledExactlyOnceWith(SUGGESTION);
    expect(onStart).not.toHaveBeenCalled();
  });

  it.each([
    ['Shift+Tab', { key: 'Tab', shiftKey: true }],
    ['Ctrl+Tab', { key: 'Tab', ctrlKey: true }],
    ['IME 조합 중 Tab', { key: 'Tab', keyCode: 229 }],
  ])('%s 는 추천을 입력하지 않는다', (_, init) => {
    const { textbox, onTaskChange } = renderInput({ task: '이 페이지' });
    fireEvent.keyDown(textbox, init);
    expect(onTaskChange).not.toHaveBeenCalled();
  });

  it('추천이 없으면 Tab 은 기본 동작(포커스 이동) 그대로다', () => {
    const { textbox, onTaskChange } = renderInput({ suggestion: null });
    const isNotPrevented = fireEvent.keyDown(textbox, { key: 'Tab' });
    expect(isNotPrevented).toBe(true);
    expect(onTaskChange).not.toHaveBeenCalled();
  });

  it('추천이 보이면 안내 줄에 Tab 안내가 붙는다', () => {
    renderInput();
    expect(screen.getByText('Tab 추천 입력 · Enter 실행 · Shift+Enter 줄바꿈')).toBeInTheDocument();
  });

  it('추천이 없으면 안내 줄은 기존 문구다', () => {
    renderInput({ suggestion: null });
    expect(screen.getByText('Enter 실행 · Shift+Enter 줄바꿈')).toBeInTheDocument();
  });

  it('실행 중이면 추천을 보이지 않는다', () => {
    const { textbox, onTaskChange } = renderInput({ task: '이 페이지', isBusy: true });
    expect(textbox).toHaveAttribute('placeholder', '할 일을 입력하세요');
    expect(screen.queryByTestId('task-suggestion-ghost')).not.toBeInTheDocument();
    fireEvent.keyDown(textbox, { key: 'Tab' });
    expect(onTaskChange).not.toHaveBeenCalled();
  });
});
