import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TSkill } from '@shared/ipc/skills';

import { useSkills } from '../useSkills';

/** 테스트용 스킬 한 건 */
function createSkill(patch: Partial<TSkill> & Pick<TSkill, 'id' | 'name'>): TSkill {
  return {
    description: '',
    body: '내용',
    isEnabled: true,
    createdAt: '2026-11-06T01:00:00.000Z',
    updatedAt: '2026-11-06T01:00:00.000Z',
    ...patch,
  };
}

const FIRST = createSkill({ id: '11111111-1111-4111-8111-111111111111', name: '기본 인원' });
const SECOND = createSkill({ id: '22222222-2222-4222-8222-222222222222', name: '캐치테이블' });

/** 첫 목록 응답을 주고 훅을 그린 뒤 ready 가 될 때까지 기다린다 */
async function renderReady(skillList: TSkill[] = [FIRST]) {
  vi.mocked(window.api.skills.list).mockResolvedValue({ ok: true, data: { skillList } });
  const view = renderHook(() => useSkills());
  await waitFor(() => expect(view.result.current.status).toBe('ready'));
  return view;
}

describe('useSkills', () => {
  it('마운트하면 skills.list 를 읽어 목록과 ready 상태를 준다', async () => {
    const { result } = await renderReady();
    expect(window.api.skills.list).toHaveBeenCalledOnce();
    expect(result.current.skillList).toEqual([FIRST]);
    expect(result.current.loadError).toBeNull();
  });

  it('첫 응답 전에는 loading 상태다', () => {
    vi.mocked(window.api.skills.list).mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => useSkills());
    expect(result.current.status).toBe('loading');
  });

  it('목록 읽기가 실패 봉투면 error 상태와 main 의 메시지를 준다', async () => {
    vi.mocked(window.api.skills.list).mockResolvedValue({
      ok: false,
      error: { code: 'INTERNAL', message: '저장소 오류' },
    });
    const { result } = renderHook(() => useSkills());
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.loadError).toEqual({ message: '저장소 오류' });
  });

  it('create 가 성공하면 응답 목록으로 바꾸고 봉투를 돌려준다', async () => {
    const { result } = await renderReady();
    const created = { ok: true as const, data: { skillList: [FIRST, SECOND] } };
    vi.mocked(window.api.skills.create).mockResolvedValue(created);
    let returned: unknown;
    await act(async () => {
      returned = await result.current.create({ name: '캐치테이블', description: '', body: '날짜 먼저' });
    });
    expect(returned).toEqual(created);
    expect(window.api.skills.create).toHaveBeenCalledWith({ name: '캐치테이블', description: '', body: '날짜 먼저' });
    expect(result.current.skillList).toEqual([FIRST, SECOND]);
  });

  it('create 가 실패 봉투면 그대로 돌려주고 목록은 그대로 둔다', async () => {
    const { result } = await renderReady();
    const conflict = {
      ok: false as const,
      error: { code: 'CONFLICT' as const, message: '같은 이름의 스킬이 있습니다' },
    };
    vi.mocked(window.api.skills.create).mockResolvedValue(conflict);
    let returned: unknown;
    await act(async () => {
      returned = await result.current.create({ name: '기본 인원', description: '', body: '2명' });
    });
    expect(returned).toEqual(conflict);
    expect(result.current.skillList).toEqual([FIRST]);
  });

  it('create 가 throw 하면 INTERNAL 실패 봉투를 돌려준다', async () => {
    const { result } = await renderReady();
    vi.mocked(window.api.skills.create).mockRejectedValue(new Error('ipc'));
    let returned: unknown;
    await act(async () => {
      returned = await result.current.create({ name: '새', description: '', body: '내용' });
    });
    expect(returned).toEqual({ ok: false, error: { code: 'INTERNAL', message: '스킬을 저장하지 못했습니다' } });
    expect(result.current.skillList).toEqual([FIRST]);
  });

  it('update 가 성공하면 응답 목록으로 바꾼다', async () => {
    const { result } = await renderReady();
    const turnedOff = { ...FIRST, isEnabled: false };
    vi.mocked(window.api.skills.update).mockResolvedValue({ ok: true, data: { skillList: [turnedOff] } });
    await act(async () => {
      await result.current.update({ id: FIRST.id, isEnabled: false });
    });
    expect(window.api.skills.update).toHaveBeenCalledWith({ id: FIRST.id, isEnabled: false });
    expect(result.current.skillList).toEqual([turnedOff]);
  });

  it('remove 는 id 로 skills.delete 를 부르고 응답 목록으로 바꾼다', async () => {
    const { result } = await renderReady([FIRST, SECOND]);
    vi.mocked(window.api.skills.delete).mockResolvedValue({ ok: true, data: { skillList: [SECOND] } });
    await act(async () => {
      await result.current.remove(FIRST.id);
    });
    expect(window.api.skills.delete).toHaveBeenCalledWith({ id: FIRST.id });
    expect(result.current.skillList).toEqual([SECOND]);
  });

  it('reload 하면 목록을 다시 읽는다', async () => {
    const { result } = await renderReady();
    vi.mocked(window.api.skills.list).mockResolvedValue({ ok: true, data: { skillList: [FIRST, SECOND] } });
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.skillList).toEqual([FIRST, SECOND]));
    expect(window.api.skills.list).toHaveBeenCalledTimes(2);
  });
});
