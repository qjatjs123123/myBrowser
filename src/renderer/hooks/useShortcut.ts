import { useEffect, useEffectEvent } from 'react';

import type { TShortcutPressedEvent } from '@shared/ipc/shortcut';

import { getApi } from '@/lib/api';

/** main 이 판정해 renderer 에 넘긴 단축키 동작 */
export type TShortcutAction = TShortcutPressedEvent['action'];

/**
 * [단축키] shortcut:pressed 를 구독해 동작을 콜백으로 넘긴다 — 키 판정은 main 이 하고 renderer 는 키를 등록하지 않는다.
 * 콜백이 렌더마다 바뀌어도 다시 구독하지 않는다 (최신 콜백을 부른다).
 */
export function useShortcut(onAction: (action: TShortcutAction) => void): void {
  const handleAction = useEffectEvent(onAction);
  useEffect(() => getApi().shortcut.onPressed((event) => handleAction(event.action)), []);
}
