import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ChoiceList, type IChoice } from '..';

const CHOICE_LIST: IChoice<string>[] = [
  { value: 'a', label: '첫째' },
  { value: 'b', label: '둘째' },
  { value: 'c', label: '셋째' },
];

/** 목록을 그리고 선택 콜백을 돌려준다 */
function renderList(props: { defaultIndex?: number; isDisabled?: boolean } = {}) {
  const onChoose = vi.fn();
  render(
    <ChoiceList
      label="선택"
      choiceList={CHOICE_LIST}
      defaultIndex={props.defaultIndex}
      isDisabled={props.isDisabled ?? false}
      onChoose={onChoose}
    />,
  );
  return { onChoose, group: screen.getByRole('group', { name: '선택' }) };
}

describe('ChoiceList', () => {
  it('열리면 defaultIndex 줄에 포커스가 간다', () => {
    renderList({ defaultIndex: 2 });
    expect(screen.getByRole('button', { name: '셋째' })).toHaveFocus();
  });

  it('↓ 를 누르면 다음 줄로, 끝에서는 처음으로 돌아간다', () => {
    const { group } = renderList({ defaultIndex: 1 });
    fireEvent.keyDown(group, { key: 'ArrowDown' });
    expect(screen.getByRole('button', { name: '셋째' })).toHaveFocus();
    fireEvent.keyDown(group, { key: 'ArrowDown' });
    expect(screen.getByRole('button', { name: '첫째' })).toHaveFocus();
  });

  it('↑ 를 누르면 이전 줄로, 처음에서는 끝으로 간다', () => {
    const { group } = renderList();
    fireEvent.keyDown(group, { key: 'ArrowUp' });
    expect(screen.getByRole('button', { name: '셋째' })).toHaveFocus();
  });

  it('숫자키를 누르면 그 번호의 값을 고른다', () => {
    const { group, onChoose } = renderList();
    fireEvent.keyDown(group, { key: '2' });
    expect(onChoose).toHaveBeenCalledExactlyOnceWith('b');
  });

  it('목록보다 큰 숫자키는 무시한다', () => {
    const { group, onChoose } = renderList();
    fireEvent.keyDown(group, { key: '4' });
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('Enter 를 누르면 강조된 줄의 값을 한 번 고르고 기본 동작을 막는다', () => {
    const { group, onChoose } = renderList({ defaultIndex: 1 });
    const isNotPrevented = fireEvent.keyDown(group, { key: 'Enter' });
    expect(onChoose).toHaveBeenCalledExactlyOnceWith('b');
    expect(isNotPrevented).toBe(false);
  });

  it('Space 도 강조된 줄의 값을 고르고 기본 동작을 막는다', () => {
    const { group, onChoose } = renderList();
    const isNotPrevented = fireEvent.keyDown(group, { key: ' ' });
    expect(onChoose).toHaveBeenCalledExactlyOnceWith('a');
    expect(isNotPrevented).toBe(false);
  });

  it('줄을 클릭하면 그 값을 고른다', () => {
    const { onChoose } = renderList();
    fireEvent.click(screen.getByRole('button', { name: '셋째' }));
    expect(onChoose).toHaveBeenCalledExactlyOnceWith('c');
  });

  it('번호는 버튼의 접근 이름에 들어가지 않는다', () => {
    renderList();
    expect(screen.getAllByRole('button').map((button) => button.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    expect(screen.getByRole('button', { name: '첫째' })).toHaveAccessibleName('첫째');
  });

  it('비활성이면 키·클릭으로 고르지 않는다', () => {
    const { group, onChoose } = renderList({ isDisabled: true });
    fireEvent.keyDown(group, { key: 'Enter' });
    fireEvent.keyDown(group, { key: '1' });
    expect(onChoose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '첫째' })).toBeDisabled();
  });
});
