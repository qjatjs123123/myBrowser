import { z } from 'zod';

/** [press_key] 포커스된 요소에 키 입력 — Enter 는 가드가 포커스 대상으로 확정 패턴 검사(SR-1) */
export const PressKeyInputSchema = z.strictObject({
  key: z.enum(['Enter', 'Escape', 'Tab', 'ArrowDown', 'ArrowUp', 'PageDown', 'PageUp']),
});

export type TPressKeyInput = z.infer<typeof PressKeyInputSchema>;
