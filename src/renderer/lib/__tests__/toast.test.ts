import { toast as sonnerToast } from 'sonner';
import { describe, expect, it, vi } from 'vitest';

import { toast } from '../toast';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
  Toaster: () => null,
}));

describe('toast', () => {
  it('error 를 부르면 sonner 의 error 에 메시지를 그대로 넘긴다', () => {
    toast.error('탭을 찾을 수 없습니다');
    expect(sonnerToast.error).toHaveBeenCalledWith('탭을 찾을 수 없습니다');
  });

  it('success 를 부르면 sonner 의 success 에 메시지를 그대로 넘긴다', () => {
    toast.success('저장했습니다');
    expect(sonnerToast.success).toHaveBeenCalledWith('저장했습니다');
  });
});
