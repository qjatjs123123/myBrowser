import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FindBar } from '..';

function renderFindBar(overrides: Partial<Parameters<typeof FindBar>[0]> = {}) {
  const props = {
    text: '사과',
    count: { activeMatch: 2, matchCount: 5 },
    focusSignal: 1,
    onSearch: vi.fn(),
    onNext: vi.fn(),
    onPrev: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<FindBar {...props} />);
  return { props, input: screen.getByRole('textbox', { name: '찾을 내용' }) };
}

describe('FindBar', () => {
  it('열리면 입력에 포커스한다', () => {
    const { input } = renderFindBar();
    expect(input).toHaveFocus();
  });

  it('현재/전체 개수를 보인다', () => {
    renderFindBar();
    expect(screen.getByLabelText('찾은 결과')).toHaveTextContent('2/5');
  });

  it('결과가 없으면 0/0 이다', () => {
    renderFindBar({ count: { activeMatch: 0, matchCount: 0 } });
    expect(screen.getByLabelText('찾은 결과')).toHaveTextContent('0/0');
  });

  it('입력하면 onSearch 로 글자를 넘긴다', () => {
    const { input, props } = renderFindBar({ text: '' });
    fireEvent.change(input, { target: { value: '배' } });
    expect(props.onSearch).toHaveBeenCalledWith('배');
  });

  it('Enter 는 다음, Shift+Enter 는 이전 결과다', () => {
    const { input, props } = renderFindBar();
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(props.onNext).toHaveBeenCalledOnce();
    expect(props.onPrev).toHaveBeenCalledOnce();
  });

  it('Esc 면 닫는다', () => {
    const { input, props } = renderFindBar();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalled();
  });

  it('IME 조합 중 Enter 는 무시한다', () => {
    const { input, props } = renderFindBar();
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(props.onNext).not.toHaveBeenCalled();
  });

  it('검색어가 없으면 이전·다음 버튼이 비활성이다', () => {
    renderFindBar({ text: '', count: null });
    expect(screen.getByRole('button', { name: '다음 결과' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '이전 결과' })).toBeDisabled();
  });

  it('[찾기 닫기] 를 누르면 닫는다', () => {
    const { props } = renderFindBar();
    fireEvent.click(screen.getByRole('button', { name: '찾기 닫기' }));
    expect(props.onClose).toHaveBeenCalled();
  });
});
