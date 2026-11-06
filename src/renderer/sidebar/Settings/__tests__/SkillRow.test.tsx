import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TSkill } from '@shared/ipc/skills';

import { SkillRow } from '../SkillRow';

const SKILL: TSkill = {
  id: '11111111-1111-4111-8111-111111111111',
  name: '기본 인원',
  description: '인원 말이 없으면 2명',
  body: '인원 말이 없으면 2명으로 한다',
  isEnabled: true,
  createdAt: '2026-11-06T01:00:00.000Z',
  updatedAt: '2026-11-06T01:00:00.000Z',
};

/** 기본 콜백으로 한 줄을 그린다 */
function renderRow(skill: TSkill = SKILL) {
  const props = { onToggle: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn() };
  render(<SkillRow skill={skill} {...props} />);
  return props;
}

describe('SkillRow', () => {
  it('이름과 설명을 보여준다', () => {
    renderRow();
    expect(screen.getByText('기본 인원')).toBeInTheDocument();
    expect(screen.getByText('인원 말이 없으면 2명')).toBeInTheDocument();
  });

  it('스위치는 “{이름} 사용” 이름으로 켜짐 상태를 알린다', () => {
    renderRow();
    expect(screen.getByRole('switch', { name: '기본 인원 사용' })).toHaveAttribute('aria-checked', 'true');
  });

  it('스위치를 누르면 바뀔 값으로 onToggle 을 부른다', () => {
    const { onToggle } = renderRow();
    fireEvent.click(screen.getByRole('switch', { name: '기본 인원 사용' }));
    expect(onToggle).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('[편집] 을 누르면 onEdit 을 부른다', () => {
    const { onEdit } = renderRow();
    fireEvent.click(screen.getByRole('button', { name: '기본 인원 편집' }));
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it('[삭제] 를 누르면 확인 창이 뜨고 기본 포커스는 [취소] 다', async () => {
    const { onDelete } = renderRow();
    fireEvent.click(screen.getByRole('button', { name: '기본 인원 삭제' }));
    expect(await screen.findByRole('alertdialog', { name: '스킬을 삭제할까요?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '취소' })).toHaveFocus();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('확인 창에서 [삭제] 를 누르면 onDelete 를 부른다', async () => {
    const { onDelete } = renderRow();
    fireEvent.click(screen.getByRole('button', { name: '기본 인원 삭제' }));
    await screen.findByRole('alertdialog');
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('확인 창에서 [취소] 를 누르면 지우지 않고 창을 닫는다', async () => {
    const { onDelete } = renderRow();
    fireEvent.click(screen.getByRole('button', { name: '기본 인원 삭제' }));
    await screen.findByRole('alertdialog');
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
  });
});
