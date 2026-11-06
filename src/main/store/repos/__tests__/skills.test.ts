import type { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SKILL_MESSAGE, type ISkillStore, type TSkill } from '@shared/ipc/skills';

import { openDatabase } from '../../db';
import { createSkillRepo } from '../skills';

const NOW = new Date('2026-11-06T10:00:00.000Z');
const MISSING_ID = '00000000-0000-4000-8000-999999999999';

let db: DatabaseSync;
let repo: ISkillStore;
let idCount = 0;

function createId(): string {
  idCount += 1;
  return `00000000-0000-4000-8000-${String(idCount).padStart(12, '0')}`;
}

beforeEach(() => {
  idCount = 0;
  db = openDatabase(':memory:');
  repo = createSkillRepo(db, { now: () => NOW, createId });
});

afterEach(() => {
  db.close();
});

/** 만들기에 성공한 스킬을 돌려준다 — 실패면 테스트를 깨뜨린다 */
function addSkill(name: string, body = '인원 말이 없으면 2명'): TSkill {
  const result = repo.create({ name, description: '', body });
  if (!result.ok) throw new Error(result.message);
  const skill = result.skillList.find((item) => item.name === name);
  if (!skill) throw new Error('만든 스킬이 없습니다');
  return skill;
}

/** 4000자 스킬 3개 — 켜진 본문 합 12000자(상한) */
function addFullSkillList(): TSkill[] {
  return ['하나', '둘', '셋'].map((name) => addSkill(name, 'a'.repeat(4000)));
}

describe('createSkillRepo — create·list', () => {
  it('create 하면 켜진 스킬 한 건이 담긴 목록을 돌려준다', () => {
    expect(repo.create({ name: '기본 인원', description: '설명', body: '2명' })).toEqual({
      ok: true,
      skillList: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          name: '기본 인원',
          description: '설명',
          body: '2명',
          isEnabled: true,
          createdAt: NOW.toISOString(),
          updatedAt: NOW.toISOString(),
        },
      ],
    });
  });

  it('같은 now 로 3개를 만들어도 list 는 만든 순서다', () => {
    addSkill('다');
    addSkill('가');
    addSkill('나');
    expect(repo.list().map((skill) => skill.name)).toEqual(['다', '가', '나']);
  });

  it('대소문자·앞뒤 공백만 다른 이름이면 CONFLICT 이다', () => {
    addSkill('Catch Table');
    expect(repo.create({ name: '  catch table ', description: '', body: '날짜 먼저' })).toEqual({
      ok: false,
      code: 'CONFLICT',
      message: SKILL_MESSAGE.duplicateName,
    });
  });

  it('31번째 스킬을 만들면 LIMIT 이다', () => {
    for (let index = 0; index < 30; index += 1) addSkill(`스킬 ${String(index)}`, 'a');
    expect(repo.create({ name: '스킬 30', description: '', body: 'a' })).toEqual({
      ok: false,
      code: 'LIMIT',
      message: SKILL_MESSAGE.tooMany,
    });
  });

  it('31번째 스킬 만들기가 거부되면 30개가 그대로 남는다', () => {
    for (let index = 0; index < 30; index += 1) addSkill(`스킬 ${String(index)}`, 'a');
    repo.create({ name: '스킬 30', description: '', body: 'a' });
    expect(repo.list()).toHaveLength(30);
  });

  it('켜진 본문 합이 12001자가 되게 만들면 LIMIT 이다', () => {
    addFullSkillList();
    expect(repo.create({ name: '넷', description: '', body: 'a' })).toEqual({
      ok: false,
      code: 'LIMIT',
      message: SKILL_MESSAGE.tooLong,
    });
  });

  it('켜진 본문 합이 정확히 12000자면 만들 수 있다', () => {
    addSkill('하나', 'a'.repeat(4000));
    addSkill('둘', 'a'.repeat(4000));
    expect(repo.create({ name: '셋', description: '', body: 'a'.repeat(4000) }).ok).toBe(true);
  });

  it('끈 스킬의 본문은 합에서 빠진다', () => {
    const [first] = addFullSkillList();
    repo.update({ id: first?.id ?? '', isEnabled: false });
    expect(repo.create({ name: '넷', description: '', body: 'a'.repeat(4000) }).ok).toBe(true);
  });
});

describe('createSkillRepo — update', () => {
  it('update 로 이름·설명·본문을 바꾸면 updatedAt 만 새 시각이 된다', () => {
    let now = NOW;
    repo = createSkillRepo(db, { now: () => now, createId });
    const skill = addSkill('기본 인원');
    now = new Date('2026-11-06T11:00:00.000Z');
    const result = repo.update({ id: skill.id, name: '인원', description: '설명', body: '3명' });
    expect(result.ok && result.skillList[0]).toEqual({
      ...skill,
      name: '인원',
      description: '설명',
      body: '3명',
      updatedAt: now.toISOString(),
    });
  });

  it('update 에서 자기 이름의 대소문자만 바꾸면 CONFLICT 가 아니다', () => {
    const skill = addSkill('catch');
    expect(repo.update({ id: skill.id, name: 'Catch' }).ok).toBe(true);
  });

  it('update 로 다른 스킬과 같은 이름을 주면 CONFLICT 이다', () => {
    addSkill('하나');
    const second = addSkill('둘');
    expect(repo.update({ id: second.id, name: '하나 ' })).toMatchObject({ ok: false, code: 'CONFLICT' });
  });

  it('끈 스킬을 켜서 합이 12001자가 되면 LIMIT 이다', () => {
    const [first] = addFullSkillList();
    repo.update({ id: first?.id ?? '', isEnabled: false });
    addSkill('넷', 'a');
    expect(repo.update({ id: first?.id ?? '', isEnabled: true })).toEqual({
      ok: false,
      code: 'LIMIT',
      message: SKILL_MESSAGE.tooLong,
    });
  });

  it('켜기가 LIMIT 으로 거부되면 스킬은 꺼진 채 남는다', () => {
    const [first] = addFullSkillList();
    repo.update({ id: first?.id ?? '', isEnabled: false });
    addSkill('넷', 'a');
    repo.update({ id: first?.id ?? '', isEnabled: true });
    expect(repo.list()[0]?.isEnabled).toBe(false);
  });

  it('켜진 스킬 본문을 늘려 합이 12001자가 되면 LIMIT 이다', () => {
    const [first] = addFullSkillList();
    expect(repo.update({ id: first?.id ?? '', body: 'b'.repeat(4001) })).toMatchObject({
      ok: false,
      code: 'LIMIT',
    });
  });

  it('꺼진 스킬은 본문이 합을 넘겨도 수정할 수 있다', () => {
    const [first] = addFullSkillList();
    expect(repo.update({ id: first?.id ?? '', isEnabled: false, body: 'b'.repeat(4000) }).ok).toBe(true);
  });

  it('없는 id 를 update 하면 NOT_FOUND 이다', () => {
    expect(repo.update({ id: MISSING_ID, isEnabled: false })).toEqual({
      ok: false,
      code: 'NOT_FOUND',
      message: SKILL_MESSAGE.notFound,
    });
  });
});

describe('createSkillRepo — remove·listEnabled', () => {
  it('remove 하면 지운 뒤의 목록을 돌려준다', () => {
    const first = addSkill('하나');
    addSkill('둘');
    const result = repo.remove(first.id);
    expect(result.ok && result.skillList.map((skill) => skill.name)).toEqual(['둘']);
  });

  it('없는 id 를 remove 하면 NOT_FOUND 이다', () => {
    expect(repo.remove(MISSING_ID)).toEqual({ ok: false, code: 'NOT_FOUND', message: SKILL_MESSAGE.notFound });
  });

  it('listEnabled 는 켜진 스킬만 만든 순서로 돌려준다', () => {
    addSkill('하나');
    const second = addSkill('둘');
    addSkill('셋');
    repo.update({ id: second.id, isEnabled: false });
    expect(repo.listEnabled().map((skill) => skill.name)).toEqual(['하나', '셋']);
  });
});
