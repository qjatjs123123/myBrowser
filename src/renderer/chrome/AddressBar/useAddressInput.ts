import { type KeyboardEvent, useState } from 'react';

import {
  buildSearchUrl,
  resolveAddressInput,
  SEARCH_ENGINE_LIST,
  type TAddressInput,
  type TSearchEngine,
} from '@shared/utils/addressInput';

interface IUseAddressInputParams {
  /** 활성 탭 URL — 편집 중이 아닐 때 보이는 값 (새 탭이면 빈 문자열) */
  url: string;
  /** 이동할 URL 이 정해졌을 때 — 이동 요청·실패 표시는 호출한 컴포넌트가 */
  onSubmit: (url: string) => void;
}

/**
 * [주소창 입력] 편집 중인 글자(draft)와 검색 선택 목록의 강조 줄을 든다 (FR-2·FR-3).
 * 편집 중이 아니면 탭 URL 을 그대로 보여주고, 입력이 URL 이 아니면 검색어(query)로 목록을 연다.
 */
export function useAddressInput({ url, onSubmit }: IUseAddressInputParams) {
  const [draft, setDraft] = useState<string | null>(null);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const resolved = draft === null ? null : resolveAddressInput(draft);
  const query = resolved?.kind === 'search' ? resolved.query : null;

  const submit = (target: string | null) => {
    if (target === null) return;
    setDraft(null);
    onSubmit(target);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const action = toKeyAction(event.key, query !== null);
    if (action === null) return;
    event.preventDefault();
    if (action === 'revert') setDraft(null);
    else if (action === 'submit') submit(toSubmitUrl(resolved, SEARCH_ENGINE_LIST[highlightIndex]?.engine));
    else setHighlightIndex((index) => moveIndex(index, action === 'down' ? 1 : -1));
  };

  return {
    value: draft ?? url,
    query,
    highlightIndex,
    change: (text: string) => {
      setDraft(text);
      setHighlightIndex(0);
    },
    revert: () => setDraft(null),
    selectEngine: (engine: TSearchEngine) => submit(toSubmitUrl(resolved, engine)),
    highlight: setHighlightIndex,
    handleKeyDown,
  };
}

type TKeyAction = 'submit' | 'revert' | 'up' | 'down';

/** 주소창이 처리하는 키 — ↑/↓ 는 검색 목록이 열려 있을 때만, 나머지 키는 null (입력 그대로) */
function toKeyAction(key: string, isListOpen: boolean): TKeyAction | null {
  if (key === 'Enter') return 'submit';
  if (key === 'Escape') return 'revert';
  if (!isListOpen) return null;
  if (key === 'ArrowUp') return 'up';
  if (key === 'ArrowDown') return 'down';
  return null;
}

/** 해석 결과로 이동할 URL — URL 이면 그대로, 검색어면 고른 엔진의 검색 URL, 빈 입력이면 null */
function toSubmitUrl(resolved: TAddressInput | null, engine: TSearchEngine | undefined): string | null {
  if (resolved === null) return null;
  if (resolved.kind === 'url') return resolved.url;
  return engine === undefined ? null : buildSearchUrl(engine, resolved.query);
}

/** 검색 선택 목록 안에서 강조 줄을 순환 이동한다 */
function moveIndex(index: number, delta: number): number {
  const length = SEARCH_ENGINE_LIST.length;
  return (index + delta + length) % length;
}
