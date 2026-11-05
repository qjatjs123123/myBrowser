import { z } from 'zod';

/** [shortcut:pressed] main→renderer 이벤트 — main 이 판정한 단축키 중 renderer 가 처리할 것 */
export const ShortcutPressedEventSchema = z.strictObject({
  action: z.enum(['focusAddressBar', 'focusNewTabSearch']),
});

export type TShortcutPressedEvent = z.infer<typeof ShortcutPressedEventSchema>;
