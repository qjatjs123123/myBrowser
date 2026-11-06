import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TSkill } from '@shared/ipc/skills';

import { toast } from '@/lib/toast';

import { SkillEditor } from '../SkillEditor';

vi.mock('@/lib/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const OK = { ok: true as const, data: null };

/** 폼을 그린다 — skill 이 없으면 새 스킬 */
function renderEditor(skill: TSkill | null = null) {
  const onSave = vi.fn().mockResolvedValue(OK);
  const onCancel = vi.fn();
  render(<SkillEditor skill={skill} onSave={onSave} onCancel={onCancel} />);
  return { onSave, onCancel };
}

/** 이름이 name 으로 시작하는 칸에 값을 넣는다 */
function fill(name: string, value: string): void {
  fireEvent.change(screen.getByRole('textbox', { name: new RegExp(`^${name}`) }), { target: { value } });
}

describe('SkillEditor', () => {
  it('“스킬 편집” 폼에 이름·설명·내용 칸과 민감 정보 안내가 있다', () => {
    renderEditor();
    expect(screen.getByRole('form', { name: '스킬 편집' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '이름' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /^설명/ })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '내용' })).toBeInTheDocument();
    expect(screen.getByText('비밀번호·카드번호 같은 민감 정보는 적지 마세요')).toBeInTheDocument();
  });

  it('내용을 쓰면 글자 수를 n / 4000 으로 보여준다', () => {
    renderEditor();
    expect(screen.getByText('0 / 4000')).toBeInTheDocument();
    fill('내용', '날짜 먼저');
    expect(screen.getByText('5 / 4000')).toBeInTheDocument();
  });

  it('이름이 41자면 칸 아래 한국어 오류 문구를 보이고 저장하지 않는다', async () => {
    const { onSave } = renderEditor();
    fill('이름', '가'.repeat(41));
    fill('내용', '내용');
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    const nameInput = screen.getByRole('textbox', { name: '이름' });
    await waitFor(() => expect(nameInput).toHaveAttribute('aria-invalid', 'true'));
    expect(nameInput).toHaveAccessibleDescription('이름은 40자까지 쓸 수 있습니다');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('제출이 막히면 toast 를 1개 띄운다', async () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByText('이름을 입력해 주세요')).toBeInTheDocument();
    expect(screen.getByText('내용을 입력해 주세요')).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledExactlyOnceWith('입력한 내용을 확인해 주세요');
  });

  it('설명이 201자·내용이 4001자면 각 칸 아래 오류 문구를 보인다', async () => {
    renderEditor();
    fill('이름', '이름');
    fill('설명', '가'.repeat(201));
    fill('내용', '가'.repeat(4001));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByText('설명은 200자까지 쓸 수 있습니다')).toBeInTheDocument();
    expect(screen.getByText('내용은 4000자까지 쓸 수 있습니다')).toBeInTheDocument();
  });

  it('올바르면 앞뒤 공백을 잘라 onSave 를 부른다', async () => {
    const { onSave } = renderEditor();
    fill('이름', '  캐치테이블  ');
    fill('내용', ' 날짜를 먼저 고른다 ');
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledExactlyOnceWith({
        name: '캐치테이블',
        description: '',
        body: '날짜를 먼저 고른다',
      }),
    );
  });

  it('저장이 실패 봉투면 main 메시지로 toast 를 띄우고 입력을 그대로 둔다', async () => {
    const { onSave } = renderEditor();
    onSave.mockResolvedValue({ ok: false, error: { code: 'CONFLICT', message: '같은 이름의 스킬이 있습니다' } });
    fill('이름', '기본 인원');
    fill('내용', '2명');
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('같은 이름의 스킬이 있습니다'));
    expect(screen.getByRole('textbox', { name: '이름' })).toHaveValue('기본 인원');
  });

  it('고칠 스킬을 받으면 칸에 기존 값을 채운다', () => {
    renderEditor({
      id: '11111111-1111-4111-8111-111111111111',
      name: '기본 인원',
      description: '설명',
      body: '2명',
      isEnabled: true,
      createdAt: '2026-11-06T01:00:00.000Z',
      updatedAt: '2026-11-06T01:00:00.000Z',
    });
    expect(screen.getByRole('textbox', { name: '이름' })).toHaveValue('기본 인원');
    expect(screen.getByRole('textbox', { name: /^설명/ })).toHaveValue('설명');
    expect(screen.getByRole('textbox', { name: '내용' })).toHaveValue('2명');
  });

  it('[취소] 를 누르면 onCancel 을 부른다', () => {
    const { onCancel } = renderEditor();
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
