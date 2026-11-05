import { toast as sonnerToast } from 'sonner';

/** toast 를 그리는 자리 — main.tsx 에 1회 둔다 (sonner 를 이 파일 밖에서 import 하지 않게 다시 내보낸다) */
export { Toaster } from 'sonner';

/**
 * [toast] sonner 래퍼 — 컴포넌트는 sonner 를 직접 import 하지 않고 이 객체만 쓴다 (skills/desktop/error-toast).
 * message 는 사용자에게 보일 한국어 문장 (IPC 실패면 main 의 error.message 그대로).
 */
export const toast = {
  error: (message: string): void => {
    sonnerToast.error(message);
  },
  success: (message: string): void => {
    sonnerToast.success(message);
  },
};
