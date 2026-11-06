import { describe, expect, it, vi } from 'vitest';

import { IPC } from '@shared/ipc/channels';
import { SKILL_MESSAGE, type ISkillStore, type TSkill } from '@shared/ipc/skills';

import { createSkillsHandlers } from '../handlers/skills';

const SKILL_ID = '00000000-0000-4000-8000-000000000001';

const SKILL: TSkill = {
  id: SKILL_ID,
  name: '기본 인원',
  description: '',
  body: '인원 말이 없으면 2명',
  isEnabled: true,
  createdAt: '2026-11-06T10:00:00.000Z',
  updatedAt: '2026-11-06T10:00:00.000Z',
};

function setup(overrides: Partial<ISkillStore> = {}) {
  const store = {
    list: vi.fn(() => [SKILL]),
    listEnabled: vi.fn(() => [SKILL]),
    create: vi.fn(() => ({ ok: true as const, skillList: [SKILL] })),
    update: vi.fn(() => ({ ok: true as const, skillList: [SKILL] })),
    remove: vi.fn(() => ({ ok: true as const, skillList: [] })),
    ...overrides,
  } satisfies ISkillStore;
  return { store, handlers: createSkillsHandlers(store) };
}

describe('skills 핸들러 skills:list', () => {
  it('skills:list 는 전체 목록을 성공 봉투로 돌려준다', () => {
    const { handlers } = setup();
    expect(handlers[IPC.skills.list]()).toEqual({ ok: true, data: { skillList: [SKILL] } });
  });

  it('skills:list 에 인자가 오면 INVALID_INPUT 이다', () => {
    const { handlers } = setup();
    expect(handlers[IPC.skills.list]({ x: 1 })).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
  });

  it('skills:list 응답에 여분 키가 끼면 보내기 전 parse 가 throw 한다', () => {
    const { handlers } = setup({ list: () => [{ ...SKILL, nameKey: '기본 인원' } as TSkill] });
    expect(() => handlers[IPC.skills.list]()).toThrow();
  });
});

describe('skills 핸들러 skills:create', () => {
  it('skills:create 는 앞뒤 공백을 다듬은 값으로 저장소를 부른다', () => {
    const { store, handlers } = setup();
    handlers[IPC.skills.create]({ name: ' 기본 인원 ', description: '', body: ' 2명 ' });
    expect(store.create).toHaveBeenCalledWith({ name: '기본 인원', description: '', body: '2명' });
  });

  it('skills:create 가 성공하면 최신 목록을 성공 봉투로 돌려준다', () => {
    const { handlers } = setup();
    expect(handlers[IPC.skills.create]({ name: '기본 인원', description: '', body: '2명' })).toEqual({
      ok: true,
      data: { skillList: [SKILL] },
    });
  });

  it('skills:create 에 여분 키가 오면 INVALID_INPUT 이고 저장소를 부르지 않는다', () => {
    const { store, handlers } = setup();
    const result = handlers[IPC.skills.create]({ name: '기본 인원', description: '', body: '2명', isEnabled: true });
    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: 'INVALID_INPUT', message: '요청 형식이 올바르지 않습니다' }),
      }),
    );
    expect(store.create).not.toHaveBeenCalled();
  });

  it('skills:create 에 빈 이름이 오면 INVALID_INPUT 이다', () => {
    const { handlers } = setup();
    expect(handlers[IPC.skills.create]({ name: '  ', description: '', body: '2명' })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_INPUT' },
    });
  });

  it('저장소가 CONFLICT 를 돌려주면 같은 code·message 로 실패 봉투를 돌려준다', () => {
    const { handlers } = setup({
      create: () => ({ ok: false, code: 'CONFLICT', message: SKILL_MESSAGE.duplicateName }),
    });
    expect(handlers[IPC.skills.create]({ name: '기본 인원', description: '', body: '2명' })).toEqual({
      ok: false,
      error: { code: 'CONFLICT', message: SKILL_MESSAGE.duplicateName },
    });
  });
});

describe('skills 핸들러 skills:update', () => {
  it('skills:update 는 isEnabled 만 바꾸는 요청을 저장소에 넘긴다', () => {
    const { store, handlers } = setup();
    handlers[IPC.skills.update]({ id: SKILL_ID, isEnabled: false });
    expect(store.update).toHaveBeenCalledWith({ id: SKILL_ID, isEnabled: false });
  });

  it('skills:update 에 id 만 오면 INVALID_INPUT 이다', () => {
    const { handlers } = setup();
    expect(handlers[IPC.skills.update]({ id: SKILL_ID })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_INPUT' },
    });
  });

  it('저장소가 LIMIT 을 돌려주면 같은 code·message 로 실패 봉투를 돌려준다', () => {
    const { handlers } = setup({ update: () => ({ ok: false, code: 'LIMIT', message: SKILL_MESSAGE.tooLong }) });
    expect(handlers[IPC.skills.update]({ id: SKILL_ID, isEnabled: true })).toEqual({
      ok: false,
      error: { code: 'LIMIT', message: SKILL_MESSAGE.tooLong },
    });
  });
});

describe('skills 핸들러 skills:delete', () => {
  it('skills:delete 는 id 로 저장소를 불러 남은 목록을 돌려준다', () => {
    const { store, handlers } = setup();
    expect(handlers[IPC.skills.delete]({ id: SKILL_ID })).toEqual({ ok: true, data: { skillList: [] } });
    expect(store.remove).toHaveBeenCalledWith(SKILL_ID);
  });

  it('skills:delete 에 uuid 가 아닌 id 가 오면 INVALID_INPUT 이다', () => {
    const { handlers } = setup();
    expect(handlers[IPC.skills.delete]({ id: 'skill-1' })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_INPUT' },
    });
  });

  it('저장소가 NOT_FOUND 를 돌려주면 같은 code·message 로 실패 봉투를 돌려준다', () => {
    const { handlers } = setup({ remove: () => ({ ok: false, code: 'NOT_FOUND', message: SKILL_MESSAGE.notFound }) });
    expect(handlers[IPC.skills.delete]({ id: SKILL_ID })).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: SKILL_MESSAGE.notFound },
    });
  });
});
