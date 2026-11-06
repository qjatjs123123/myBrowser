import { useEffect, useState } from 'react';

import type { TIpcResult } from '@shared/ipc/result';
import type { TSkill, TSkillCreateRequest, TSkillListResponse, TSkillUpdateRequest } from '@shared/ipc/skills';

import { getApi } from '@/lib/api';
import { callSafely } from '@/lib/callSafely';

const LOAD_FAILED_MESSAGE = '스킬을 불러오지 못했습니다';
const SAVE_FAILED_MESSAGE = '스킬을 저장하지 못했습니다';
const DELETE_FAILED_MESSAGE = '스킬을 삭제하지 못했습니다';

export type TSkillsStatus = 'loading' | 'ready' | 'error';

/** 목록 읽기 실패 — 같은 문장이 다시 와도 새 객체라 toast effect 가 다시 돈다 */
export interface ISkillLoadError {
  message: string;
}

type TSkillListResult = TIpcResult<TSkillListResponse>;

/**
 * [스킬] skills:list|create|update|delete 호출 (spec 013 FR-6) — main 이 단일 출처.
 * 마운트(설정 보기를 열 때)마다 목록을 새로 읽고, 변경이 성공하면 main 이 돌려준 최신 목록으로 바꾼다.
 * 결과 봉투는 throw 하지 않고 돌려준다 (toast 는 호출한 컴포넌트가), IPC 자체가 throw 하면 INTERNAL 실패 봉투.
 */
export function useSkills() {
  const [skillList, setSkillList] = useState<TSkill[]>([]);
  const [status, setStatus] = useState<TSkillsStatus>('loading');
  const [loadError, setLoadError] = useState<ISkillLoadError | null>(null);
  const [loadCount, setLoadCount] = useState(0);

  useEffect(() => {
    let isCancelled = false;
    void callSafely(() => getApi().skills.list(), LOAD_FAILED_MESSAGE).then((result) => {
      if (isCancelled) return;
      if (result.ok) {
        setSkillList(result.data.skillList);
        setStatus('ready');
        setLoadError(null);
        return;
      }
      setStatus('error');
      setLoadError({ message: result.error.message });
    });
    return () => {
      isCancelled = true;
    };
  }, [loadCount]);

  /** 변경 결과 — 성공이면 응답 목록으로 바꾸고, 봉투는 그대로 돌려준다 */
  const applyResult = (result: TSkillListResult): TSkillListResult => {
    if (result.ok) {
      setSkillList(result.data.skillList);
      setStatus('ready');
    }
    return result;
  };

  const reload = () => {
    setStatus('loading');
    setLoadCount((count) => count + 1);
  };

  const create = async (request: TSkillCreateRequest): Promise<TSkillListResult> =>
    applyResult(await callSafely(() => getApi().skills.create(request), SAVE_FAILED_MESSAGE));

  const update = async (request: TSkillUpdateRequest): Promise<TSkillListResult> =>
    applyResult(await callSafely(() => getApi().skills.update(request), SAVE_FAILED_MESSAGE));

  const remove = async (id: string): Promise<TSkillListResult> =>
    applyResult(await callSafely(() => getApi().skills.delete({ id }), DELETE_FAILED_MESSAGE));

  return { skillList, status, loadError, reload, create, update, remove };
}
