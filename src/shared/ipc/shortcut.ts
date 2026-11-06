import { z } from 'zod';

/**
 * [shortcut:pressed] main→renderer 이벤트 — main 이 판정한 단축키 중 renderer 가 처리할 것.
 * toggleSidebar = 에이전트 패널 열기/닫기 (spec 012, [에이전트] 버튼과 같음 — 승인 결정은 보내지 않는다)
 */
export const ShortcutPressedEventSchema = z.strictObject({
  action: z.enum(['focusAddressBar', 'focusNewTabSearch', 'toggleSidebar']),
});

export type TShortcutPressedEvent = z.infer<typeof ShortcutPressedEventSchema>;
