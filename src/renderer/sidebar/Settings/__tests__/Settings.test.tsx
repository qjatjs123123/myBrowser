import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TSkill } from '@shared/ipc/skills';

import { toast } from '@/lib/toast';

import { Settings } from '..';

vi.mock('@/lib/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const SKILL: TSkill = {
  id: '11111111-1111-4111-8111-111111111111',
  name: '기본 인원',
  description: '',
  body: '인원 말이 없으면 2명',
  isEnabled: true,
  createdAt: '2026-11-06T01:00:00.000Z',
  updatedAt: '2026-11-06T01:00:00.000Z',
};

/** 목록 응답을 주고 설정 보기를 그린 뒤 목록 자리가 뜰 때까지 기다린다 */
async function renderSettings(skillList: TSkill[] = [SKILL]) {
  vi.mocked(window.api.skills.list).mockResolvedValue({ ok: true, data: { skillList } });
  const onClose = vi.fn();
  render(<Settings onClose={onClose} />);
  await screen.findByRole('button', { name: '스킬 추가' });
  return { onClose };
}

/** 편집 폼의 칸을 채우고 [저장] 을 누른다 */
function submitEditor(name: string, body: string): void {
  fireEvent.change(screen.getByRole('textbox', { name: '이름' }), { target: { value: name } });
  fireEvent.change(screen.getByRole('textbox', { name: '내용' }), { target: { value: body } });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
}

describe('Settings', () => {
  it('“설정” 영역에 스킬 섹션 제목과 설명을 보여준다', async () => {
    await renderSettings();
    const region = screen.getByRole('region', { name: '설정' });
    expect(within(region).getByRole('heading', { name: '스킬' })).toBeInTheDocument();
    expect(
      within(region).getByText('에이전트가 매 실행에 따르는 내 지침입니다. 다음 실행부터 적용됩니다.'),
    ).toBeInTheDocument();
  });

  it('스킬이 없으면 “아직 스킬이 없습니다” 를 보여준다', async () => {
    await renderSettings([]);
    expect(screen.getByText('아직 스킬이 없습니다')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: '스킬 목록' })).not.toBeInTheDocument();
  });

  it('스킬 목록에 저장된 스킬을 보여준다', async () => {
    await renderSettings();
    expect(within(screen.getByRole('list', { name: '스킬 목록' })).getByText('기본 인원')).toBeInTheDocument();
  });

  it('[대화로 돌아가기] 를 누르면 onClose 를 부른다', async () => {
    const { onClose } = await renderSettings();
    fireEvent.click(screen.getByRole('button', { name: '대화로 돌아가기' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('목록 읽기가 실패하면 main 메시지로 toast 를 띄우고 [다시 시도] 를 보인다', async () => {
    vi.mocked(window.api.skills.list).mockResolvedValue({
      ok: false,
      error: { code: 'INTERNAL', message: '저장소 오류' },
    });
    render(<Settings onClose={vi.fn()} />);
    expect(await screen.findByRole('button', { name: '다시 시도' })).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith('저장소 오류');
  });

  it('스위치를 끄면 isEnabled false 로 skills.update 를 부르고 응답 목록을 보인다', async () => {
    await renderSettings();
    vi.mocked(window.api.skills.update).mockResolvedValue({
      ok: true,
      data: { skillList: [{ ...SKILL, isEnabled: false }] },
    });
    fireEvent.click(screen.getByRole('switch', { name: '기본 인원 사용' }));
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: '기본 인원 사용' })).toHaveAttribute('aria-checked', 'false'),
    );
    expect(window.api.skills.update).toHaveBeenCalledExactlyOnceWith({ id: SKILL.id, isEnabled: false });
  });

  it('켜기가 LIMIT 실패면 main 메시지로 toast 를 띄우고 꺼진 채로 둔다', async () => {
    await renderSettings([{ ...SKILL, isEnabled: false }]);
    vi.mocked(window.api.skills.update).mockResolvedValue({
      ok: false,
      error: { code: 'LIMIT', message: '켜진 스킬 내용이 너무 깁니다 (12000자까지)' },
    });
    fireEvent.click(screen.getByRole('switch', { name: '기본 인원 사용' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('켜진 스킬 내용이 너무 깁니다 (12000자까지)'));
    expect(screen.getByRole('switch', { name: '기본 인원 사용' })).toHaveAttribute('aria-checked', 'false');
  });

  it('삭제 확인 창에서 [삭제] 를 누르면 skills.delete 를 부르고 목록을 비운다', async () => {
    await renderSettings();
    vi.mocked(window.api.skills.delete).mockResolvedValue({ ok: true, data: { skillList: [] } });
    fireEvent.click(screen.getByRole('button', { name: '기본 인원 삭제' }));
    await screen.findByRole('alertdialog', { name: '스킬을 삭제할까요?' });
    expect(screen.getByRole('button', { name: '취소' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    expect(await screen.findByText('아직 스킬이 없습니다')).toBeInTheDocument();
    expect(window.api.skills.delete).toHaveBeenCalledExactlyOnceWith({ id: SKILL.id });
  });

  it('[스킬 추가] 로 저장에 성공하면 목록으로 돌아가 새 스킬을 보인다', async () => {
    await renderSettings([]);
    const created: TSkill = { ...SKILL, id: '22222222-2222-4222-8222-222222222222', name: '캐치테이블' };
    vi.mocked(window.api.skills.create).mockResolvedValue({ ok: true, data: { skillList: [created] } });
    fireEvent.click(screen.getByRole('button', { name: '스킬 추가' }));
    submitEditor('캐치테이블', '날짜 먼저');
    expect(await screen.findByRole('list', { name: '스킬 목록' })).toHaveTextContent('캐치테이블');
    expect(screen.queryByRole('form', { name: '스킬 편집' })).not.toBeInTheDocument();
    expect(window.api.skills.create).toHaveBeenCalledExactlyOnceWith({
      name: '캐치테이블',
      description: '',
      body: '날짜 먼저',
    });
  });

  it('[스킬 추가] 저장이 실패하면 toast 를 띄우고 폼을 그대로 둔다', async () => {
    await renderSettings();
    vi.mocked(window.api.skills.create).mockResolvedValue({
      ok: false,
      error: { code: 'CONFLICT', message: '같은 이름의 스킬이 있습니다' },
    });
    fireEvent.click(screen.getByRole('button', { name: '스킬 추가' }));
    submitEditor('기본 인원', '2명');
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('같은 이름의 스킬이 있습니다'));
    expect(screen.getByRole('form', { name: '스킬 편집' })).toBeInTheDocument();
  });

  it('이름이 41자면 오류 문구를 보이고 skills.create 를 부르지 않는다', async () => {
    await renderSettings([]);
    fireEvent.click(screen.getByRole('button', { name: '스킬 추가' }));
    submitEditor('가'.repeat(41), '내용');
    expect(await screen.findByText('이름은 40자까지 쓸 수 있습니다')).toBeInTheDocument();
    expect(window.api.skills.create).not.toHaveBeenCalled();
  });

  it('[편집] 으로 저장하면 id 와 폼 값으로 skills.update 를 부른다', async () => {
    await renderSettings();
    vi.mocked(window.api.skills.update).mockResolvedValue({
      ok: true,
      data: { skillList: [{ ...SKILL, body: '3명' }] },
    });
    fireEvent.click(screen.getByRole('button', { name: '기본 인원 편집' }));
    submitEditor('기본 인원', '3명');
    await screen.findByRole('list', { name: '스킬 목록' });
    expect(window.api.skills.update).toHaveBeenCalledExactlyOnceWith({
      id: SKILL.id,
      name: '기본 인원',
      description: '',
      body: '3명',
    });
  });

  it('편집 폼에서 [취소] 를 누르면 저장 없이 목록으로 돌아간다', async () => {
    await renderSettings();
    fireEvent.click(screen.getByRole('button', { name: '스킬 추가' }));
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(screen.getByRole('list', { name: '스킬 목록' })).toBeInTheDocument();
    expect(window.api.skills.create).not.toHaveBeenCalled();
  });
});
